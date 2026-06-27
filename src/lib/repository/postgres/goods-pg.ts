/**
 * Repositorio de Bienes sobre Postgres. ID natural OBLIGATORIO y ÚNICO; la
 * comparación de unicidad es insensible a espacios/guiones/mayúsculas.
 */
import type { GoodCard } from '@/lib/engine/types';
import type { CreateGoodInput, GoodSimilarMatch, Repository, SimilarGoodsInput } from '../types';
import { PgCardStore, baseFromRow, commonCols, fromJoin } from './pg-card-store';
import { getPool } from './pool';

const SELECT_COLS = `m.good_type AS "goodType", m.natural_id AS "naturalId", m.direction`;
// Normaliza un identificador: sin espacios ni guiones, en mayúsculas.
const NORM = (col: string) => `upper(regexp_replace(${col}, '[\\s-]', '', 'g'))`;

function mapRow(row: Record<string, unknown>): GoodCard {
  return {
    ...baseFromRow(row),
    module: 'goods',
    goodType: row.goodType as GoodCard['goodType'],
    naturalId: row.naturalId as string,
    direction: row.direction as GoodCard['direction'],
  } as GoodCard;
}

const store = new PgCardStore<GoodCard>({
  moduleId: 'goods',
  table: 'card_goods',
  selectCols: SELECT_COLS,
  insertCols: ['good_type', 'natural_id', 'direction'],
  insertValues: (f) => [f.goodType, f.naturalId, f.direction],
  searchCols: ['m.natural_id', 'c.zone', 'c.description'],
  buildExtra: (extra, p) => {
    const c: string[] = [];
    if (extra.direction) c.push(`m.direction = ${p.push(extra.direction)}`);
    if (extra.goodType) c.push(`m.good_type = ${p.push(extra.goodType)}`);
    return c;
  },
  mapRow,
});

async function findByNaturalId(naturalId: string): Promise<GoodCard | null> {
  const sql = `SELECT ${commonCols()}, ${SELECT_COLS} ${fromJoin('card_goods')}
    WHERE c.deleted_at IS NULL AND c.module = 'goods' AND ${NORM('m.natural_id')} = ${NORM('$1')} LIMIT 1`;
  const { rows } = await getPool().query(sql, [naturalId]);
  return rows[0] ? mapRow(rows[0]) : null;
}

type GoodsRepo = Pick<
  Repository,
  'listGoods' | 'countGoodsByStatus' | 'getGood' | 'createGood' | 'findSimilarGoods' | 'transitionGood' | 'resolveActorGood' | 'revealGoodContact'
>;

export const goodsPgRepo: GoodsRepo = {
  listGoods(p) {
    return store.list({ status: p.status, zone: p.zone, q: p.q, cursor: p.cursor, limit: p.limit, extra: { direction: p.direction, goodType: p.goodType } });
  },
  countGoodsByStatus(f) {
    return store.countByStatus({ zone: f.zone, q: f.q, extra: { direction: f.direction, goodType: f.goodType } });
  },
  getGood(id) {
    return store.get(id);
  },
  async createGood(input: CreateGoodInput, ipHash) {
    const existing = await findByNaturalId(input.naturalId);
    if (existing) return { matched: existing };
    const created = await store.create(
      {
        module: 'goods',
        status: 'found',
        zone: input.zone,
        geo: input.geo,
        description: input.description,
        photoUrl: input.photoUrl,
        goodType: input.goodType,
        naturalId: input.naturalId,
        direction: input.direction,
      },
      input.contact,
      ipHash,
    );
    return { created };
  },
  async findSimilarGoods(input: SimilarGoodsInput, limit = 5): Promise<GoodSimilarMatch[]> {
    const matches: GoodSimilarMatch[] = [];
    if (input.naturalId) {
      const byId = await findByNaturalId(input.naturalId);
      if (byId) matches.push({ card: byId, score: 1, reason: 'natural_id' });
    }
    const score = `(
      CASE WHEN $1::text IS NOT NULL AND m.good_type = $1 THEN 0.2 ELSE 0 END
      + CASE WHEN $2::text IS NOT NULL AND c.zone IS NOT NULL THEN 0.3 * similarity(unaccent(lower(c.zone)), unaccent(lower($2))) ELSE 0 END
      + CASE WHEN $2::text IS NOT NULL AND unaccent(lower(c.zone)) = unaccent(lower($2)) THEN 0.2 ELSE 0 END
    )`;
    const sql = `SELECT ${commonCols()}, ${SELECT_COLS}, ${score} AS score
      ${fromJoin('card_goods')}
      WHERE c.deleted_at IS NULL AND c.module = 'goods' AND ${score} >= 0.45
      ORDER BY score DESC LIMIT $3`;
    const { rows } = await getPool().query(sql, [input.goodType, input.zone, limit]);
    for (const r of rows) {
      if (!matches.some((m) => m.card.id === r.id)) matches.push({ card: mapRow(r), score: Math.min(Number(r.score), 0.95), reason: 'similar' });
    }
    return matches.slice(0, limit);
  },
  transitionGood(id, to, ctx) {
    return store.transition(id, to, ctx);
  },
  resolveActorGood(id, ctx) {
    return store.resolveActor(id, ctx);
  },
  revealGoodContact(id) {
    return store.revealContact(id);
  },
};
