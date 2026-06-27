/**
 * Repositorio de Personas sobre Postgres: capa fina sobre PgCardStore. La
 * similitud anti-duplicados usa pg_trgm (similarity + unaccent) en la BD, con
 * los mismos refuerzos de zona/edad que la versión en memoria.
 */
import type { PersonCard } from '@/lib/engine/types';
import type { CreatePersonInput, PersonSimilarMatch, Repository } from '../types';
import { PgCardStore, baseFromRow, commonCols, fromJoin, toIso } from './pg-card-store';
import { getPool } from './pool';

const SELECT_COLS = `m.full_name AS "fullName", m.age_approx AS "ageApprox",
  m.last_seen_at AS "lastSeenAt", m.medical_notes AS "medicalNotes", m.direction`;

function mapRow(row: Record<string, unknown>): PersonCard {
  return {
    ...baseFromRow(row),
    module: 'people',
    fullName: row.fullName as string,
    ageApprox: (row.ageApprox as number | null) ?? null,
    lastSeenAt: row.lastSeenAt ? toIso(row.lastSeenAt) : null,
    medicalNotes: (row.medicalNotes as string | null) ?? null,
    direction: row.direction as PersonCard['direction'],
  } as PersonCard;
}

const store = new PgCardStore<PersonCard>({
  moduleId: 'people',
  table: 'card_people',
  selectCols: SELECT_COLS,
  insertCols: ['full_name', 'age_approx', 'last_seen_at', 'medical_notes', 'direction'],
  insertValues: (f) => [f.fullName, f.ageApprox, f.lastSeenAt, f.medicalNotes, f.direction],
  searchCols: ['m.full_name', 'c.zone'],
  buildExtra: (extra, p) => (extra.direction ? [`m.direction = ${p.push(extra.direction)}`] : []),
  mapRow,
});

type PeopleRepo = Pick<
  Repository,
  | 'listPeople'
  | 'countPeopleByStatus'
  | 'getPerson'
  | 'createPerson'
  | 'findSimilarPeople'
  | 'transitionPerson'
  | 'addSighting'
  | 'listSightings'
  | 'resolveActor'
  | 'revealContact'
>;

export const peoplePgRepo: PeopleRepo = {
  listPeople(p) {
    return store.list({ status: p.status, zone: p.zone, q: p.q, cursor: p.cursor, limit: p.limit, extra: { direction: p.direction } });
  },
  countPeopleByStatus(f) {
    return store.countByStatus({ zone: f.zone, q: f.q, extra: { direction: f.direction } });
  },
  getPerson(id) {
    return store.get(id);
  },
  createPerson(input: CreatePersonInput, ipHash) {
    return store.create(
      {
        module: 'people',
        status: 'missing',
        zone: input.zone,
        geo: input.geo,
        description: input.description,
        photoUrl: input.photoUrl,
        fullName: input.fullName,
        ageApprox: input.ageApprox,
        lastSeenAt: input.lastSeenAt,
        medicalNotes: input.medicalNotes,
        direction: input.direction,
      },
      input.contact,
      ipHash,
    );
  },
  async findSimilarPeople(input, limit = 5): Promise<PersonSimilarMatch[]> {
    const score = `(
      similarity(unaccent(lower(m.full_name)), unaccent(lower($1)))
      + CASE WHEN $2::text IS NOT NULL AND unaccent(lower(c.zone)) = unaccent(lower($2)) THEN 0.1 ELSE 0 END
      + CASE WHEN $3::int IS NOT NULL AND m.age_approx IS NOT NULL AND abs(m.age_approx - $3::int) <= 3 THEN 0.1 ELSE 0 END
    )`;
    const sql = `SELECT ${commonCols()}, ${SELECT_COLS}, ${score} AS score
      ${fromJoin('card_people')}
      WHERE c.deleted_at IS NULL AND c.module = 'people' AND ${score} >= 0.35
      ORDER BY score DESC LIMIT $4`;
    const { rows } = await getPool().query(sql, [input.fullName, input.zone, input.ageApprox, limit]);
    return rows.map((r) => ({ card: mapRow(r), score: Number(r.score) }));
  },
  transitionPerson(id, to, ctx) {
    return store.transition(id, to, ctx);
  },
  async addSighting(id, input) {
    const res = await store.addSighting(id, { note: input.note, zone: input.zone, ipHash: input.ipHash });
    if (res.card.status === 'missing') {
      await store.transition(id, 'possible_sighting', { ipHash: input.ipHash });
      res.card.status = 'possible_sighting';
    }
    return res;
  },
  listSightings(id) {
    return store.listSightings(id);
  },
  resolveActor(id, ctx) {
    return store.resolveActor(id, ctx);
  },
  revealContact(id) {
    return store.revealContact(id);
  },
};
