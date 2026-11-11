import { describe, it, expect } from 'vitest';
import {
  FareParams,
  calculateFare,
  estimateDurationSeconds,
  haversineDistanceMeters
} from '../../src/domain/rides/fare.js';
import { DomainError } from '../../src/domain/errors/DomainError.js';

/** Parámetros de ejemplo en centavos: base $1200, $350/km, $80/min, mínimo $2000, máximo 100 km. */
const PARAMS: FareParams = {
  baseCents: 120_000,
  perKmCents: 35_000,
  perMinuteCents: 8_000,
  minimumFareCents: 200_000,
  maxDistanceMeters: 100_000
};

describe('Cálculo de tarifa (TAR-01, TAR-02, TAR-07)', () => {
  it('caso concreto: 2,8 km y 10 minutos = $2980,00', () => {
    const fare = calculateFare({ distanceMeters: 2_800, durationSeconds: 600 }, PARAMS);

    expect(fare).toEqual({
      baseCents: 120_000,
      distanceCents: 98_000, // 2,8 km × $350
      timeCents: 80_000, // 10 min × $80
      subtotalCents: 298_000,
      minimumApplied: false,
      totalCents: 298_000
    });
  });

  it('borde: viaje de distancia cero cobra la tarifa mínima', () => {
    const fare = calculateFare({ distanceMeters: 0, durationSeconds: 0 }, PARAMS);

    expect(fare.subtotalCents).toBe(120_000);
    expect(fare.minimumApplied).toBe(true);
    expect(fare.totalCents).toBe(PARAMS.minimumFareCents);
  });

  it('borde: exactamente la distancia máxima se permite', () => {
    expect(() => calculateFare({ distanceMeters: 100_000, durationSeconds: 7_200 }, PARAMS)).not.toThrow();
  });

  it('borde: un metro más que el máximo se rechaza con DISTANCE_EXCEEDED', () => {
    expect(() => calculateFare({ distanceMeters: 100_001, durationSeconds: 7_200 }, PARAMS)).toThrowError(
      expect.objectContaining({ code: 'DISTANCE_EXCEEDED' })
    );
  });

  it('el resultado siempre es un entero de centavos (redondeo a la unidad más cercana)', () => {
    const params: FareParams = { ...PARAMS, baseCents: 0, perKmCents: 333, perMinuteCents: 8_000, minimumFareCents: 0 };

    // 1,5 km × 333 = 499,5 → 500 ; 59 s × 8000/60 = 7866,67 → 7867
    const fare = calculateFare({ distanceMeters: 1_500, durationSeconds: 59 }, params);

    expect(fare.distanceCents).toBe(500);
    expect(fare.timeCents).toBe(7_867);
    expect(Number.isInteger(fare.totalCents)).toBe(true);
  });

  it('por qué centavos: con number y decimales 0,1 + 0,2 no da 0,3', () => {
    expect(0.1 + 0.2).not.toBe(0.3);
    expect(10 + 20).toBe(30); // los mismos importes en centavos son exactos
  });

  it('es determinística: estimación y tarifa final con los mismos insumos dan lo mismo', () => {
    const insumos = { distanceMeters: 5_432, durationSeconds: 901 };
    expect(calculateFare(insumos, PARAMS)).toEqual(calculateFare(insumos, PARAMS));
  });

  it.each([
    ['distancia negativa', { distanceMeters: -1, durationSeconds: 0 }],
    ['distancia con decimales', { distanceMeters: 10.5, durationSeconds: 0 }],
    ['duración NaN', { distanceMeters: 10, durationSeconds: Number.NaN }],
    ['duración infinita', { distanceMeters: 10, durationSeconds: Number.POSITIVE_INFINITY }]
  ])('rechaza insumos inválidos: %s', (_caso, input) => {
    expect(() => calculateFare(input, PARAMS)).toThrowError(expect.objectContaining({ code: 'INVALID_FARE_INPUT' }));
  });

  it('rechaza parámetros de tarifa que no son enteros de centavos', () => {
    expect(() =>
      calculateFare({ distanceMeters: 1_000, durationSeconds: 60 }, { ...PARAMS, perKmCents: 350.5 })
    ).toThrow(DomainError);
  });
});

describe('Distancia y duración estimadas', () => {
  it('un grado de latitud son ~111 195 m', () => {
    expect(haversineDistanceMeters({ latitude: 0, longitude: 0 }, { latitude: 1, longitude: 0 })).toBe(111_195);
  });

  it('el mismo punto da distancia cero', () => {
    const utn = { latitude: -27.4514, longitude: -58.9866 };
    expect(haversineDistanceMeters(utn, utn)).toBe(0);
  });

  it('10 km a 30 km/h son 20 minutos', () => {
    expect(estimateDurationSeconds(10_000, 30)).toBe(1_200);
  });

  it('rechaza velocidad promedio no positiva', () => {
    expect(() => estimateDurationSeconds(1_000, 0)).toThrow(DomainError);
  });
});
