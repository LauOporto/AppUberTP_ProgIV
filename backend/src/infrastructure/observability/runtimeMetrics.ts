import { monitorEventLoopDelay, performance, type EventLoopUtilization, type IntervalHistogram } from 'perf_hooks';
import type { NextFunction, Request, Response } from 'express';

/**
 * Métricas del proceso para la medición del Bloque 7 (enunciado §3.3, §4.7, §11.2).
 *
 * El lag del event loop se mide DESDE ADENTRO del servidor con `monitorEventLoopDelay`:
 * un temporizador que debería dispararse cada `resolutionMs`; la demora con que realmente se dispara
 * es el lag. Si el hilo está ocupado con código sincrónico, el temporizador se atrasa y el lag sube.
 *
 * Cosas medidas al probarlo (Windows, Node 26):
 * - En reposo el lag no es ~0 sino ~11–16 ms: es la granularidad del temporizador de Windows (~15,6 ms).
 *   En Linux/Docker el piso es mucho menor. Hay que anotarlo en el entorno del informe de mediciones.
 * - El histograma mide la demora ENTRE muestras: un bloqueo que ocurre exactamente en el mismo tick que
 *   `reset()` no se registra. Por eso también se informa la utilización del event loop (ELU), que no tiene
 *   ese punto ciego: es la fracción del tiempo en que el hilo estuvo ocupado (0 = ocioso, 1 = saturado).
 */

const NS_PER_MS = 1e6;
const BYTES_PER_MB = 1024 * 1024;
const round = (value: number, decimals = 2) => Number(value.toFixed(decimals));

export interface RuntimeSnapshot {
  windowSeconds: number;
  eventLoop: {
    samples: number;
    lagMs: { min: number; mean: number; p50: number; p90: number; p99: number; max: number };
    utilization: number;
  };
  http: {
    requests: number;
    requestsPerSecond: number;
    byStatus: Record<'2xx' | '3xx' | '4xx' | '5xx', number>;
    rateLimited: number;
  };
  memoryMb: { rss: number; heapUsed: number; heapTotal: number; external: number };
  /** Valores puntuales registrados por otros módulos (p. ej. tamaño del índice de ubicaciones). */
  gauges: Record<string, number>;
  uptimeSeconds: number;
}

export class RuntimeMetrics {
  private histogram: IntervalHistogram | null = null;
  private utilizationStart: EventLoopUtilization = performance.eventLoopUtilization();
  private windowStart = performance.now();
  private requests = 0;
  private byStatus = { '2xx': 0, '3xx': 0, '4xx': 0, '5xx': 0 };
  private rateLimited = 0;
  private readonly gauges = new Map<string, () => number>();

  constructor(private readonly resolutionMs = 10) {}

  /** Idempotente: llamarlo dos veces no crea dos monitores. */
  start(): void {
    if (this.histogram) return;
    this.histogram = monitorEventLoopDelay({ resolution: this.resolutionMs });
    this.histogram.enable();
    this.reset();
  }

  stop(): void {
    this.histogram?.disable();
    this.histogram = null;
  }

  get isRunning(): boolean {
    return this.histogram !== null;
  }

  registerGauge(name: string, read: () => number): void {
    this.gauges.set(name, read);
  }

  /** Empieza una ventana de medición nueva (se llama antes de cada corrida de carga). */
  reset(): void {
    this.histogram?.reset();
    this.utilizationStart = performance.eventLoopUtilization();
    this.windowStart = performance.now();
    this.requests = 0;
    this.byStatus = { '2xx': 0, '3xx': 0, '4xx': 0, '5xx': 0 };
    this.rateLimited = 0;
  }

  /** Middleware: cuenta pedidos y respuestas por clase de status en la ventana actual. */
  countRequests = (_req: Request, res: Response, next: NextFunction): void => {
    res.on('finish', () => {
      this.requests++;
      const statusClass = `${Math.floor(res.statusCode / 100)}xx` as keyof typeof this.byStatus;
      if (statusClass in this.byStatus) this.byStatus[statusClass]++;
      if (res.statusCode === 429) this.rateLimited++;
    });
    next();
  };

  snapshot(): RuntimeSnapshot {
    const windowSeconds = Math.max((performance.now() - this.windowStart) / 1000, 0.001);
    const histogram = this.histogram;
    const hasSamples = !!histogram && histogram.count > 0;
    const lag = (value: number) => (hasSamples ? round(value / NS_PER_MS) : 0);
    const memory = process.memoryUsage();

    return {
      windowSeconds: round(windowSeconds),
      eventLoop: {
        samples: histogram?.count ?? 0,
        lagMs: {
          min: lag(histogram?.min ?? 0),
          mean: lag(histogram?.mean ?? 0),
          p50: lag(histogram?.percentile(50) ?? 0),
          p90: lag(histogram?.percentile(90) ?? 0),
          p99: lag(histogram?.percentile(99) ?? 0),
          max: lag(histogram?.max ?? 0)
        },
        utilization: round(performance.eventLoopUtilization(this.utilizationStart).utilization, 3)
      },
      http: {
        requests: this.requests,
        requestsPerSecond: round(this.requests / windowSeconds, 1),
        byStatus: { ...this.byStatus },
        rateLimited: this.rateLimited
      },
      memoryMb: {
        rss: round(memory.rss / BYTES_PER_MB, 1),
        heapUsed: round(memory.heapUsed / BYTES_PER_MB, 1),
        heapTotal: round(memory.heapTotal / BYTES_PER_MB, 1),
        external: round(memory.external / BYTES_PER_MB, 1)
      },
      gauges: Object.fromEntries([...this.gauges].map(([name, read]) => [name, read()])),
      uptimeSeconds: Math.round(process.uptime())
    };
  }
}

/** Instancia única del proceso (igual que el logger). Se arranca en server.ts. */
export const runtimeMetrics = new RuntimeMetrics();
