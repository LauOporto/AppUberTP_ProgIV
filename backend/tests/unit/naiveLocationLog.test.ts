import { describe, it, expect, beforeEach } from 'vitest';
import { NaiveLocationLog } from '../../src/infrastructure/location/NaiveLocationLog.js';

const UTN = { latitude: -27.4514, longitude: -58.9866 };
const NOW = new Date('2026-11-11T12:00:00Z');
const secondsAgo = (s: number) => new Date(NOW.getTime() - s * 1000);
/** Punto a `meters` metros al norte de UTN (1° de latitud ≈ 111 195 m). */
const north = (meters: number) => ({ latitude: UTN.latitude + meters / 111_195, longitude: UTN.longitude });

const query = { origin: UTN, radiusMeters: 5_000, limit: 10, maxAgeMs: 30_000, now: NOW };

describe('Índice de ubicaciones — versión ingenua (HT-02)', () => {
  let index: NaiveLocationLog;
  beforeEach(() => {
    index = new NaiveLocationLog();
  });

  it('devuelve los choferes cercanos ordenados por distancia', async () => {
    await index.record('lejos', north(3_000), secondsAgo(1));
    await index.record('cerca', north(500), secondsAgo(1));
    await index.record('medio', north(1_500), secondsAgo(1));

    const result = await index.findNearby(query);

    expect(result.map(d => d.driverId)).toEqual(['cerca', 'medio', 'lejos']);
    expect(result[0].distanceMeters).toBeCloseTo(500, -1);
  });

  it('usa la ÚLTIMA posición reportada de cada chofer, aunque el log tenga muchas', async () => {
    await index.record('c1', north(4_000), secondsAgo(10));
    await index.record('c1', north(200), secondsAgo(2));

    const result = await index.findNearby(query);

    expect(result).toHaveLength(1);
    expect(result[0].distanceMeters).toBeCloseTo(200, -1);
    expect(index.size()).toBe(2); // la versión ingenua guarda todo: nunca purga
  });

  it('descarta a los que están fuera del radio y a los que dejaron de reportar', async () => {
    await index.record('fuera-de-radio', north(6_000), secondsAgo(1));
    await index.record('sin-reportar', north(100), secondsAgo(60));
    await index.record('ok', north(100), secondsAgo(5));

    expect((await index.findNearby(query)).map(d => d.driverId)).toEqual(['ok']);
  });

  it('respeta el límite de resultados', async () => {
    for (let i = 0; i < 20; i++) await index.record(`c${i}`, north(100 + i * 10), secondsAgo(1));
    expect(await index.findNearby({ ...query, limit: 5 })).toHaveLength(5);
  });
});
