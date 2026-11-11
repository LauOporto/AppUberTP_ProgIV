import { createHash } from 'crypto';
import { readdir, readFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import type { Pool, PoolClient } from 'pg';

/** Cualquier cosa que pueda ejecutar SQL: el pool o una conexión puntual. */
type Queryable = Pool | PoolClient;

/**
 * Ejecutor de migraciones SQL propio (sin ORM: queremos ver el SQL exacto que corre).
 *
 * - Los archivos viven en `backend/db/migrations/NNN_descripcion.sql` y se aplican en orden.
 * - Cada migración corre en su propia transacción: si falla, no queda a medias.
 * - Se guarda el hash del archivo: si alguien edita una migración YA aplicada, se detecta y se aborta
 *   (los cambios de esquema se hacen siempre con una migración nueva).
 * - Un advisory lock evita que dos procesos migren a la vez.
 */

const MIGRATIONS_DIR = fileURLToPath(new URL('../../../../db/migrations/', import.meta.url));
const MIGRATION_FILE = /^\d{3}_[\w-]+\.sql$/;
const ADVISORY_LOCK_KEY = 4_242_001;

interface MigrationFile {
  version: string;
  sql: string;
  checksum: string;
}

async function readMigrationFiles(): Promise<MigrationFile[]> {
  const files = (await readdir(MIGRATIONS_DIR)).filter(name => MIGRATION_FILE.test(name)).sort();
  return Promise.all(
    files.map(async version => {
      const sql = await readFile(MIGRATIONS_DIR + version, 'utf8');
      return { version, sql, checksum: createHash('sha256').update(sql).digest('hex') };
    })
  );
}

async function ensureMigrationsTable(db: Queryable): Promise<void> {
  await db.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version    text PRIMARY KEY,
      checksum   text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now()
    )`);
}

async function appliedMigrations(db: Queryable): Promise<Map<string, string>> {
  const { rows } = await db.query<{ version: string; checksum: string }>(
    'SELECT version, checksum FROM schema_migrations'
  );
  return new Map(rows.map(row => [row.version, row.checksum]));
}

export async function runMigrations(pool: Pool, log: (message: string) => void = () => {}): Promise<string[]> {
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock($1)', [ADVISORY_LOCK_KEY]);
    // Todo con la MISMA conexión que tiene el advisory lock: pedirle otra al pool
    // con `max: 1` se quedaría esperando para siempre.
    await ensureMigrationsTable(client);

    const applied = await appliedMigrations(client);
    const newlyApplied: string[] = [];

    for (const migration of await readMigrationFiles()) {
      const previousChecksum = applied.get(migration.version);
      if (previousChecksum !== undefined) {
        if (previousChecksum !== migration.checksum) {
          throw new Error(
            `La migración ${migration.version} ya fue aplicada y su archivo cambió. Creá una migración nueva en lugar de editarla.`
          );
        }
        continue;
      }

      await client.query('BEGIN');
      try {
        await client.query(migration.sql);
        await client.query('INSERT INTO schema_migrations (version, checksum) VALUES ($1, $2)', [
          migration.version,
          migration.checksum
        ]);
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw new Error(`Falló la migración ${migration.version}: ${(error as Error).message}`);
      }
      newlyApplied.push(migration.version);
      log(`Migración aplicada: ${migration.version}`);
    }

    return newlyApplied;
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [ADVISORY_LOCK_KEY]).catch(() => {});
    client.release();
  }
}

/** Migraciones presentes en disco que todavía no se aplicaron (lo usa /ready). */
export async function pendingMigrations(pool: Pool): Promise<string[]> {
  await ensureMigrationsTable(pool);
  const applied = await appliedMigrations(pool);
  return (await readMigrationFiles()).map(m => m.version).filter(version => !applied.has(version));
}
