import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import type pg from 'pg';
import { AcceptRide } from '../../src/application/use-cases/AcceptRide.js';
import { CancelRide } from '../../src/application/use-cases/CancelRide.js';
import { PgUnitOfWork } from '../../src/infrastructure/db/postgres/PgUnitOfWork.js';
import { SystemClock } from '../../src/infrastructure/time/clocks.js';
import { DomainError } from '../../src/domain/errors/DomainError.js';
import { createTestPool, insertDriver, insertFareConfig, insertRequestedRide, insertUser, resetDatabase } from '../helpers/postgres.js';

/**
 * PC-05 (§6.3): el pasajero cancela en el mismo instante en que un chofer acepta.
 *
 * Resultados documentados (ver CancelRide.ts y ADR-0004):
 *   (a) gana la cancelación → viaje CANCELLED_BY_PASSENGER sin chofer, la aceptación falla con RIDE_NOT_AVAILABLE.
 *   (b) gana la aceptación  → la cancelación se aplica después: viaje CANCELLED_BY_PASSENGER con chofer registrado.
 * En los dos casos el chofer termina AVAILABLE. Nunca: viaje asignado sin pasajero, chofer BUSY sin viaje.
 *
 * Como el orden real depende de quién toma primero el lock, se repite muchas veces y se verifica el
 * estado final en CADA repetición.
 */
describe('Cancelación simultánea a la aceptación (PC-05) — PostgreSQL', () => {
  const ROUNDS = 40;
  let pool: pg.Pool;
  let acceptRide: AcceptRide;
  let cancelRide: CancelRide;
  let fareConfigId: number;

  beforeAll(() => {
    pool = createTestPool(20);
    const unitOfWork = new PgUnitOfWork(pool);
    acceptRide = new AcceptRide(unitOfWork, new SystemClock());
    cancelRide = new CancelRide(unitOfWork, new SystemClock());
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    await resetDatabase(pool);
    fareConfigId = await insertFareConfig(pool);
  });

  it(`en ${ROUNDS} carreras el resultado es siempre uno de los dos estados documentados`, async () => {
    const outcomes = { cancelFirst: 0, acceptFirst: 0 };

    for (let round = 0; round < ROUNDS; round++) {
      const passengerId = await insertUser(pool, 'PASSENGER');
      const driverId = await insertDriver(pool);
      const rideId = await insertRequestedRide(pool, fareConfigId, passengerId);

      // Se alterna cuál se lanza primero: en la práctica el que sale primero suele tomar el lock primero,
      // y queremos ejercitar los DOS resultados posibles, no solo uno.
      const startAccept = () => acceptRide.execute({ driverId, rideId });
      const startCancel = () =>
        cancelRide.execute({ rideId, actorId: passengerId, actorRole: 'PASSENGER', reason: 'carrera' });
      const [accept, cancel] =
        round % 2 === 0
          ? await Promise.allSettled([startAccept(), startCancel()])
          : await Promise.allSettled([startCancel(), startAccept()]).then(([c, a]) => [a, c]);

      // La cancelación del pasajero siempre se aplica: desde REQUESTED o desde ASSIGNED es válida.
      expect(cancel.status, `ronda ${round}: la cancelación debía aplicarse`).toBe('fulfilled');

      const { rows } = await pool.query(
        `SELECT r.status, r.driver_id, d.availability
           FROM rides r CROSS JOIN drivers d
          WHERE r.id = $1 AND d.user_id = $2`,
        [rideId, driverId]
      );
      const final = rows[0];
      expect(final.status).toBe('CANCELLED_BY_PASSENGER');
      expect(final.availability, `ronda ${round}: el chofer no puede quedar ocupado`).toBe('AVAILABLE');

      if (accept.status === 'fulfilled') {
        // (b) ganó la aceptación y la cancelación vino después.
        expect(final.driver_id).toBe(driverId);
        outcomes.acceptFirst++;
      } else {
        // (a) ganó la cancelación: la aceptación recibió un rechazo claro.
        expect(accept.reason).toBeInstanceOf(DomainError);
        expect((accept.reason as DomainError).code).toBe('RIDE_NOT_AVAILABLE');
        expect(final.driver_id).toBeNull();
        outcomes.cancelFirst++;
      }
    }

    // Invariante global: ningún chofer BUSY sin un viaje activo que lo justifique.
    const orphans = await pool.query(
      `SELECT d.user_id FROM drivers d
        WHERE d.availability = 'BUSY'
          AND NOT EXISTS (SELECT 1 FROM rides r WHERE r.driver_id = d.user_id
                          AND r.status IN ('ASSIGNED','DRIVER_EN_ROUTE','IN_PROGRESS'))`
    );
    expect(orphans.rows).toEqual([]);

    console.log(`[PC-05] ${ROUNDS} carreras → ganó la cancelación: ${outcomes.cancelFirst} · ganó la aceptación: ${outcomes.acceptFirst}`);
    expect(outcomes.cancelFirst + outcomes.acceptFirst).toBe(ROUNDS);
    // El test solo prueba algo si ejercitó los dos caminos.
    expect(outcomes.cancelFirst, 'nunca ganó la cancelación').toBeGreaterThan(0);
    expect(outcomes.acceptFirst, 'nunca ganó la aceptación').toBeGreaterThan(0);
  });

  it('camino (a) en secuencia: cancelado primero, la aceptación posterior se rechaza y el chofer queda libre', async () => {
    const passengerId = await insertUser(pool, 'PASSENGER');
    const driverId = await insertDriver(pool);
    const rideId = await insertRequestedRide(pool, fareConfigId, passengerId);

    await cancelRide.execute({ rideId, actorId: passengerId, actorRole: 'PASSENGER' });

    await expect(acceptRide.execute({ driverId, rideId })).rejects.toMatchObject({ code: 'RIDE_NOT_AVAILABLE' });
    const { rows } = await pool.query('SELECT availability FROM drivers WHERE user_id = $1', [driverId]);
    expect(rows[0].availability).toBe('AVAILABLE');
  });

  it('el historial registra las transiciones en el orden en que realmente ocurrieron', async () => {
    const passengerId = await insertUser(pool, 'PASSENGER');
    const driverId = await insertDriver(pool);
    const rideId = await insertRequestedRide(pool, fareConfigId, passengerId);

    await acceptRide.execute({ driverId, rideId });
    await cancelRide.execute({ rideId, actorId: passengerId, actorRole: 'PASSENGER', reason: 'cambié de planes' });

    const { rows } = await pool.query(
      'SELECT from_status, to_status, actor_role, reason FROM ride_status_history WHERE ride_id = $1 ORDER BY id',
      [rideId]
    );
    expect(rows).toEqual([
      { from_status: 'REQUESTED', to_status: 'ASSIGNED', actor_role: 'DRIVER', reason: null },
      { from_status: 'ASSIGNED', to_status: 'CANCELLED_BY_PASSENGER', actor_role: 'PASSENGER', reason: 'cambié de planes' }
    ]);
    const ride = await pool.query('SELECT cancelled_at, cancellation_reason FROM rides WHERE id = $1', [rideId]);
    expect(ride.rows[0].cancelled_at).toBeInstanceOf(Date);
    expect(ride.rows[0].cancellation_reason).toBe('cambié de planes');
  });
});
