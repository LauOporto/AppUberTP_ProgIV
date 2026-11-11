/**
 * URL de la base de TESTS. Nunca es la base de desarrollo:
 *   - si existe TEST_DATABASE_URL, se usa esa;
 *   - si no, se toma DATABASE_URL (del .env) y se le agrega "_test" al nombre de la base.
 */
export function resolveTestDatabaseUrl(env: Record<string, string | undefined> = process.env): string {
  if (env.TEST_DATABASE_URL) return env.TEST_DATABASE_URL;

  const base = env.DATABASE_URL ?? 'postgresql://uber_user:uber_password@localhost:5432/uber_db';
  const url = new URL(base);
  const databaseName = url.pathname.replace(/^\//, '') || 'uber_db';
  url.pathname = `/${databaseName.endsWith('_test') ? databaseName : `${databaseName}_test`}`;
  return url.toString();
}

export function databaseNameOf(connectionString: string): string {
  return new URL(connectionString).pathname.replace(/^\//, '');
}
