import pg from 'pg';

/**
 * Pool de conexiones a PostgreSQL. Se crea UNA vez en la composición y se cierra en el apagado ordenado.
 * Las fechas `timestamptz` llegan como `Date` (comportamiento por defecto de node-postgres).
 */
export function createPool(connectionString: string, options: { max?: number } = {}): pg.Pool {
  return new pg.Pool({
    connectionString,
    max: options.max ?? 10,
    // Si la base no responde, fallar rápido en vez de colgar el pedido.
    connectionTimeoutMillis: 5_000
  });
}

export type { Pool, PoolClient } from 'pg';
