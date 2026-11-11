import { describe, it, expect, afterEach } from 'vitest';
import request from 'supertest';
import { RuntimeMetrics } from '../../src/infrastructure/observability/runtimeMetrics.js';
import { isMetricsRequestAllowed } from '../../src/infrastructure/observability/metricsAccess.js';
import app from '../../src/app.js';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/** Bloquea el hilo de JavaScript a propósito: nada más puede ejecutarse mientras dura. */
function blockEventLoop(ms: number): void {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    // espera activa
  }
}

describe('Monitor del event loop (B7-06)', () => {
  const metrics = new RuntimeMetrics(10);
  afterEach(() => metrics.stop());

  it('detecta un bloqueo del hilo: el lag máximo refleja los ~200 ms bloqueados', async () => {
    metrics.start();
    await sleep(50); // el monitor ya tomó muestras: el bloqueo no cae en el mismo tick que el reset

    setTimeout(() => blockEventLoop(200), 0);
    await sleep(300);

    const { eventLoop } = metrics.snapshot();
    expect(eventLoop.lagMs.max).toBeGreaterThanOrEqual(180);
    expect(eventLoop.utilization).toBeGreaterThan(0.4); // ~200 ms ocupados de ~350 ms de ventana
  });

  it('en reposo el lag máximo queda lejos de un bloqueo', async () => {
    metrics.start();
    await sleep(200);

    // Piso de ~16 ms en Windows por la granularidad del temporizador; damos margen para máquinas cargadas.
    expect(metrics.snapshot().eventLoop.lagMs.max).toBeLessThan(100);
  });

  it('reset() empieza una ventana nueva y descarta el pico anterior', async () => {
    metrics.start();
    await sleep(30);
    setTimeout(() => blockEventLoop(150), 0);
    await sleep(200);
    expect(metrics.snapshot().eventLoop.lagMs.max).toBeGreaterThanOrEqual(130);

    metrics.reset();
    await sleep(100);
    expect(metrics.snapshot().eventLoop.lagMs.max).toBeLessThan(100);
  });

  it('sin muestras informa ceros en lugar del valor centinela del histograma', () => {
    metrics.start();
    metrics.reset();
    const { eventLoop } = metrics.snapshot();
    expect(eventLoop.samples).toBe(0);
    expect(eventLoop.lagMs.min).toBe(0);
  });
});

describe('Acceso a /metrics', () => {
  it('sin METRICS_TOKEN solo se permite desde loopback', () => {
    for (const ip of ['127.0.0.1', '::1', '::ffff:127.0.0.1']) {
      expect(isMetricsRequestAllowed({ ip, authorizationHeader: undefined, configuredToken: undefined })).toBe(true);
    }
    expect(isMetricsRequestAllowed({ ip: '192.168.0.10', authorizationHeader: undefined, configuredToken: undefined })).toBe(false);
    expect(isMetricsRequestAllowed({ ip: undefined, authorizationHeader: undefined, configuredToken: undefined })).toBe(false);
  });

  it('con METRICS_TOKEN exige el token exacto, aunque el pedido venga de loopback', () => {
    const token = 'token-de-metricas-largo';
    expect(isMetricsRequestAllowed({ ip: '127.0.0.1', authorizationHeader: undefined, configuredToken: token })).toBe(false);
    expect(isMetricsRequestAllowed({ ip: '127.0.0.1', authorizationHeader: 'Bearer otro-token-cualquiera', configuredToken: token })).toBe(false);
    expect(isMetricsRequestAllowed({ ip: '10.0.0.5', authorizationHeader: `Bearer ${token}`, configuredToken: token })).toBe(true);
  });
});

describe('GET /metrics y POST /metrics/reset', () => {
  it('devuelve lag del event loop, utilización, memoria y pedidos de la ventana', async () => {
    await request(app).post('/metrics/reset').expect(200);
    await request(app).get('/health').expect(200);
    await request(app).get('/ruta-que-no-existe').expect(404);

    const res = await request(app).get('/metrics').expect(200);

    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body.eventLoop.lagMs).toEqual(
      expect.objectContaining({ p50: expect.any(Number), p99: expect.any(Number), max: expect.any(Number) })
    );
    expect(res.body.memoryMb.rss).toBeGreaterThan(0);
    // /health (2xx) y la ruta inexistente (4xx); el propio GET /metrics se cuenta al terminar, después del snapshot.
    expect(res.body.http.byStatus['2xx']).toBeGreaterThanOrEqual(1);
    expect(res.body.http.byStatus['4xx']).toBeGreaterThanOrEqual(1);
  });
});
