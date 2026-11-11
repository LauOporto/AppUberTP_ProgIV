import { RideStatusChange, TransactionalRepositories, UnitOfWork } from '../../domain/ports/unitOfWork.js';
import { Ride } from '../../domain/rides/ride.js';
import { Driver } from '../../domain/drivers/driver.js';

/**
 * Adaptador EN MEMORIA del puerto UnitOfWork. SOLO para tests de dominio/aplicación (sin base ni HTTP).
 *
 * - Serializa las unidades de trabajo con un mutex: equivale a bloquear todo, más grueso que los locks
 *   de fila de Postgres, pero con la misma garantía observable para los casos de uso.
 * - Trabaja sobre una copia del estado y la confirma al final: si `work` lanza, no queda nada escrito.
 */
export interface InMemoryStore {
  rides: Map<string, Ride>;
  drivers: Map<string, Driver>;
  rideHistory: RideStatusChange[];
}

export function createInMemoryStore(): InMemoryStore {
  return { rides: new Map(), drivers: new Map(), rideHistory: [] };
}

export class InMemoryUnitOfWork implements UnitOfWork {
  private queue: Promise<unknown> = Promise.resolve();

  constructor(public readonly store: InMemoryStore) {}

  run<T>(work: (repositories: TransactionalRepositories) => Promise<T>): Promise<T> {
    const result = this.queue.then(() => this.runIsolated(work));
    this.queue = result.catch(() => {});
    return result;
  }

  private async runIsolated<T>(work: (repositories: TransactionalRepositories) => Promise<T>): Promise<T> {
    const draft: InMemoryStore = structuredClone(this.store);

    const result = await work({
      rides: {
        findByIdForUpdate: async id => structuredClone(draft.rides.get(id) ?? null),
        assignDriver: async (id, driverId, at) => {
          const ride = draft.rides.get(id);
          if (!ride) throw new Error(`Viaje inexistente en memoria: ${id}`);
          const updated: Ride = { ...ride, status: 'ASSIGNED', driverId, assignedAt: at, version: ride.version + 1 };
          draft.rides.set(id, updated);
          return structuredClone(updated);
        },
        updateStatus: async (id, update) => {
          const ride = draft.rides.get(id);
          if (!ride) throw new Error(`Viaje inexistente en memoria: ${id}`);
          const updated: Ride = { ...ride, status: update.status, version: ride.version + 1 };
          draft.rides.set(id, updated);
          return structuredClone(updated);
        }
      },
      drivers: {
        findByUserIdForUpdate: async userId => structuredClone(draft.drivers.get(userId) ?? null),
        setAvailability: async (userId, availability) => {
          const driver = draft.drivers.get(userId);
          if (!driver) throw new Error(`Chofer inexistente en memoria: ${userId}`);
          draft.drivers.set(userId, { ...driver, availability });
        }
      },
      rideHistory: {
        record: async change => {
          draft.rideHistory.push(change);
        }
      }
    });

    // "COMMIT": recién ahora el estado nuevo reemplaza al anterior.
    this.store.rides = draft.rides;
    this.store.drivers = draft.drivers;
    this.store.rideHistory = draft.rideHistory;
    return result;
  }
}
