import { DomainError } from '../errors/DomainError.js';

/**
 * Máquina de estados del viaje (enunciado §6.2).
 *
 * Reemplaza al `RideStatus` legado de `domain/entities/Ride.ts`, que se migra en la Fase 2
 * cuando se reescriba RideService sobre PostgreSQL.
 *
 * CANCELLED_BY_OPERATOR no está en la lista del enunciado: se agrega para que la cancelación
 * del operador (§6.1) quede distinguible en la auditoría. Decisión a confirmar y documentar en docs/modelo.md.
 */
export const RIDE_STATUSES = [
  'REQUESTED', // solicitado: buscando chofer
  'ASSIGNED', // asignado: un chofer aceptó la oferta
  'DRIVER_EN_ROUTE', // chofer en camino al origen
  'IN_PROGRESS', // en curso: pasajero a bordo
  'COMPLETED', // finalizado
  'CANCELLED_BY_PASSENGER',
  'CANCELLED_BY_DRIVER',
  'CANCELLED_BY_OPERATOR',
  'NO_DRIVERS_AVAILABLE' // se agotaron los candidatos
] as const;

export type RideStatus = (typeof RIDE_STATUSES)[number];

/**
 * Rol de quien dispara la transición RESPECTO DEL VIAJE.
 * Verificar que el pasajero sea el dueño del viaje o que el chofer sea el asignado
 * es responsabilidad del caso de uso (autorización por recurso), no de esta tabla.
 */
export type RideActor = 'PASSENGER' | 'DRIVER' | 'OPERATOR' | 'SYSTEM';

type TransitionTable = Readonly<
  Record<RideStatus, Readonly<Partial<Record<RideStatus, readonly RideActor[]>>>>
>;

const CANCELLATIONS_BEFORE_PICKUP = {
  CANCELLED_BY_PASSENGER: ['PASSENGER'],
  CANCELLED_BY_DRIVER: ['DRIVER'],
  CANCELLED_BY_OPERATOR: ['OPERATOR']
} as const;

/** Única fuente de verdad: desde → hacia → quién puede dispararla. */
const TRANSITIONS: TransitionTable = {
  REQUESTED: {
    ASSIGNED: ['DRIVER'],
    NO_DRIVERS_AVAILABLE: ['SYSTEM'],
    CANCELLED_BY_PASSENGER: ['PASSENGER'],
    CANCELLED_BY_OPERATOR: ['OPERATOR']
  },
  ASSIGNED: {
    DRIVER_EN_ROUTE: ['DRIVER'],
    ...CANCELLATIONS_BEFORE_PICKUP
  },
  DRIVER_EN_ROUTE: {
    IN_PROGRESS: ['DRIVER'],
    ...CANCELLATIONS_BEFORE_PICKUP
  },
  IN_PROGRESS: {
    COMPLETED: ['DRIVER'],
    // Con el pasajero a bordo solo soporte puede cortar el viaje (p. ej. un incidente).
    CANCELLED_BY_OPERATOR: ['OPERATOR']
  },
  COMPLETED: {},
  CANCELLED_BY_PASSENGER: {},
  CANCELLED_BY_DRIVER: {},
  CANCELLED_BY_OPERATOR: {},
  NO_DRIVERS_AVAILABLE: {}
};

/** Estados en los que el chofer está ocupado con el viaje (invariante: uno por chofer). */
export const DRIVER_ACTIVE_STATUSES: readonly RideStatus[] = ['ASSIGNED', 'DRIVER_EN_ROUTE', 'IN_PROGRESS'];

/** Estados en los que el pasajero tiene un viaje en curso (invariante: uno por pasajero). */
export const PASSENGER_ACTIVE_STATUSES: readonly RideStatus[] = ['REQUESTED', ...DRIVER_ACTIVE_STATUSES];

export function isTerminal(status: RideStatus): boolean {
  return Object.keys(TRANSITIONS[status]).length === 0;
}

export function canTransition(from: RideStatus, to: RideStatus, actor: RideActor): boolean {
  return TRANSITIONS[from][to]?.includes(actor) ?? false;
}

/**
 * Valida la transición y lanza DomainError si no corresponde.
 * Distingue "esa transición no existe" de "existe pero vos no podés dispararla",
 * para que el cliente reciba un motivo claro.
 */
export function assertTransition(from: RideStatus, to: RideStatus, actor: RideActor): void {
  const allowedActors = TRANSITIONS[from][to];

  if (!allowedActors) {
    throw new DomainError(
      'INVALID_RIDE_TRANSITION',
      `Un viaje en estado ${from} no puede pasar a ${to}`,
      { from, to }
    );
  }

  if (!allowedActors.includes(actor)) {
    throw new DomainError(
      'RIDE_TRANSITION_NOT_ALLOWED_FOR_ACTOR',
      `El rol ${actor} no puede pasar un viaje de ${from} a ${to}`,
      { from, to, actor, allowedActors: [...allowedActors] }
    );
  }
}

/** Estado de cancelación que corresponde a cada actor. */
export function cancellationStatusFor(actor: Exclude<RideActor, 'SYSTEM'>): RideStatus {
  const byActor = {
    PASSENGER: 'CANCELLED_BY_PASSENGER',
    DRIVER: 'CANCELLED_BY_DRIVER',
    OPERATOR: 'CANCELLED_BY_OPERATOR'
  } as const;
  return byActor[actor];
}
