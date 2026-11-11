/**
 * npm run migrate — aplica las migraciones pendientes sobre DATABASE_URL.
 */
import { config } from '../src/config/environment.js';
import { createPool } from '../src/infrastructure/db/postgres/pool.js';
import { runMigrations } from '../src/infrastructure/db/postgres/migrations.js';

const pool = createPool(config.database.url, { max: 1 });

try {
  const applied = await runMigrations(pool, message => console.log(`[migrate] ${message}`));
  console.log(applied.length ? `[migrate] ${applied.length} migración(es) aplicada(s).` : '[migrate] La base ya estaba al día.');
} catch (error) {
  console.error(`[migrate] ${(error as Error).message}`);
  process.exitCode = 1;
} finally {
  await pool.end();
}
