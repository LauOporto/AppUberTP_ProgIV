import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import type pg from 'pg';
import { AcceptRide } from '../../src/application/use-cases/AcceptRide.js';
import { PgUnitOfWork } from '../../src/infrastructure/db/postgres/PgUnitOfWork.js';
import { SystemClock } from '../../src/infrastructure/time/clocks.js';
import { DomainError } from '../../src/domain/errors/DomainError.js';
import {
  createTestPool,
  insertDriver,
  insertFareConfig,
  insertRequestedRide,
  insertUser,
  resetDatabase,
  rideStatus
} from '../helpers/postgres.js';

/**
 * Problema central (§6.3) contra PostgreSQL REAL.
 * No alcanza con que no haya errores: se verifica el dato final en la base.
 */
describe('Asignación concurrente de viajes (PC-04, PC-06) — PostgreSQL', () => {
  let pool: pg.Pool;
  let acceptRide: AcceptRide;
  let fareConfigId: number;

  beforeAll(() => {
    pool = createTestPool(20);
    acceptRide = new AcceptRide(new PgUnitOfWork(pool), new SystemClock());
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    await resetDatabase(pool);
    fareConfigId = await insertFareConfig(pool);
  });

  const codesOf = (results: PromiseSettledResult<unknown>[]) =>
    results
      .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
      .map(r => (r.reason instanceof DomainError ? r.reason.code : `NO_ES_DOMAIN_ERROR: ${r.reason}`));

  it('PC-04: 50 choferes aceptan el MISMO viaje a la vez → exactamente 1 éxito y 49 rechazos claros', async () => {
    const rideId = await insertRequestedRide(pool, fareConfigId);
    const driverIds = await Promise.all(Array.from({ length: 50 }, () => insertDriver(pool)));

    const results = await Promise.allSettled(driverIds.map(driverId => acceptRide.execute({ driverId, rideId })));

    const winners = results.filter(r => r.status === 'fulfilled');
    expect(winners).toHaveLength(1);
    expect(codesOf(results)).toEqual(Array(49).fill('RIDE_NOT_AVAILABLE'));

    // El dato en la base:
    const winnerId = (winners[0] as PromiseFulfilledResult<{ driverId: string }>).value.driverId;
    expect(await rideStatus(pool, rideId)).toEqual({ status: 'ASSIGNED', driver_id: winnerId });

    const busy = await pool.query("SELECT user_id FROM drivers WHERE availability = 'BUSY'");
    expect(busy.rows).toEqual([{ user_id: winnerId }]);

    const history = await pool.query('SELECT to_status, actor_id FROM ride_status_history WHERE ride_id = $1', [rideId]);
    expect(history.rows).toEqual([{ to_status: 'ASSIGNED', actor_id: winnerId }]);
  });

  it('PC-06: un chofer acepta 10 viajes distintos a la vez → queda con UN solo viaje activo', async () => {
    const driverId = await insertDriver(pool);
    const rideIds = await Promise.all(Array.from({ length: 10 }, () => insertRequestedRide(pool, fareConfigId)));

    const results = await Promise.allSettled(rideIds.map(rideId => acceptRide.execute({ driverId, rideId })));

    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect(codesOf(results)).toEqual(Array(9).fill('DRIVER_NOT_AVAILABLE'));

    const active = await pool.query(
      "SELECT count(*)::int AS n FROM rides WHERE driver_id = $1 AND status IN ('ASSIGNED','DRIVER_EN_ROUTE','IN_PROGRESS')",
      [driverId]
    );
    expect(active.rows[0].n).toBe(1);

    const stillRequested = await pool.query("SELECT count(*)::int AS n FROM rides WHERE status = 'REQUESTED'");
    expect(stillRequested.rows[0].n).toBe(9);
  });

  it('PC-06: un chofer con viaje activo no puede aceptar otro', async () => {
    const driverId = await insertDriver(pool);
    const first = await insertRequestedRide(pool, fareConfigId);
    const second = await insertRequestedRide(pool, fareConfigId);

    await acceptRide.execute({ driverId, rideId: first });

    await expect(acceptRide.execute({ driverId, rideId: second })).rejects.toMatchObject({
      code: 'DRIVER_NOT_AVAILABLE'
    });
    expect((await rideStatus(pool, second)).status).toBe('REQUESTED');
  });

  it('red de seguridad: aunque el código se saltee los locks, la base rechaza un segundo viaje activo del chofer', async () => {
    const driverId = await insertDriver(pool);
    const first = await insertRequestedRide(pool, fareConfigId);
    const second = await insertRequestedRide(pool, fareConfigId);
    const assign = "UPDATE rides SET status = 'ASSIGNED', driver_id = $1 WHERE id = $2";

    await pool.query(assign, [driverId, first]);

    await expect(pool.query(assign, [driverId, second])).rejects.toMatchObject({
      code: '23505',
      constraint: 'rides_one_active_per_driver'
    });
  });

  it('red de seguridad: un pasajero no puede tener dos viajes activos', async () => {
    const passengerId = await insertUser(pool, 'PASSENGER');
    await insertRequestedRide(pool, fareConfigId, passengerId);

    await expect(insertRequestedRide(pool, fareConfigId, passengerId)).rejects.toMatchObject({
      code: '23505',
      constraint: 'rides_one_active_per_passenger'
    });
  });
});
