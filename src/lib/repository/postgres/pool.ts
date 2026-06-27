/**
 * Pool de conexiones Postgres (perezoso). Se crea en la primera consulta, solo
 * cuando hay DATABASE_URL y el repositorio Postgres está activo.
 */
import pg from 'pg';

const { Pool, types } = pg;

// timestamptz (OID 1184) y timestamp (1114): devolverlos como string ISO en vez
// de Date local, para que el mapeo a dominio sea determinista y sin zona local.
types.setTypeParser(1184, (v) => v);
types.setTypeParser(1114, (v) => v);

let pool: pg.Pool | null = null;

export function getPool(): pg.Pool {
  if (!pool) {
    const connectionString = import.meta.env.DATABASE_URL;
    if (!connectionString) throw new Error('DATABASE_URL no está configurada');
    pool = new Pool({ connectionString, max: 10, idleTimeoutMillis: 30_000 });
  }
  return pool;
}
