/**
 * npm run seed — carga datos de prueba. Es idempotente: correrlo dos veces no duplica nada.
 * Las credenciales de estos usuarios son de PRUEBA y se documentan en el README (lo pide §2.5).
 */
import type { PoolClient } from 'pg';
import { config } from '../src/config/environment.js';
import { createPool } from '../src/infrastructure/db/postgres/pool.js';
import { BcryptPasswordHasher } from '../src/infrastructure/security/BcryptPasswordHasher.js';

export const SEED_PASSWORD = 'Demo1234!';

type Role = 'PASSENGER' | 'DRIVER' | 'OPERATOR' | 'ADMIN';

interface SeedUser {
  email: string;
  name: string;
  role: Role;
  driver?: { plate: string; model: string; color: string; license: string; approval: 'PENDING' | 'APPROVED' };
}

const USERS: SeedUser[] = [
  { email: 'admin@demo.local', name: 'Admin Demo', role: 'ADMIN' },
  { email: 'operador@demo.local', name: 'Operador Demo', role: 'OPERATOR' },
  { email: 'pasajero1@demo.local', name: 'Pasajera Uno', role: 'PASSENGER' },
  { email: 'pasajero2@demo.local', name: 'Pasajero Dos', role: 'PASSENGER' },
  { email: 'pasajero3@demo.local', name: 'Pasajera Tres', role: 'PASSENGER' },
  ...[1, 2, 3, 4, 5].map(n => ({
    email: `chofer${n}@demo.local`,
    name: `Chofer ${n}`,
    role: 'DRIVER' as const,
    driver: { plate: `AA${100 + n}BB`, model: 'Toyota Etios', color: 'Blanco', license: `LIC-000${n}`, approval: 'APPROVED' as const }
  })),
  {
    email: 'chofer.pendiente@demo.local',
    name: 'Chofer Pendiente',
    role: 'DRIVER',
    driver: { plate: 'AC999ZZ', model: 'Fiat Cronos', color: 'Gris', license: 'LIC-9999', approval: 'PENDING' }
  }
];

async function upsertUser(client: PoolClient, user: SeedUser, passwordHash: string): Promise<string> {
  const inserted = await client.query<{ id: string }>(
    `INSERT INTO users (email, password_hash, role, name)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT ((lower(email))) DO NOTHING
     RETURNING id`,
    [user.email, passwordHash, user.role, user.name]
  );
  if (inserted.rows[0]) return inserted.rows[0].id;

  const existing = await client.query<{ id: string }>('SELECT id FROM users WHERE lower(email) = lower($1)', [user.email]);
  return existing.rows[0].id;
}

async function seed(): Promise<void> {
  const pool = createPool(config.database.url, { max: 1 });
  const client = await pool.connect();
  const hasher = new BcryptPasswordHasher(config.security.bcryptCost);

  try {
    await client.query('BEGIN');

    await client.query(
      `INSERT INTO fare_config (base_cents, per_km_cents, per_minute_cents, minimum_fare_cents, max_distance_meters, average_speed_kmh, active)
       SELECT 120000, 35000, 8000, 200000, 100000, 30, true
       WHERE NOT EXISTS (SELECT 1 FROM fare_config WHERE active)`
    );

    const passwordHash = await hasher.hash(SEED_PASSWORD);
    for (const user of USERS) {
      const id = await upsertUser(client, user, passwordHash);
      if (user.driver) {
        await client.query(
          `INSERT INTO drivers (user_id, vehicle_plate, vehicle_model, vehicle_color, license_number, approval_status)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (user_id) DO NOTHING`,
          [id, user.driver.plate, user.driver.model, user.driver.color, user.driver.license, user.driver.approval]
        );
      }
    }

    await client.query('COMMIT');
    console.log(`[seed] Listo: ${USERS.length} usuarios de prueba (contraseña: ${SEED_PASSWORD}) y tarifa activa.`);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error(`[seed] ${(error as Error).message}`);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

await seed();
