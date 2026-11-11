import pg from 'pg';
import { resolveTestDatabaseUrl, databaseNameOf } from '../helpers/testDatabaseUrl.js';
import { runMigrations } from '../../src/infrastructure/db/postgres/migrations.js';

/**
 * Se ejecuta UNA vez antes de toda la suite:
 *   1. crea la base de tests si no existe,
 *   2. le aplica las migraciones.
 * Cada test de integración después deja la base en un estado conocido (ver helpers/postgres.ts).
 */
export default async function globalSetup(): Promise<void> {
  const testUrl = resolveTestDatabaseUrl();
  const databaseName = databaseNameOf(testUrl);

  if (!/^[a-z0-9_]+_test$/.test(databaseName)) {
    throw new Error(`Nombre de base de tests inválido o peligroso: "${databaseName}" (debe terminar en _test)`);
  }

  const maintenanceUrl = new URL(testUrl);
  maintenanceUrl.pathname = '/postgres';
  const admin = new pg.Client({ connectionString: maintenanceUrl.toString(), connectionTimeoutMillis: 5_000 });

  try {
    await admin.connect();
  } catch (error) {
    throw new Error(
      `No se pudo conectar a PostgreSQL para los tests (${(error as Error).message}).\n` +
        'Levantá la base (docker compose up -d) y revisá DATABASE_URL en .env.'
    );
  }

  try {
    const exists = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [databaseName]);
    if (exists.rowCount === 0) {
      // El nombre ya se validó con la regex: no hay riesgo de inyección en el identificador.
      await admin.query(`CREATE DATABASE "${databaseName}"`);
    }
  } finally {
    await admin.end();
  }

  const pool = new pg.Pool({ connectionString: testUrl, max: 1 });
  try {
    await runMigrations(pool);
  } finally {
    await pool.end();
  }
}
