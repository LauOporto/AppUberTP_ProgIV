import type { Pool, PoolClient } from 'pg';
import {
  DriverRepository,
  RideRepository,
  RideStatusUpdate,
  RideStatusHistoryRepository,
  TransactionalRepositories,
  UnitOfWork
} from '../../../domain/ports/unitOfWork.js';
import { Ride } from '../../../domain/rides/ride.js';
import { RideStatus } from '../../../domain/rides/rideStateMachine.js';
import { Driver, DriverApprovalStatus, DriverAvailability } from '../../../domain/drivers/driver.js';
import { DomainError } from '../../../domain/errors/DomainError.js';

/**
 * Adaptador PostgreSQL del puerto UnitOfWork.
 *
 * Nivel de aislamiento: READ COMMITTED (el default de Postgres) + SELECT ... FOR UPDATE.
 * Alcanza porque, cuando una transacción espera un lock de fila y el dueño confirma, Postgres
 * vuelve a leer la versión CONFIRMADA de esa fila antes de devolvérsela. Por eso el segundo chofer
 * ve el viaje ya en ASSIGNED y no el REQUESTED que había antes.
 */

const DEADLOCK_DETECTED = '40P01';
const SERIALIZATION_FAILURE = '40001';
const UNIQUE_VIOLATION = '23505';
const RETRYABLE_CODES = new Set([DEADLOCK_DETECTED, SERIALIZATION_FAILURE]);

interface PgError extends Error {
  code?: string;
  constraint?: string;
}

/**
 * Columna de marca de tiempo por estado destino. Es una lista cerrada escrita en el código
 * (nunca viene del cliente), por eso es seguro interpolarla en el SQL.
 */
const STATUS_TIMESTAMP_COLUMN: Partial<Record<RideStatus, string>> = {
  DRIVER_EN_ROUTE: 'en_route_at',
  IN_PROGRESS: 'started_at',
  COMPLETED: 'completed_at',
  CANCELLED_BY_PASSENGER: 'cancelled_at',
  CANCELLED_BY_DRIVER: 'cancelled_at',
  CANCELLED_BY_OPERATOR: 'cancelled_at'
};

const RIDE_COLUMNS = `
  id, passenger_id, driver_id, status, estimated_distance_meters, estimated_duration_seconds,
  estimated_fare_cents, version, requested_at, assigned_at`;

interface RideRow {
  id: string;
  passenger_id: string;
  driver_id: string | null;
  status: RideStatus;
  estimated_distance_meters: number;
  estimated_duration_seconds: number;
  estimated_fare_cents: number;
  version: number;
  requested_at: Date;
  assigned_at: Date | null;
}

function toRide(row: RideRow): Ride {
  return {
    id: row.id,
    passengerId: row.passenger_id,
    driverId: row.driver_id,
    status: row.status,
    estimatedDistanceMeters: row.estimated_distance_meters,
    estimatedDurationSeconds: row.estimated_duration_seconds,
    estimatedFareCents: row.estimated_fare_cents,
    version: row.version,
    requestedAt: row.requested_at,
    assignedAt: row.assigned_at
  };
}

class PgRideRepository implements RideRepository {
  constructor(private readonly client: PoolClient) {}

  async findByIdForUpdate(rideId: string): Promise<Ride | null> {
    const { rows } = await this.client.query<RideRow>(`SELECT ${RIDE_COLUMNS} FROM rides WHERE id = $1 FOR UPDATE`, [
      rideId
    ]);
    return rows[0] ? toRide(rows[0]) : null;
  }

  async assignDriver(rideId: string, driverId: string, at: Date): Promise<Ride> {
    const { rows } = await this.client.query<RideRow>(
      `UPDATE rides
          SET status = 'ASSIGNED', driver_id = $2, assigned_at = $3, updated_at = $3, version = version + 1
        WHERE id = $1
        RETURNING ${RIDE_COLUMNS}`,
      [rideId, driverId, at]
    );
    return toRide(rows[0]);
  }

  async updateStatus(rideId: string, update: RideStatusUpdate): Promise<Ride> {
    // La columna de marca de tiempo depende del estado destino (en_route_at, started_at, ...).
    const timestampColumn = STATUS_TIMESTAMP_COLUMN[update.status];
    const { rows } = await this.client.query<RideRow>(
      `UPDATE rides
          SET status = $2,
              ${timestampColumn ? `${timestampColumn} = $3,` : ''}
              cancellation_reason = COALESCE($4, cancellation_reason),
              updated_at = $3,
              version = version + 1
        WHERE id = $1
        RETURNING ${RIDE_COLUMNS}`,
      [rideId, update.status, update.at, update.cancellationReason ?? null]
    );
    return toRide(rows[0]);
  }
}

class PgDriverRepository implements DriverRepository {
  constructor(private readonly client: PoolClient) {}

  async findByUserIdForUpdate(userId: string): Promise<Driver | null> {
    const { rows } = await this.client.query<{
      user_id: string;
      approval_status: DriverApprovalStatus;
      availability: DriverAvailability;
    }>('SELECT user_id, approval_status, availability FROM drivers WHERE user_id = $1 FOR UPDATE', [userId]);
    const row = rows[0];
    return row ? { userId: row.user_id, approvalStatus: row.approval_status, availability: row.availability } : null;
  }

  async setAvailability(userId: string, availability: DriverAvailability): Promise<void> {
    await this.client.query('UPDATE drivers SET availability = $2, updated_at = now() WHERE user_id = $1', [
      userId,
      availability
    ]);
  }
}

class PgRideStatusHistoryRepository implements RideStatusHistoryRepository {
  constructor(private readonly client: PoolClient) {}

  async record(change: Parameters<RideStatusHistoryRepository['record']>[0]): Promise<void> {
    await this.client.query(
      `INSERT INTO ride_status_history (ride_id, from_status, to_status, actor_id, actor_role, reason, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [change.rideId, change.from, change.to, change.actorId, change.actorRole, change.reason ?? null, change.at]
    );
  }
}

/** Traduce errores de Postgres que tienen significado de negocio; el resto sigue como error técnico (→ 500). */
function translateError(error: unknown): unknown {
  if (error instanceof DomainError) return error;
  const pgError = error as PgError;

  if (pgError.code === UNIQUE_VIOLATION && pgError.constraint === 'rides_one_active_per_driver') {
    // Red de seguridad: si algún camino de código se saltea el lock, la base igual impide el segundo viaje activo.
    return new DomainError('DRIVER_NOT_AVAILABLE', 'El chofer ya tiene un viaje activo');
  }
  if (pgError.code && RETRYABLE_CODES.has(pgError.code)) {
    return new DomainError('CONCURRENT_UPDATE_CONFLICT', 'La operación chocó con otra simultánea; reintentá');
  }
  return error;
}

export class PgUnitOfWork implements UnitOfWork {
  constructor(
    private readonly pool: Pool,
    private readonly maxAttempts = 3
  ) {}

  async run<T>(work: (repositories: TransactionalRepositories) => Promise<T>): Promise<T> {
    for (let attempt = 1; ; attempt++) {
      const client = await this.pool.connect();
      try {
        await client.query('BEGIN');
        const result = await work({
          rides: new PgRideRepository(client),
          drivers: new PgDriverRepository(client),
          rideHistory: new PgRideStatusHistoryRepository(client)
        });
        await client.query('COMMIT');
        return result;
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {});

        // Un interbloqueo o fallo de serialización no es un error del pedido: se reintenta acotado.
        const code = (error as PgError).code;
        if (code && RETRYABLE_CODES.has(code) && attempt < this.maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, 5 * attempt + Math.random() * 10));
          continue;
        }
        throw translateError(error);
      } finally {
        client.release();
      }
    }
  }
}
