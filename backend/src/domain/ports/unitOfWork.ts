import { Ride } from '../rides/ride.js';
import { RideActor, RideStatus } from '../rides/rideStateMachine.js';
import { Driver, DriverAvailability } from '../drivers/driver.js';

/**
 * Puertos de persistencia que se usan DENTRO de una transacción.
 * No mencionan SQL: "ForUpdate" significa "reservá este registro hasta que termine la unidad de trabajo",
 * y cada adaptador decide cómo (Postgres: SELECT ... FOR UPDATE; memoria: un mutex).
 */
export interface RideStatusUpdate {
  status: RideStatus;
  at: Date;
  cancellationReason?: string;
}

export interface RideRepository {
  findByIdForUpdate(rideId: string): Promise<Ride | null>;
  assignDriver(rideId: string, driverId: string, at: Date): Promise<Ride>;
  updateStatus(rideId: string, update: RideStatusUpdate): Promise<Ride>;
}

export interface DriverRepository {
  findByUserIdForUpdate(userId: string): Promise<Driver | null>;
  setAvailability(userId: string, availability: DriverAvailability): Promise<void>;
}

export interface RideStatusChange {
  rideId: string;
  from: RideStatus | null;
  to: RideStatus;
  actorId: string | null;
  actorRole: RideActor;
  reason?: string;
  at: Date;
}

export interface RideStatusHistoryRepository {
  record(change: RideStatusChange): Promise<void>;
}

export interface TransactionalRepositories {
  rides: RideRepository;
  drivers: DriverRepository;
  rideHistory: RideStatusHistoryRepository;
}

/**
 * Unidad de trabajo: todo lo que pasa dentro de `run` se confirma junto o no se confirma.
 * Si `work` lanza un error, nada de lo escrito queda guardado.
 */
export interface UnitOfWork {
  run<T>(work: (repositories: TransactionalRepositories) => Promise<T>): Promise<T>;
}
