import { DomainErrorCode } from '../../domain/errors/DomainError.js';

/**
 * Único lugar donde un error de dominio se convierte en status HTTP (Bloque 4).
 * El `Record` obliga a TypeScript a exigir una entrada por cada código nuevo del dominio.
 */
export const DOMAIN_ERROR_HTTP_STATUS: Record<DomainErrorCode, number> = {
  INVALID_RIDE_TRANSITION: 409,
  RIDE_TRANSITION_NOT_ALLOWED_FOR_ACTOR: 403,
  INVALID_FARE_INPUT: 422,
  INVALID_FARE_PARAMS: 500, // parámetros de tarifa mal configurados: es un error nuestro, no del cliente
  DISTANCE_EXCEEDED: 422,
  RIDE_NOT_FOUND: 404,
  RIDE_NOT_AVAILABLE: 409,
  DRIVER_NOT_FOUND: 404,
  DRIVER_NOT_APPROVED: 403,
  DRIVER_NOT_AVAILABLE: 409,
  CONCURRENT_UPDATE_CONFLICT: 409
};
