/**
 * Simulador de choferes (tarea pesada, enunciado §6.6 — HT-01).
 *
 * Representa N choferes (por defecto 500) que reportan su ubicación cada `interval` ms (por defecto 2000)
 * de forma sostenida durante `duration` segundos, como lo haría la app del celular.
 *
 * Uso:
 *   npm run simulate -- --drivers 500 --interval 2000 --duration 300
 *   npm run simulate -- --help
 *
 * Qué mide del lado del CLIENTE: pedidos/s logrados, latencia p50/p95/p99 del reporte de ubicación,
 * errores por status y "atrasos" (el chofer debía reportar pero su pedido anterior todavía no había vuelto).
 * Del lado del SERVIDOR lee /metrics: lag del event loop, utilización, memoria y pedidos/s.
 *
 * Diseño:
 * - Los reportes se escalonan dentro del intervalo (chofer i arranca en i/N × intervalo) para que la carga
 *   sea pareja (~N/intervalo pedidos por segundo) y no 500 pedidos juntos cada 2 s.
 * - Cada chofer tiene como máximo UN pedido en vuelo: si el servidor se atrasa, el tick se cuenta como atraso
 *   en lugar de acumular pedidos sin límite (eso mediría al simulador, no al servidor).
 */
import { parseArgs } from 'node:util';
import { createHistogram, performance, type RecordableHistogram } from 'node:perf_hooks';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

// ───────────────────────────── Parámetros ─────────────────────────────

const { values: args } = parseArgs({
  options: {
    'base-url': { type: 'string', default: 'http://localhost:3000' },
    drivers: { type: 'string', default: '500' },
    interval: { type: 'string', default: '2000' },
    duration: { type: 'string', default: '120' },
    center: { type: 'string', default: '-27.4514,-58.9866' }, // UTN FRRe, Resistencia
    'radius-km': { type: 'string', default: '5' },
    'register-concurrency': { type: 'string', default: '10' },
    'report-every': { type: 'string', default: '10' },
    'metrics-token': { type: 'string' },
    cache: { type: 'string', default: '.simulator/drivers.json' },
    fresh: { type: 'boolean', default: false },
    output: { type: 'string' },
    help: { type: 'boolean', default: false }
  }
});

if (args.help) {
  console.log(`Simulador de choferes — opciones:
  --base-url <url>             Servidor (default http://localhost:3000)
  --drivers <n>                Cantidad de choferes (default 500)
  --interval <ms>              Cada cuánto reporta cada chofer (default 2000)
  --duration <s>               Duración de la simulación (default 120)
  --center <lat,lng>           Centro de la zona (default UTN FRRe)
  --radius-km <km>             Radio de la zona (default 5)
  --register-concurrency <n>   Registros en paralelo al preparar los choferes (default 10)
  --report-every <s>           Cada cuánto imprimir un reporte (default 10)
  --metrics-token <token>      Token para /metrics si el servidor define METRICS_TOKEN
  --cache <archivo>            Dónde guardar las credenciales de los choferes (default .simulator/drivers.json)
  --fresh                      Ignorar el caché y registrar choferes nuevos
  --output <archivo.json>      Guardar el resumen final en JSON`);
  process.exit(0);
}

const toPositiveInt = (name: string, raw: string | undefined): number => {
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    console.error(`Parámetro inválido --${name}: "${raw}" (se espera un entero positivo)`);
    process.exit(1);
  }
  return value;
};

const BASE_URL = args['base-url']!.replace(/\/$/, '');
const API = `${BASE_URL}/api/v1`;
const DRIVERS = toPositiveInt('drivers', args.drivers);
const INTERVAL_MS = toPositiveInt('interval', args.interval);
const DURATION_S = toPositiveInt('duration', args.duration);
const REGISTER_CONCURRENCY = toPositiveInt('register-concurrency', args['register-concurrency']);
const REPORT_EVERY_S = toPositiveInt('report-every', args['report-every']);
const RADIUS_M = Number(args['radius-km']) * 1000;
const [CENTER_LAT, CENTER_LNG] = args.center!.split(',').map(Number);
const PASSWORD = 'Simulador123!';

if (![CENTER_LAT, CENTER_LNG, RADIUS_M].every(Number.isFinite)) {
  console.error('Parámetros --center o --radius-km inválidos');
  process.exit(1);
}

// ───────────────────────────── Utilidades ─────────────────────────────

interface SimDriver {
  index: number;
  email: string;
  token: string;
  lat: number;
  lng: number;
  headingRad: number;
  inFlight: boolean;
}

class AbortSimulation extends Error {}

const METERS_PER_DEG_LAT = 111_195;
const metersPerDegLng = (lat: number) => METERS_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180);
const fmt = (n: number, decimals = 1) => n.toFixed(decimals);

function randomPointInZone(): { lat: number; lng: number } {
  const distance = RADIUS_M * Math.sqrt(Math.random());
  const angle = Math.random() * 2 * Math.PI;
  return {
    lat: CENTER_LAT + (distance * Math.cos(angle)) / METERS_PER_DEG_LAT,
    lng: CENTER_LNG + (distance * Math.sin(angle)) / metersPerDegLng(CENTER_LAT)
  };
}

/** Paseo aleatorio a ~30 km/h; si se sale de la zona, gira hacia el centro. */
function move(driver: SimDriver): void {
  const metersPerTick = (30_000 / 3600) * (INTERVAL_MS / 1000);
  driver.headingRad += (Math.random() - 0.5) * 0.8;
  driver.lat += (metersPerTick * Math.cos(driver.headingRad)) / METERS_PER_DEG_LAT;
  driver.lng += (metersPerTick * Math.sin(driver.headingRad)) / metersPerDegLng(driver.lat);

  const dy = (driver.lat - CENTER_LAT) * METERS_PER_DEG_LAT;
  const dx = (driver.lng - CENTER_LNG) * metersPerDegLng(driver.lat);
  if (Math.hypot(dx, dy) > RADIUS_M) {
    driver.headingRad = Math.atan2(-dx, -dy);
  }
}

async function postJson(url: string, body: unknown, token?: string): Promise<{ status: number; json: any }> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body)
  });
  const text = await response.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text.slice(0, 200) };
  }
  return { status: response.status, json };
}

/** Ejecuta `task` para cada elemento con a lo sumo `concurrency` en paralelo. */
async function forEachLimited<T>(items: T[], concurrency: number, task: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (next < items.length) {
      const item = items[next++];
      await task(item);
    }
  });
  await Promise.all(workers);
}

function explainRateLimit(where: string): never {
  throw new AbortSimulation(
    `El servidor respondió 429 (rate limit) en ${where}.\n` +
      'Todo el simulador sale de una sola IP, así que el límite por IP lo frena. Para medir, levantá el servidor con\n' +
      'límites altos SOLO en el entorno de medición, por ejemplo:\n' +
      '  RATE_LIMIT_MAX=10000000 AUTH_RATE_LIMIT_MAX=100000 npm run dev:backend\n' +
      'y anotalo en el entorno del informe (docs/mediciones.md).'
  );
}

// ───────────────────────────── Métricas del servidor ─────────────────────────────

interface ServerSnapshot {
  windowSeconds: number;
  eventLoop: { lagMs: { p50: number; p99: number; max: number }; utilization: number };
  http: { requestsPerSecond: number; rateLimited: number };
  memoryMb: { rss: number; heapUsed: number };
}

const metricsHeaders = args['metrics-token'] ? { Authorization: `Bearer ${args['metrics-token']}` } : undefined;
let serverMetricsAvailable = true;

async function readServerMetrics(): Promise<ServerSnapshot | null> {
  if (!serverMetricsAvailable) return null;
  try {
    const response = await fetch(`${BASE_URL}/metrics`, { headers: metricsHeaders });
    if (!response.ok) {
      serverMetricsAvailable = false;
      console.warn(`[sim] /metrics respondió ${response.status}: se sigue sin métricas del servidor.`);
      return null;
    }
    return (await response.json()) as ServerSnapshot;
  } catch {
    return null;
  }
}

async function resetServerMetrics(): Promise<void> {
  try {
    const response = await fetch(`${BASE_URL}/metrics/reset`, { method: 'POST', headers: metricsHeaders });
    if (!response.ok) serverMetricsAvailable = false;
  } catch {
    serverMetricsAvailable = false;
  }
}

// ───────────────────────────── Preparación de choferes ─────────────────────────────

interface CachedCredentials {
  baseUrl: string;
  drivers: Array<{ email: string; token: string }>;
}

async function loadCache(): Promise<CachedCredentials | null> {
  if (args.fresh) return null;
  try {
    const cached = JSON.parse(await readFile(args.cache!, 'utf8')) as CachedCredentials;
    if (cached.baseUrl !== BASE_URL || cached.drivers.length < DRIVERS) return null;

    // Si el servidor se reinició (datos en memoria) o el token venció, el caché no sirve.
    const probe = await postJson(`${API}/driver/online`, { isOnline: true }, cached.drivers[0].token);
    return probe.status < 400 ? cached : null;
  } catch {
    return null;
  }
}

async function registerDrivers(): Promise<Array<{ email: string; token: string }>> {
  const runId = Date.now().toString(36);
  const result: Array<{ email: string; token: string }> = new Array(DRIVERS);
  let done = 0;
  const started = performance.now();

  console.log(`[sim] Registrando ${DRIVERS} choferes (${REGISTER_CONCURRENCY} en paralelo)...`);
  await forEachLimited([...Array(DRIVERS).keys()], REGISTER_CONCURRENCY, async index => {
    const email = `sim.${runId}.${index}@sim.local`;
    const { status, json } = await postJson(`${API}/auth/register/driver`, {
      name: `Chofer simulado ${index}`,
      email,
      password: PASSWORD,
      phone: '3624000000',
      vehicleModel: 'Simulado',
      vehiclePlate: `SIM${index}`,
      vehicleColor: 'Gris',
      licenseNumber: `SIM-${runId}-${index}`
    });
    if (status === 429) explainRateLimit('el registro de choferes');
    if (status !== 201) {
      throw new AbortSimulation(`Registro del chofer ${index} falló con ${status}: ${JSON.stringify(json)}`);
    }
    result[index] = { email, token: json.data.tokens.accessToken };
    if (++done % 50 === 0 || done === DRIVERS) process.stdout.write(`\r[sim]   ${done}/${DRIVERS}`);
  });

  const seconds = (performance.now() - started) / 1000;
  console.log(`\n[sim] Registro terminado en ${fmt(seconds)} s (${fmt(DRIVERS / seconds)} registros/s).`);
  return result;
}

async function prepareDrivers(): Promise<SimDriver[]> {
  const cached = await loadCache();
  let credentials: Array<{ email: string; token: string }>;

  if (cached) {
    console.log(`[sim] Reutilizando ${DRIVERS} choferes del caché ${args.cache}`);
    credentials = cached.drivers.slice(0, DRIVERS);
  } else {
    credentials = await registerDrivers();
    await mkdir(dirname(args.cache!), { recursive: true });
    await writeFile(args.cache!, JSON.stringify({ baseUrl: BASE_URL, drivers: credentials } satisfies CachedCredentials));
  }

  console.log('[sim] Poniendo a los choferes en línea...');
  await forEachLimited(credentials, 50, async ({ token }) => {
    const { status } = await postJson(`${API}/driver/online`, { isOnline: true }, token);
    if (status === 429) explainRateLimit('el paso "en línea"');
    if (status >= 400) throw new AbortSimulation(`No se pudo poner en línea a un chofer (status ${status})`);
  });

  return credentials.map(({ email, token }, index) => ({
    index,
    email,
    token,
    ...randomPointInZone(),
    headingRad: Math.random() * 2 * Math.PI,
    inFlight: false
  }));
}

// ───────────────────────────── Simulación ─────────────────────────────

interface Counters {
  sent: number;
  ok: number;
  overruns: number;
  networkErrors: number;
  byStatus: Map<number, number>;
}

const newCounters = (): Counters => ({ sent: 0, ok: 0, overruns: 0, networkErrors: 0, byStatus: new Map() });
const newHistogram = (): RecordableHistogram => createHistogram();

const total = newCounters();
let windowCounters = newCounters();
const totalLatency = newHistogram(); // microsegundos
let windowLatency = newHistogram();

function record(counters: Counters, status: number | null): void {
  if (status === null) counters.networkErrors++;
  else {
    counters.byStatus.set(status, (counters.byStatus.get(status) ?? 0) + 1);
    if (status < 400) counters.ok++;
  }
}

async function sendLocation(driver: SimDriver): Promise<void> {
  if (driver.inFlight) {
    total.overruns++;
    windowCounters.overruns++;
    return;
  }
  driver.inFlight = true;
  move(driver);
  total.sent++;
  windowCounters.sent++;

  const started = performance.now();
  let status: number | null = null;
  try {
    const response = await fetch(`${API}/driver/location`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${driver.token}` },
      body: JSON.stringify({ latitude: driver.lat, longitude: driver.lng })
    });
    status = response.status;
    await response.arrayBuffer(); // consumir el cuerpo libera la conexión para reusarla
  } catch {
    status = null;
  } finally {
    const micros = Math.max(1, Math.round((performance.now() - started) * 1000));
    totalLatency.record(micros);
    windowLatency.record(micros);
    record(total, status);
    record(windowCounters, status);
    driver.inFlight = false;
  }
}

const ms = (histogram: RecordableHistogram, percentile: number) =>
  histogram.count === 0 ? 0 : histogram.percentile(percentile) / 1000;

function statusSummary(counters: Counters): string {
  const parts = [...counters.byStatus.entries()].sort(([a], [b]) => a - b).map(([s, n]) => `${s}:${n}`);
  if (counters.networkErrors) parts.push(`red:${counters.networkErrors}`);
  return parts.join(' ') || '-';
}

async function printReport(elapsedS: number, windowS: number): Promise<void> {
  const server = await readServerMetrics();
  const serverPart = server
    ? ` | servidor: lag p99 ${fmt(server.eventLoop.lagMs.p99)} ms, máx ${fmt(server.eventLoop.lagMs.max)} ms, ` +
      `ELU ${fmt(server.eventLoop.utilization * 100, 0)}%, RSS ${fmt(server.memoryMb.rss, 0)} MB`
    : '';
  console.log(
    `[${fmt(elapsedS, 0).padStart(4)} s] ${fmt(windowCounters.sent / windowS).padStart(6)} pedidos/s | ` +
      `latencia p50 ${fmt(ms(windowLatency, 50))} p95 ${fmt(ms(windowLatency, 95))} p99 ${fmt(ms(windowLatency, 99))} ms | ` +
      `status ${statusSummary(windowCounters)} | atrasos ${windowCounters.overruns}${serverPart}`
  );
  windowCounters = newCounters();
  windowLatency = newHistogram();
}

async function main(): Promise<void> {
  console.log(
    `[sim] ${DRIVERS} choferes · cada ${INTERVAL_MS} ms · ${DURATION_S} s · objetivo ${fmt(
      (DRIVERS * 1000) / INTERVAL_MS
    )} pedidos/s · ${BASE_URL}`
  );

  // La preparación (registro con bcrypt) también carga al servidor: se mide en su propia ventana.
  await resetServerMetrics();
  const drivers = await prepareDrivers();
  const preparation = await readServerMetrics();
  if (preparation) {
    console.log(
      `[sim] Servidor durante la preparación: lag p99 ${fmt(preparation.eventLoop.lagMs.p99)} ms, ` +
        `máx ${fmt(preparation.eventLoop.lagMs.max)} ms, ELU ${fmt(preparation.eventLoop.utilization * 100, 0)}%`
    );
  }
  await resetServerMetrics();
  if (!serverMetricsAvailable) {
    console.warn('[sim] /metrics no disponible (¿otra máquina sin METRICS_TOKEN?): se mide solo del lado del cliente.');
  }

  console.log('[sim] Simulación en marcha (Ctrl+C para cortar antes y ver el resumen)\n');
  const started = performance.now();
  const timers: NodeJS.Timeout[] = [];

  drivers.forEach(driver => {
    const offset = (driver.index / DRIVERS) * INTERVAL_MS;
    timers.push(
      setTimeout(() => {
        void sendLocation(driver);
        timers.push(setInterval(() => void sendLocation(driver), INTERVAL_MS));
      }, offset)
    );
  });

  let lastReport = started;
  const reporter = setInterval(() => {
    const now = performance.now();
    void printReport((now - started) / 1000, (now - lastReport) / 1000);
    lastReport = now;
  }, REPORT_EVERY_S * 1000);

  await new Promise<void>(resolve => {
    const finish = setTimeout(resolve, DURATION_S * 1000);
    process.once('SIGINT', () => {
      clearTimeout(finish);
      console.log('\n[sim] Cortado por el usuario.');
      resolve();
    });
  });

  clearInterval(reporter);
  timers.forEach(timer => clearTimeout(timer));

  // Esperar (como máximo 5 s) a que vuelvan los pedidos en vuelo.
  const waitUntil = performance.now() + 5_000;
  while (drivers.some(d => d.inFlight) && performance.now() < waitUntil) {
    await new Promise(resolve => setTimeout(resolve, 50));
  }

  const elapsedS = (performance.now() - started) / 1000;
  const server = await readServerMetrics();
  const summary = {
    parameters: { baseUrl: BASE_URL, drivers: DRIVERS, intervalMs: INTERVAL_MS, durationSeconds: DURATION_S },
    client: {
      elapsedSeconds: Number(fmt(elapsedS, 2)),
      targetRequestsPerSecond: Number(fmt((DRIVERS * 1000) / INTERVAL_MS)),
      achievedRequestsPerSecond: Number(fmt(total.sent / elapsedS)),
      sent: total.sent,
      ok: total.ok,
      overruns: total.overruns,
      byStatus: Object.fromEntries(total.byStatus),
      networkErrors: total.networkErrors,
      latencyMs: {
        p50: Number(fmt(ms(totalLatency, 50), 2)),
        p95: Number(fmt(ms(totalLatency, 95), 2)),
        p99: Number(fmt(ms(totalLatency, 99), 2)),
        max: Number(fmt(totalLatency.count ? totalLatency.max / 1000 : 0, 2))
      }
    },
    server
  };

  console.log('\n[sim] ───── Resumen ─────');
  console.log(JSON.stringify(summary, null, 2));
  if (args.output) {
    await mkdir(dirname(args.output), { recursive: true });
    await writeFile(args.output, JSON.stringify(summary, null, 2));
    console.log(`[sim] Resumen guardado en ${args.output}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(`\n[sim] ${error instanceof AbortSimulation ? error.message : (error as Error).stack}`);
    process.exit(1);
  });
