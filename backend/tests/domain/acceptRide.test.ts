import { describe, it, expect, beforeEach } from 'vitest';
import { AcceptRide } from '../../src/application/use-cases/AcceptRide.js';
import { InMemoryStore, InMemoryUnitOfWork, createInMemoryStore } from '../../src/infrastructure/memory/InMemoryUnitOfWork.js';
import { FixedClock } from '../../src/infrastructure/time/clocks.js';
import { Ride } from '../../src/domain/rides/ride.js';
import { Driver } from '../../src/domain/drivers/driver.js';

const NOW = new Date('2026-11-11T12:00:00Z');

function requestedRide(id: string, overrides: Partial<Ride> = {}): Ride {
  return {
    id,
    passengerId: `pasajero-${id}`,
    driverId: null,
    status: 'REQUESTED',
    estimatedDistanceMeters: 2_800,
    estimatedDurationSeconds: 600,
    estimatedFareCents: 298_000,
    version: 1,
    requestedAt: new Date('2026-11-11T11:59:00Z'),
    assignedAt: null,
    ...overrides
  };
}

function driver(userId: string, overrides: Partial<Driver> = {}): Driver {
  return { userId, approvalStatus: 'APPROVED', availability: 'AVAILABLE', ...overrides };
}

describe('Caso de uso AcceptRide (reglas, sin base de datos)', () => {
  let store: InMemoryStore;
  let acceptRide: AcceptRide;

  beforeEach(() => {
    store = createInMemoryStore();
    acceptRide = new AcceptRide(new InMemoryUnitOfWork(store), new FixedClock(NOW));
    store.rides.set('viaje-1', requestedRide('viaje-1'));
    store.drivers.set('chofer-1', driver('chofer-1'));
  });

  it('asigna el viaje, marca al chofer ocupado y registra el historial', async () => {
    const ride = await acceptRide.execute({ driverId: 'chofer-1', rideId: 'viaje-1' });

    expect(ride).toMatchObject({ status: 'ASSIGNED', driverId: 'chofer-1', assignedAt: NOW, version: 2 });
    expect(store.drivers.get('chofer-1')?.availability).toBe('BUSY');
    expect(store.rideHistory).toEqual([
      { rideId: 'viaje-1', from: 'REQUESTED', to: 'ASSIGNED', actorId: 'chofer-1', actorRole: 'DRIVER', at: NOW }
    ]);
  });

  it.each([
    ['viaje inexistente', { rideId: 'no-existe', driverId: 'chofer-1' }, 'RIDE_NOT_FOUND'],
    ['usuario sin perfil de chofer', { rideId: 'viaje-1', driverId: 'no-es-chofer' }, 'DRIVER_NOT_FOUND']
  ])('rechaza: %s', async (_caso, command, code) => {
    await expect(acceptRide.execute(command)).rejects.toMatchObject({ code });
  });

  it('rechaza a un chofer pendiente de habilitación', async () => {
    store.drivers.set('chofer-1', driver('chofer-1', { approvalStatus: 'PENDING' }));
    await expect(acceptRide.execute({ driverId: 'chofer-1', rideId: 'viaje-1' })).rejects.toMatchObject({
      code: 'DRIVER_NOT_APPROVED'
    });
  });

  it.each(['OFFLINE', 'BUSY'] as const)('rechaza a un chofer %s', async availability => {
    store.drivers.set('chofer-1', driver('chofer-1', { availability }));
    await expect(acceptRide.execute({ driverId: 'chofer-1', rideId: 'viaje-1' })).rejects.toMatchObject({
      code: 'DRIVER_NOT_AVAILABLE'
    });
  });

  it.each(['ASSIGNED', 'CANCELLED_BY_PASSENGER', 'NO_DRIVERS_AVAILABLE', 'COMPLETED'] as const)(
    'rechaza un viaje en estado %s',
    async status => {
      store.rides.set('viaje-1', requestedRide('viaje-1', { status, driverId: status === 'ASSIGNED' ? 'otro' : null }));
      await expect(acceptRide.execute({ driverId: 'chofer-1', rideId: 'viaje-1' })).rejects.toMatchObject({
        code: 'RIDE_NOT_AVAILABLE'
      });
    }
  );

  it('si la operación falla no deja nada a medias', async () => {
    store.drivers.set('chofer-1', driver('chofer-1', { availability: 'BUSY' }));
    const before = structuredClone(store);

    await expect(acceptRide.execute({ driverId: 'chofer-1', rideId: 'viaje-1' })).rejects.toThrow();

    expect(store).toEqual(before);
  });

  it('con 50 aceptaciones simultáneas solo una gana (garantía del puerto, también en memoria)', async () => {
    for (let i = 0; i < 50; i++) store.drivers.set(`c${i}`, driver(`c${i}`));

    const results = await Promise.allSettled(
      Array.from({ length: 50 }, (_, i) => acceptRide.execute({ driverId: `c${i}`, rideId: 'viaje-1' }))
    );

    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect([...store.drivers.values()].filter(d => d.availability === 'BUSY')).toHaveLength(1);
  });
});
