import { describe, it, expect, beforeEach } from 'vitest';
import { CancelRide } from '../../src/application/use-cases/CancelRide.js';
import { InMemoryStore, InMemoryUnitOfWork, createInMemoryStore } from '../../src/infrastructure/memory/InMemoryUnitOfWork.js';
import { FixedClock } from '../../src/infrastructure/time/clocks.js';
import { Ride } from '../../src/domain/rides/ride.js';
import { RideStatus } from '../../src/domain/rides/rideStateMachine.js';

const NOW = new Date('2026-11-11T12:00:00Z');

function ride(status: RideStatus, driverId: string | null): Ride {
  return {
    id: 'viaje-1',
    passengerId: 'pasajero-1',
    driverId,
    status,
    estimatedDistanceMeters: 2_800,
    estimatedDurationSeconds: 600,
    estimatedFareCents: 298_000,
    version: 1,
    requestedAt: new Date('2026-11-11T11:59:00Z'),
    assignedAt: driverId ? new Date('2026-11-11T11:59:30Z') : null
  };
}

describe('Caso de uso CancelRide (reglas, sin base de datos)', () => {
  let store: InMemoryStore;
  let cancelRide: CancelRide;

  beforeEach(() => {
    store = createInMemoryStore();
    cancelRide = new CancelRide(new InMemoryUnitOfWork(store), new FixedClock(NOW));
    store.drivers.set('chofer-1', { userId: 'chofer-1', approvalStatus: 'APPROVED', availability: 'BUSY' });
  });

  it('el pasajero cancela un viaje que todavía busca chofer', async () => {
    store.rides.set('viaje-1', ride('REQUESTED', null));

    const result = await cancelRide.execute({ rideId: 'viaje-1', actorId: 'pasajero-1', actorRole: 'PASSENGER', reason: 'Me arrepentí' });

    expect(result.status).toBe('CANCELLED_BY_PASSENGER');
    expect(store.rideHistory).toEqual([
      expect.objectContaining({ from: 'REQUESTED', to: 'CANCELLED_BY_PASSENGER', actorRole: 'PASSENGER', reason: 'Me arrepentí' })
    ]);
  });

  it('cancelar un viaje ya asignado libera al chofer (no queda "ocupado sin viaje")', async () => {
    store.rides.set('viaje-1', ride('ASSIGNED', 'chofer-1'));

    await cancelRide.execute({ rideId: 'viaje-1', actorId: 'pasajero-1', actorRole: 'PASSENGER' });

    expect(store.drivers.get('chofer-1')?.availability).toBe('AVAILABLE');
  });

  it.each([
    ['DRIVER', 'chofer-1', 'CANCELLED_BY_DRIVER'],
    ['OPERATOR', 'operador-1', 'CANCELLED_BY_OPERATOR']
  ] as const)('%s cancela → %s', async (actorRole, actorId, expected) => {
    store.rides.set('viaje-1', ride('DRIVER_EN_ROUTE', 'chofer-1'));

    const result = await cancelRide.execute({ rideId: 'viaje-1', actorId, actorRole, reason: 'motivo' });

    expect(result.status).toBe(expected);
    expect(store.drivers.get('chofer-1')?.availability).toBe('AVAILABLE');
  });

  it.each([
    ['otro pasajero', 'PASSENGER', 'pasajero-2'],
    ['un chofer que no es el asignado', 'DRIVER', 'chofer-2']
  ] as const)('autorización por recurso: %s no puede cancelar (responde como si no existiera)', async (_caso, actorRole, actorId) => {
    store.rides.set('viaje-1', ride('ASSIGNED', 'chofer-1'));

    await expect(cancelRide.execute({ rideId: 'viaje-1', actorId, actorRole })).rejects.toMatchObject({ code: 'RIDE_NOT_FOUND' });
    expect(store.rides.get('viaje-1')?.status).toBe('ASSIGNED');
  });

  it('con el pasajero a bordo, el pasajero no puede cancelar (esa transición no existe en la máquina de estados)', async () => {
    store.rides.set('viaje-1', ride('IN_PROGRESS', 'chofer-1'));

    await expect(
      cancelRide.execute({ rideId: 'viaje-1', actorId: 'pasajero-1', actorRole: 'PASSENGER' })
    ).rejects.toMatchObject({ code: 'INVALID_RIDE_TRANSITION' });
    expect(store.drivers.get('chofer-1')?.availability).toBe('BUSY');
  });

  it.each(['COMPLETED', 'CANCELLED_BY_DRIVER'] as const)('un viaje %s no se puede volver a cancelar', async status => {
    store.rides.set('viaje-1', ride(status, 'chofer-1'));

    await expect(
      cancelRide.execute({ rideId: 'viaje-1', actorId: 'operador-1', actorRole: 'OPERATOR' })
    ).rejects.toMatchObject({ code: 'INVALID_RIDE_TRANSITION' });
  });
});
