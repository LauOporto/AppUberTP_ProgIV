import { describe, it, expect } from 'vitest';
import {
  RIDE_STATUSES,
  RideActor,
  RideStatus,
  assertTransition,
  canTransition,
  cancellationStatusFor,
  isTerminal,
  DRIVER_ACTIVE_STATUSES,
  PASSENGER_ACTIVE_STATUSES
} from '../../src/domain/rides/rideStateMachine.js';
import { DomainError } from '../../src/domain/errors/DomainError.js';

/**
 * Especificación escrita a mano, independiente de la tabla del código.
 * Si alguien cambia la tabla de transiciones sin cambiar esta lista, el test falla.
 */
const VALID_TRANSITIONS: ReadonlyArray<[RideStatus, RideStatus, RideActor]> = [
  ['REQUESTED', 'ASSIGNED', 'DRIVER'],
  ['REQUESTED', 'NO_DRIVERS_AVAILABLE', 'SYSTEM'],
  ['REQUESTED', 'CANCELLED_BY_PASSENGER', 'PASSENGER'],
  ['REQUESTED', 'CANCELLED_BY_OPERATOR', 'OPERATOR'],
  ['ASSIGNED', 'DRIVER_EN_ROUTE', 'DRIVER'],
  ['ASSIGNED', 'CANCELLED_BY_PASSENGER', 'PASSENGER'],
  ['ASSIGNED', 'CANCELLED_BY_DRIVER', 'DRIVER'],
  ['ASSIGNED', 'CANCELLED_BY_OPERATOR', 'OPERATOR'],
  ['DRIVER_EN_ROUTE', 'IN_PROGRESS', 'DRIVER'],
  ['DRIVER_EN_ROUTE', 'CANCELLED_BY_PASSENGER', 'PASSENGER'],
  ['DRIVER_EN_ROUTE', 'CANCELLED_BY_DRIVER', 'DRIVER'],
  ['DRIVER_EN_ROUTE', 'CANCELLED_BY_OPERATOR', 'OPERATOR'],
  ['IN_PROGRESS', 'COMPLETED', 'DRIVER'],
  ['IN_PROGRESS', 'CANCELLED_BY_OPERATOR', 'OPERATOR']
];

const ACTORS: RideActor[] = ['PASSENGER', 'DRIVER', 'OPERATOR', 'SYSTEM'];

const isValid = (from: RideStatus, to: RideStatus, actor: RideActor) =>
  VALID_TRANSITIONS.some(([f, t, a]) => f === from && t === to && a === actor);

const allCombinations = RIDE_STATUSES.flatMap(from =>
  RIDE_STATUSES.flatMap(to => ACTORS.map(actor => [from, to, actor] as [RideStatus, RideStatus, RideActor]))
);

describe('Máquina de estados del viaje (FUN-07)', () => {
  describe('transiciones válidas', () => {
    it.each(VALID_TRANSITIONS)('%s → %s por %s está permitida', (from, to, actor) => {
      expect(canTransition(from, to, actor)).toBe(true);
      expect(() => assertTransition(from, to, actor)).not.toThrow();
    });
  });

  describe('transiciones inválidas', () => {
    const invalid = allCombinations.filter(([from, to, actor]) => !isValid(from, to, actor));

    it(`rechaza las ${invalid.length} combinaciones restantes (de ${allCombinations.length})`, () => {
      for (const [from, to, actor] of invalid) {
        expect(canTransition(from, to, actor), `${from} → ${to} por ${actor}`).toBe(false);
        expect(() => assertTransition(from, to, actor), `${from} → ${to} por ${actor}`).toThrow(DomainError);
      }
    });

    it('distingue "la transición no existe" de "existe pero ese rol no puede dispararla"', () => {
      const noExiste = captureError(() => assertTransition('COMPLETED', 'IN_PROGRESS', 'DRIVER'));
      expect(noExiste.code).toBe('INVALID_RIDE_TRANSITION');

      const rolIncorrecto = captureError(() => assertTransition('IN_PROGRESS', 'COMPLETED', 'PASSENGER'));
      expect(rolIncorrecto.code).toBe('RIDE_TRANSITION_NOT_ALLOWED_FOR_ACTOR');
      expect(rolIncorrecto.details).toMatchObject({ allowedActors: ['DRIVER'] });
    });

    it('un pasajero NO puede marcar su viaje como finalizado (bug del scaffold actual)', () => {
      expect(canTransition('IN_PROGRESS', 'COMPLETED', 'PASSENGER')).toBe(false);
    });

    it('no se puede saltear estados: de ASSIGNED no se pasa directo a IN_PROGRESS', () => {
      expect(canTransition('ASSIGNED', 'IN_PROGRESS', 'DRIVER')).toBe(false);
    });
  });

  describe('estados terminales', () => {
    const terminales: RideStatus[] = [
      'COMPLETED',
      'CANCELLED_BY_PASSENGER',
      'CANCELLED_BY_DRIVER',
      'CANCELLED_BY_OPERATOR',
      'NO_DRIVERS_AVAILABLE'
    ];

    it.each(terminales)('%s es terminal y no sale hacia ningún estado', status => {
      expect(isTerminal(status)).toBe(true);
      for (const to of RIDE_STATUSES) {
        for (const actor of ACTORS) {
          expect(canTransition(status, to, actor)).toBe(false);
        }
      }
    });

    it('los estados activos no son terminales', () => {
      for (const status of PASSENGER_ACTIVE_STATUSES) {
        expect(isTerminal(status)).toBe(false);
      }
    });
  });

  describe('estados activos (base de las invariantes de un viaje activo por chofer/pasajero)', () => {
    it('el chofer está ocupado en ASSIGNED, DRIVER_EN_ROUTE e IN_PROGRESS', () => {
      expect([...DRIVER_ACTIVE_STATUSES].sort()).toEqual(['ASSIGNED', 'DRIVER_EN_ROUTE', 'IN_PROGRESS']);
    });

    it('para el pasajero también cuenta REQUESTED', () => {
      expect([...PASSENGER_ACTIVE_STATUSES].sort()).toEqual(
        ['ASSIGNED', 'DRIVER_EN_ROUTE', 'IN_PROGRESS', 'REQUESTED']
      );
    });
  });

  it('cada actor tiene su estado de cancelación', () => {
    expect(cancellationStatusFor('PASSENGER')).toBe('CANCELLED_BY_PASSENGER');
    expect(cancellationStatusFor('DRIVER')).toBe('CANCELLED_BY_DRIVER');
    expect(cancellationStatusFor('OPERATOR')).toBe('CANCELLED_BY_OPERATOR');
  });
});

function captureError(fn: () => void): DomainError {
  try {
    fn();
  } catch (error) {
    if (error instanceof DomainError) return error;
    throw error;
  }
  throw new Error('Se esperaba un DomainError y no se lanzó ninguno');
}
