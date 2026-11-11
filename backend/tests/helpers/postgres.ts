import pg from 'pg';
import { resolveTestDatabaseUrl, databaseNameOf } from './testDatabaseUrl.js';
import { RideStatus } from '../../src/domain/rides/rideStateMachine.js';
import { DriverApprovalStatus, DriverAvailability } from '../../src/domain/drivers/driver.js';

export function createTestPool(max = 20): pg.Pool {
  return new pg.Pool({ connectionString: resolveTestDatabaseUrl(), max });
}

/** Deja la base de tests vacía. Se niega a correr sobre una base que no termine en "_test". */
export async function resetDatabase(pool: pg.Pool): Promise<void> {
  const name = databaseNameOf(resolveTestDatabaseUrl());
  if (!name.endsWith('_test')) {
    throw new Error(`resetDatabase se negó a vaciar "${name}": no es una base de tests`);
  }
  await pool.query(
    'TRUNCATE ride_status_history, rides, drivers, fare_config, users RESTART IDENTITY CASCADE'
  );
}

let sequence = 0;
const unique = () => `${Date.now()}-${++sequence}`;

export async function insertFareConfig(pool: pg.Pool): Promise<number> {
  const { rows } = await pool.query<{ id: number }>(
    `INSERT INTO fare_config (base_cents, per_km_cents, per_minute_cents, minimum_fare_cents, max_distance_meters, average_speed_kmh, active)
     VALUES (120000, 35000, 8000, 200000, 100000, 30, true) RETURNING id`
  );
  return rows[0].id;
}

export async function insertUser(pool: pg.Pool, role: 'PASSENGER' | 'DRIVER' | 'OPERATOR' | 'ADMIN'): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO users (email, password_hash, role, name) VALUES ($1, 'hash-de-prueba', $2, $3) RETURNING id`,
    [`${role.toLowerCase()}-${unique()}@test.local`, role, `${role} de prueba`]
  );
  return rows[0].id;
}

export async function insertDriver(
  pool: pg.Pool,
  options: { approval?: DriverApprovalStatus; availability?: DriverAvailability } = {}
): Promise<string> {
  const userId = await insertUser(pool, 'DRIVER');
  await pool.query(
    `INSERT INTO drivers (user_id, vehicle_plate, vehicle_model, vehicle_color, license_number, approval_status, availability)
     VALUES ($1, $2, 'Auto de prueba', 'Gris', $3, $4, $5)`,
    [userId, `T${unique()}`, `LIC-${unique()}`, options.approval ?? 'APPROVED', options.availability ?? 'AVAILABLE']
  );
  return userId;
}

export async function insertRequestedRide(pool: pg.Pool, fareConfigId: number, passengerId?: string): Promise<string> {
  const passenger = passengerId ?? (await insertUser(pool, 'PASSENGER'));
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO rides (passenger_id, status, origin_address, origin_lat, origin_lng,
                        destination_address, destination_lat, destination_lng,
                        estimated_distance_meters, estimated_duration_seconds, estimated_fare_cents, fare_config_id)
     VALUES ($1, 'REQUESTED', 'UTN FRRe', -27.4514, -58.9866, 'Plaza 25 de Mayo', -27.4511, -58.9868, 2800, 600, 298000, $2)
     RETURNING id`,
    [passenger, fareConfigId]
  );
  return rows[0].id;
}

export async function rideStatus(pool: pg.Pool, rideId: string): Promise<{ status: RideStatus; driver_id: string | null }> {
  const { rows } = await pool.query('SELECT status, driver_id FROM rides WHERE id = $1', [rideId]);
  return rows[0];
}
