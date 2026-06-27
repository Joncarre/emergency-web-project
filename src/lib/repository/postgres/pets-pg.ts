/**
 * Repositorio de Mascotas sobre Postgres. Emparejamiento por chip (ID natural):
 * comprobación exacta (trim+lower) antes de crear -> si existe, se enlaza.
 */
import type { PetCard } from '@/lib/engine/types';
import type { CreatePetInput, PetSimilarMatch, Repository, SimilarPetsInput } from '../types';
import { PgCardStore, baseFromRow, commonCols, fromJoin } from './pg-card-store';
import { getPool } from './pool';

const SELECT_COLS = `m.species, m.name, m.chip_id AS "chipId", m.breed, m.direction`;

function mapRow(row: Record<string, unknown>): PetCard {
  return {
    ...baseFromRow(row),
    module: 'pets',
    species: row.species as PetCard['species'],
    name: (row.name as string | null) ?? null,
    chipId: (row.chipId as string | null) ?? null,
    breed: (row.breed as string | null) ?? null,
    direction: row.direction as PetCard['direction'],
  } as PetCard;
}

const store = new PgCardStore<PetCard>({
  moduleId: 'pets',
  table: 'card_pets',
  selectCols: SELECT_COLS,
  insertCols: ['species', 'name', 'chip_id', 'breed', 'direction'],
  insertValues: (f) => [f.species, f.name, f.chipId, f.breed, f.direction],
  searchCols: ['m.name', 'm.breed', 'm.chip_id', 'c.zone'],
  buildExtra: (extra, p) => {
    const c: string[] = [];
    if (extra.direction) c.push(`m.direction = ${p.push(extra.direction)}`);
    if (extra.species) c.push(`m.species = ${p.push(extra.species)}`);
    return c;
  },
  mapRow,
});

async function findByChip(chipId: string): Promise<PetCard | null> {
  const sql = `SELECT ${commonCols()}, ${SELECT_COLS} ${fromJoin('card_pets')}
    WHERE c.deleted_at IS NULL AND c.module = 'pets'
      AND m.chip_id IS NOT NULL AND lower(trim(m.chip_id)) = lower(trim($1)) LIMIT 1`;
  const { rows } = await getPool().query(sql, [chipId]);
  return rows[0] ? mapRow(rows[0]) : null;
}

type PetsRepo = Pick<
  Repository,
  'listPets' | 'countPetsByStatus' | 'getPet' | 'createPet' | 'findSimilarPets' | 'transitionPet' | 'resolveActorPet' | 'revealPetContact'
>;

export const petsPgRepo: PetsRepo = {
  listPets(p) {
    return store.list({ status: p.status, zone: p.zone, q: p.q, cursor: p.cursor, limit: p.limit, extra: { direction: p.direction, species: p.species } });
  },
  countPetsByStatus(f) {
    return store.countByStatus({ zone: f.zone, q: f.q, extra: { direction: f.direction, species: f.species } });
  },
  getPet(id) {
    return store.get(id);
  },
  async createPet(input: CreatePetInput, ipHash) {
    if (input.chipId) {
      const existing = await findByChip(input.chipId);
      if (existing) return { matched: existing };
    }
    const created = await store.create(
      {
        module: 'pets',
        status: input.direction, // estado inicial = dirección (lost/found)
        zone: input.zone,
        geo: input.geo,
        description: input.description,
        photoUrl: input.photoUrl,
        species: input.species,
        name: input.name,
        chipId: input.chipId,
        breed: input.breed,
        direction: input.direction,
      },
      input.contact,
      ipHash,
    );
    return { created };
  },
  async findSimilarPets(input: SimilarPetsInput, limit = 5): Promise<PetSimilarMatch[]> {
    const matches: PetSimilarMatch[] = [];
    if (input.chipId) {
      const byChip = await findByChip(input.chipId);
      if (byChip) matches.push({ card: byChip, score: 1, reason: 'chip' });
    }
    const score = `(
      similarity(unaccent(lower(coalesce(m.name,'') || ' ' || coalesce(m.breed,''))), unaccent(lower($1)))
      + CASE WHEN $2::text IS NOT NULL AND m.species = $2 THEN 0.1 ELSE 0 END
      + CASE WHEN $3::text IS NOT NULL AND unaccent(lower(c.zone)) = unaccent(lower($3)) THEN 0.1 ELSE 0 END
    )`;
    const sql = `SELECT ${commonCols()}, ${SELECT_COLS}, ${score} AS score
      ${fromJoin('card_pets')}
      WHERE c.deleted_at IS NULL AND c.module = 'pets' AND ${score} >= 0.4
      ORDER BY score DESC LIMIT $4`;
    const text = `${input.name ?? ''} ${input.breed ?? ''}`.trim();
    if (text) {
      const { rows } = await getPool().query(sql, [text, input.species, input.zone, limit]);
      for (const r of rows) {
        if (!matches.some((m) => m.card.id === r.id)) matches.push({ card: mapRow(r), score: Number(r.score), reason: 'similar' });
      }
    }
    return matches.slice(0, limit);
  },
  transitionPet(id, to, ctx) {
    return store.transition(id, to, ctx);
  },
  resolveActorPet(id, ctx) {
    return store.resolveActor(id, ctx);
  },
  revealPetContact(id) {
    return store.revealContact(id);
  },
};
