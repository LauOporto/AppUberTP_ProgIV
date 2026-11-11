import { DomainError } from '../errors/DomainError.js';

/**
 * Cálculo de tarifa (enunciado §6.5).
 *
 * - Todos los importes son ENTEROS en centavos: nunca se usa `number` con decimales para dinero.
 * - La MISMA función se usa para la estimación previa y para la tarifa final; la diferencia entre
 *   ambas solo puede venir de los insumos (distancia/duración reales vs estimadas), no de la fórmula.
 * - Es una función pura: no conoce la base, ni Express, ni la hora actual.
 */

export interface FareParams {
  baseCents: number;
  perKmCents: number;
  perMinuteCents: number;
  minimumFareCents: number;
  maxDistanceMeters: number;
}

export interface FareInput {
  distanceMeters: number;
  durationSeconds: number;
}

export interface FareBreakdown {
  baseCents: number;
  distanceCents: number;
  timeCents: number;
  subtotalCents: number;
  minimumApplied: boolean;
  totalCents: number;
}

export interface Coordinates {
  latitude: number;
  longitude: number;
}

const EARTH_RADIUS_METERS = 6_371_000;

function isNonNegativeInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

function assertValidParams(params: FareParams): void {
  for (const [name, value] of Object.entries(params)) {
    if (!isNonNegativeInteger(value)) {
      throw new DomainError('INVALID_FARE_PARAMS', `El parámetro de tarifa ${name} debe ser un entero >= 0`, {
        name,
        value
      });
    }
  }
}

function assertValidInput(input: FareInput): void {
  for (const [name, value] of Object.entries(input)) {
    if (!isNonNegativeInteger(value)) {
      throw new DomainError('INVALID_FARE_INPUT', `${name} debe ser un entero >= 0`, { name, value });
    }
  }
}

/**
 * Redondeo de una división entera al entero más cercano (mitades hacia arriba).
 * Se opera con enteros (metros × centavos) y se divide UNA sola vez al final,
 * así no se acumulan errores de punto flotante tramo por tramo.
 */
function divideAndRound(numerator: number, denominator: number): number {
  return Math.floor((numerator + Math.floor(denominator / 2)) / denominator);
}

export function calculateFare(input: FareInput, params: FareParams): FareBreakdown {
  assertValidParams(params);
  assertValidInput(input);

  if (input.distanceMeters > params.maxDistanceMeters) {
    throw new DomainError(
      'DISTANCE_EXCEEDED',
      `La distancia del viaje (${input.distanceMeters} m) supera el máximo permitido (${params.maxDistanceMeters} m)`,
      { distanceMeters: input.distanceMeters, maxDistanceMeters: params.maxDistanceMeters }
    );
  }

  const distanceCents = divideAndRound(input.distanceMeters * params.perKmCents, 1000);
  const timeCents = divideAndRound(input.durationSeconds * params.perMinuteCents, 60);
  const subtotalCents = params.baseCents + distanceCents + timeCents;
  const minimumApplied = subtotalCents < params.minimumFareCents;

  return {
    baseCents: params.baseCents,
    distanceCents,
    timeCents,
    subtotalCents,
    minimumApplied,
    totalCents: minimumApplied ? params.minimumFareCents : subtotalCents
  };
}

/** Distancia en línea recta (haversine), redondeada a metros enteros. */
export function haversineDistanceMeters(from: Coordinates, to: Coordinates): number {
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const deltaLat = toRadians(to.latitude - from.latitude);
  const deltaLon = toRadians(to.longitude - from.longitude);
  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(toRadians(from.latitude)) * Math.cos(toRadians(to.latitude)) * Math.sin(deltaLon / 2) ** 2;
  return Math.round(2 * EARTH_RADIUS_METERS * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

/** Duración estimada a partir de una velocidad promedio urbana configurable. */
export function estimateDurationSeconds(distanceMeters: number, averageSpeedKmh: number): number {
  if (!isNonNegativeInteger(distanceMeters) || !(averageSpeedKmh > 0)) {
    throw new DomainError('INVALID_FARE_INPUT', 'Distancia o velocidad promedio inválidas', {
      distanceMeters,
      averageSpeedKmh
    });
  }
  const metersPerSecond = (averageSpeedKmh * 1000) / 3600;
  return Math.round(distanceMeters / metersPerSecond);
}
