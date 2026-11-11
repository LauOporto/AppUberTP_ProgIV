/**
 * Medición del Bloque 7 / tarea pesada (§4.7, §6.6, §11.2).
 *
 * En cada corrida, durante `duration` segundos y al mismo tiempo:
 *   - carga PESADA a ritmo fijo: POST /api/v1/rides/estimate (busca choferes cercanos) a `heavy-rate` pedidos/s;
 *   - carga LIVIANA medida: GET /health con `connections` conexiones a máxima velocidad.
 * Antes de cada corrida reinicia la ventana de /metrics y al final la lee (lag del event loop, ELU, memoria).
 *
 * El simulador de choferes (npm run simulate) se corre APARTE; este script solo mide.
 *
 * Uso:
 *   npm run bench -- --label "E1 ingenua" --runs 3 --duration 30 --output ../measurements/raw/e1.json
 *   npm run bench -- --help
 *
 * autocannon no informa p95 (trae p90 y p97,5); el enunciado pide p50/p95/p99, así que cada latencia
 * se registra en un histograma propio y los percentiles se calculan de ahí.
 */
import autocannon from 'autocannon';
import { parseArgs } from 'node:util';
import { createHistogram, type RecordableHistogram } from 'node:perf_hooks';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import os from 'node:os';

const { values: args } = parseArgs({
  options: {
    'base-url': { type: 'string', default: 'http://localhost:3000' },
    label: { type: 'string', default: 'sin etiqueta' },
    runs: { type: 'string', default: '3' },
    duration: { type: 'string', default: '30' },
    connections: { type: 'string', default: '10' },
    'heavy-rate': { type: 'string', default: '20' },
    'pause': { type: 'string', default: '5' },
    'min-index-entries': { type: 'string', default: '0' },
    email: { type: 'string', default: 'pasajero@utn.edu.ar' },
    password: { type: 'string', default: 'Password123!' },
    'metrics-token': { type: 'string' },
    output: { type: 'string' },
    help: { type: 'boolean', default: false }
  }
});

if (args.help) {
  console.log(`Medición (Bloque 7) — opciones:
  --base-url <url>            Servidor (default http://localhost:3000)
  --label <texto>             Nombre del escenario (p. ej. "E0 línea de base")
  --runs <n>                  Corridas (default 3)
  --duration <s>              Segundos por corrida (default 30, el mínimo que pide §7.2)
  --connections <n>           Conexiones contra /health (default 10)
  --heavy-rate <n>            Cotizaciones por segundo en paralelo (default 20; 0 = sin carga pesada)
  --pause <s>                 Pausa entre corridas (default 5)
  --min-index-entries <n>     Esperar a que el índice de ubicaciones tenga al menos n entradas antes de empezar
  --email / --password        Pasajero con el que se cotiza
  --metrics-token <token>     Si el servidor define METRICS_TOKEN
  --output <archivo.json>     Guardar todas las corridas`);
  process.exit(0);
}

const int = (name: string, raw: string | undefined, min = 1) => {
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min) {
    console.error(`Parámetro inválido --${name}: "${raw}"`);
    process.exit(1);
  }
  return value;
};

const BASE_URL = args['base-url']!.replace(/\/$/, '');
const RUNS = int('runs', args.runs);
const DURATION = int('duration', args.duration);
const CONNECTIONS = int('connections', args.connections);
const HEAVY_RATE = int('heavy-rate', args['heavy-rate'], 0);
const PAUSE = int('pause', args.pause, 0);
const MIN_INDEX_ENTRIES = int('min-index-entries', args['min-index-entries'], 0);
const metricsHeaders: Record<string, string> = args['metrics-token']
  ? { Authorization: `Bearer ${args['metrics-token']}` }
  : {};

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const round = (n: number, d = 2) => Number(n.toFixed(d));

interface ServerMetrics {
  windowSeconds: number;
  eventLoop: { lagMs: { p50: number; p99: number; max: number }; utilization: number };
  memoryMb: { rss: number; heapUsed: number };
  http: { requestsPerSecond: number; rateLimited: number };
  gauges: Record<string, number>;
}

async function metrics(path: '/metrics' | '/metrics/reset'): Promise<ServerMetrics> {
  const response = await fetch(`${BASE_URL}${path}`, {
    method: path === '/metrics' ? 'GET' : 'POST',
    headers: metricsHeaders
  });
  if (!response.ok) throw new Error(`${path} respondió ${response.status}`);
  const body = await response.json();
  return (path === '/metrics' ? body : body.previousWindow) as ServerMetrics;
}

async function login(): Promise<string> {
  const response = await fetch(`${BASE_URL}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: args.email, password: args.password })
  });
  if (response.status === 429) {
    throw new Error('Login con 429: levantá el servidor de medición con AUTH_RATE_LIMIT_MAX y RATE_LIMIT_MAX altos.');
  }
  if (!response.ok) throw new Error(`Login falló con ${response.status}`);
  return (await response.json()).data.tokens.accessToken;
}

interface LoadResult {
  requests: number;
  requestsPerSecond: number;
  latencyMs: { p50: number; p95: number; p99: number; max: number };
  non2xx: number;
  errors: number;
  timeouts: number;
}

function runLoad(options: autocannon.Options): Promise<LoadResult> {
  const histogram: RecordableHistogram = createHistogram();
  return new Promise((resolve, reject) => {
    const instance = autocannon(options, (error, result) => {
      if (error) return reject(error);
      const pct = (p: number) => (histogram.count ? round(histogram.percentile(p) / 1000) : 0);
      resolve({
        requests: result.requests.total,
        requestsPerSecond: round(result.requests.average, 1),
        latencyMs: { p50: pct(50), p95: pct(95), p99: pct(99), max: histogram.count ? round(histogram.max / 1000) : 0 },
        non2xx: result.non2xx,
        errors: result.errors,
        timeouts: result.timeouts
      });
    });
    // Latencia de CADA respuesta (ms) → histograma propio en microsegundos.
    instance.on('response', (_client: unknown, _status: number, _bytes: number, responseTimeMs: number) => {
      histogram.record(Math.max(1, Math.round(responseTimeMs * 1000)));
    });
  });
}

async function waitForIndex(): Promise<void> {
  if (MIN_INDEX_ENTRIES === 0) return;
  process.stdout.write(`[bench] Esperando ≥ ${MIN_INDEX_ENTRIES} entradas en el índice de ubicaciones`);
  for (;;) {
    const current = (await metrics('/metrics')).gauges?.locationIndexEntries ?? 0;
    if (current >= MIN_INDEX_ENTRIES) {
      console.log(` → ${current}`);
      return;
    }
    process.stdout.write('.');
    await sleep(5_000);
  }
}

async function main(): Promise<void> {
  console.log(
    `[bench] "${args.label}" · ${RUNS} corridas × ${DURATION} s · /health con ${CONNECTIONS} conexiones · ` +
      `${HEAVY_RATE} cotizaciones/s · ${BASE_URL}`
  );
  await waitForIndex();

  const runs = [];
  for (let run = 1; run <= RUNS; run++) {
    const token = await login();
    await metrics('/metrics/reset');
    const indexBefore = (await metrics('/metrics')).gauges?.locationIndexEntries ?? 0;

    const light = runLoad({ url: `${BASE_URL}/health`, connections: CONNECTIONS, duration: DURATION });
    const heavy =
      HEAVY_RATE > 0
        ? runLoad({
            url: `${BASE_URL}/api/v1/rides/estimate`,
            method: 'POST',
            connections: 10,
            overallRate: HEAVY_RATE,
            duration: DURATION,
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({
              originLocation: { latitude: -27.4514, longitude: -58.9866 },
              destinationLocation: { latitude: -27.4606, longitude: -58.9839 }
            })
          })
        : Promise.resolve(null);

    const [lightResult, heavyResult] = await Promise.all([light, heavy]);
    const server = await metrics('/metrics');

    const entry = {
      run,
      health: lightResult,
      estimate: heavyResult,
      server: {
        lagMs: server.eventLoop.lagMs,
        utilization: server.eventLoop.utilization,
        rssMb: server.memoryMb.rss,
        heapUsedMb: server.memoryMb.heapUsed,
        serverRequestsPerSecond: server.http.requestsPerSecond,
        rateLimited: server.http.rateLimited,
        locationIndexEntries: { before: indexBefore, after: server.gauges?.locationIndexEntries ?? 0 }
      }
    };
    runs.push(entry);

    console.log(
      `[bench] corrida ${run}: /health p50 ${lightResult.latencyMs.p50} p95 ${lightResult.latencyMs.p95} ` +
        `p99 ${lightResult.latencyMs.p99} ms · ${lightResult.requestsPerSecond} req/s` +
        (heavyResult
          ? ` | estimate p50 ${heavyResult.latencyMs.p50} p95 ${heavyResult.latencyMs.p95} p99 ${heavyResult.latencyMs.p99} ms`
          : '') +
        ` | lag p99 ${server.eventLoop.lagMs.p99} máx ${server.eventLoop.lagMs.max} ms · ELU ${server.eventLoop.utilization}` +
        ` · RSS ${server.memoryMb.rss} MB · índice ${entry.server.locationIndexEntries.before}→${entry.server.locationIndexEntries.after}` +
        (lightResult.non2xx || heavyResult?.non2xx ? ` · non2xx ${lightResult.non2xx}/${heavyResult?.non2xx ?? 0}` : '')
    );

    if (run < RUNS && PAUSE > 0) await sleep(PAUSE * 1000);
  }

  const report = {
    label: args.label,
    measuredAt: new Date().toISOString(),
    parameters: { baseUrl: BASE_URL, runs: RUNS, durationSeconds: DURATION, connections: CONNECTIONS, heavyRate: HEAVY_RATE },
    environment: {
      node: process.version,
      platform: `${os.type()} ${os.release()} (${os.arch()})`,
      cpu: os.cpus()[0]?.model,
      cores: os.cpus().length,
      totalMemoryGb: round(os.totalmem() / 1024 ** 3, 1)
    },
    runs
  };

  if (args.output) {
    await mkdir(dirname(args.output), { recursive: true });
    await writeFile(args.output, JSON.stringify(report, null, 2));
    console.log(`[bench] Guardado en ${args.output}`);
  }
}

main().catch(error => {
  console.error(`[bench] ${(error as Error).message}`);
  process.exit(1);
});
