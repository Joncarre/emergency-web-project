/**
 * Siembra de datos de ejemplo en Postgres (modo demo con BD real).
 * Uso:  node --env-file=.env db/seed.mjs
 * Incluye un chip y una matrícula conocidos, y un par oferta/necesidad en la
 * misma zona, para poder probar el emparejamiento.
 */
import { randomBytes } from 'node:crypto';
import { customAlphabet } from 'nanoid';
import pg from 'pg';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('✗ DATABASE_URL no está configurada.');
  process.exit(1);
}

const nano = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ_-', 12);
const tokenHash = () => randomBytes(32).toString('hex');

const client = new pg.Client({ connectionString: url });

async function insertCard(base, table, moduleCols, moduleVals, contact) {
  const id = nano();
  await client.query(
    `INSERT INTO cards (id, module, status, zone, description, photo_url, manage_token_hash)
     VALUES ($1,$2,$3,$4,$5,NULL,$6)`,
    [id, base.module, base.status, base.zone, base.description ?? null, tokenHash()],
  );
  const cols = ['card_id', ...moduleCols];
  const vals = [id, ...moduleVals];
  await client.query(
    `INSERT INTO ${table} (${cols.join(',')}) VALUES (${vals.map((_, i) => `$${i + 1}`).join(',')})`,
    vals,
  );
  if (contact) {
    await client.query(`INSERT INTO contacts (card_id, method, value) VALUES ($1,$2,$3)`, [id, contact.method, contact.value]);
  }
  return id;
}

const phone = { method: 'phone', value: '+34 600 000 000' };

try {
  await client.connect();
  await client.query('BEGIN');

  // Personas
  await insertCard({ module: 'people', status: 'missing', zone: 'Sector Norte', description: 'Chaqueta azul.' }, 'card_people', ['full_name', 'age_approx', 'direction'], ['María García', 34, 'searching'], phone);
  await insertCard({ module: 'people', status: 'possible_sighting', zone: 'Casco Antiguo', description: 'Persona mayor.' }, 'card_people', ['full_name', 'age_approx', 'direction'], ['José López', 78, 'searching'], phone);
  await insertCard({ module: 'people', status: 'located', zone: 'La Marina', description: null }, 'card_people', ['full_name', 'age_approx', 'direction'], ['Lucía Pérez', 12, 'found'], phone);

  // Mascotas (una con chip conocido)
  await insertCard({ module: 'pets', status: 'lost', zone: 'Sector Norte', description: 'Collar rojo.' }, 'card_pets', ['species', 'name', 'chip_id', 'breed', 'direction'], ['dog', 'Toby', '985112003456789', 'Mestizo', 'lost'], phone);
  await insertCard({ module: 'pets', status: 'found', zone: 'Cerro Verde', description: 'Sin collar.' }, 'card_pets', ['species', 'name', 'chip_id', 'breed', 'direction'], ['cat', 'Luna', null, 'Siamés', 'found'], phone);

  // Bienes (uno con matrícula conocida)
  await insertCard({ module: 'goods', status: 'found', zone: 'Ribera del Río', description: 'Con barro.' }, 'card_goods', ['good_type', 'natural_id', 'direction'], ['vehicle', '1234ABC', 'found'], phone);
  await insertCard({ module: 'goods', status: 'claimed', zone: 'Polígono Sur', description: null }, 'card_goods', ['good_type', 'natural_id', 'direction'], ['machinery', 'SN-100777', 'found'], phone);

  // Ofertas/Necesidades (par emparejable en la misma zona)
  await insertCard({ module: 'offers', status: 'active', zone: 'Sector Norte', description: 'Disponible toda la semana.' }, 'card_offers', ['kind', 'category', 'quantity', 'expires_at'], ['offer', 'water', '200 L', null], phone);
  await insertCard({ module: 'offers', status: 'active', zone: 'Sector Norte', description: 'Familia con niños.' }, 'card_offers', ['kind', 'category', 'quantity', 'expires_at'], ['need', 'water', '50 L', null], phone);

  await client.query('COMMIT');
  console.log('✓ Datos de ejemplo insertados.');
} catch (err) {
  await client.query('ROLLBACK').catch(() => {});
  console.error('✗ Error al sembrar:', err.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
