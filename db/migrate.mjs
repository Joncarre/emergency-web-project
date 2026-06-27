/**
 * Aplica db/schema.sql a la base de datos de DATABASE_URL.
 * Uso:  node --env-file=.env db/migrate.mjs   (o exporta DATABASE_URL)
 * Pensado para el aprovisionamiento inicial (las sentencias no son idempotentes).
 */
import { readFileSync } from 'node:fs';
import pg from 'pg';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('✗ DATABASE_URL no está configurada.');
  process.exit(1);
}

const sql = readFileSync(new URL('./schema.sql', import.meta.url), 'utf8');
const client = new pg.Client({ connectionString: url });

try {
  await client.connect();
  await client.query(sql);
  console.log('✓ Esquema aplicado correctamente.');
} catch (err) {
  console.error('✗ Error al aplicar el esquema:', err.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
