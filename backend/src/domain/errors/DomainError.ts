/**
 * Error de dominio: describe QUÉ regla de negocio se violó, nunca CÓMO se responde por HTTP.
 * La traducción código → status HTTP vive en la capa web (presentation/http/domainErrorToHttp.ts).
 */
export type DomainErrorCode =
  // Máquina de estados del viaje
  | 'INVALID_RIDE_TRANSITION'
  | 'RIDE_TRANSITION_NOT_ALLOWED_FOR_ACTOR'
  // Tarifa
  | 'INVALID_FARE_INPUT'
  | 'INVALID_FARE_PARAMS'
  | 'DISTANCE_EXCEEDED'
  // Asignación de viajes (§6.3)
  | 'RIDE_NOT_FOUND'
  | 'RIDE_NOT_AVAILABLE'
  | 'DRIVER_NOT_FOUND'
  | 'DRIVER_NOT_APPROVED'
  | 'DRIVER_NOT_AVAILABLE'
  // Concurrencia: la operación chocó con otra y se agotaron los reintentos
  | 'CONCURRENT_UPDATE_CONFLICT';

export class DomainError extends Error {
  constructor(
    public readonly code: DomainErrorCode,
    message: string,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'DomainError';
  }
}
