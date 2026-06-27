/**
 * Repositorio de Ofertas/Necesidades sobre Postgres. Emparejamiento por
 * categoría + zona con la cara opuesta (oferta↔necesidad), puntuado por
 * proximidad de zona (igualdad fuerte, trigram como aproximación).
 */
import type { OfferCard } from '@/lib/engine/types';
import type { CreateOfferInput, MatchOffersInput, OfferMatch, Repository } from '../types';
import { PgCardStore, baseFromRow, commonCols, fromJoin, toIso } from './pg-card-store';
import { getPool } from './pool';

const SELECT_COLS = `m.kind, m.category, m.quantity, m.expires_at AS "expiresAt"`;

function mapRow(row: Record<string, unknown>): OfferCard {
  return {
    ...baseFromRow(row),
    module: 'offers',
    kind: row.kind as OfferCard['kind'],
    category: row.category as OfferCard['category'],
    quantity: (row.quantity as string | null) ?? null,
    expiresAt: row.expiresAt ? toIso(row.expiresAt) : null,
  } as OfferCard;
}

const store = new PgCardStore<OfferCard>({
  moduleId: 'offers',
  table: 'card_offers',
  selectCols: SELECT_COLS,
  insertCols: ['kind', 'category', 'quantity', 'expires_at'],
  insertValues: (f) => [f.kind, f.category, f.quantity, f.expiresAt],
  searchCols: ['m.category', 'm.quantity', 'c.zone', 'c.description'],
  buildExtra: (extra, p) => {
    const c: string[] = [];
    if (extra.kind) c.push(`m.kind = ${p.push(extra.kind)}`);
    if (extra.category) c.push(`m.category = ${p.push(extra.category)}`);
    return c;
  },
  mapRow,
});

type OffersRepo = Pick<
  Repository,
  'listOffers' | 'countOffersByStatus' | 'getOffer' | 'createOffer' | 'findMatchingOffers' | 'transitionOffer' | 'resolveActorOffer' | 'revealOfferContact'
>;

export const offersPgRepo: OffersRepo = {
  listOffers(p) {
    return store.list({ status: p.status, zone: p.zone, q: p.q, cursor: p.cursor, limit: p.limit, extra: { kind: p.kind, category: p.category } });
  },
  countOffersByStatus(f) {
    return store.countByStatus({ zone: f.zone, q: f.q, extra: { kind: f.kind, category: f.category } });
  },
  getOffer(id) {
    return store.get(id);
  },
  createOffer(input: CreateOfferInput, ipHash) {
    return store.create(
      {
        module: 'offers',
        status: 'active',
        zone: input.zone,
        geo: input.geo,
        description: input.description,
        photoUrl: input.photoUrl,
        kind: input.kind,
        category: input.category,
        quantity: input.quantity,
        expiresAt: input.expiresAt,
      },
      input.contact,
      ipHash,
    );
  },
  async findMatchingOffers(input: MatchOffersInput, limit = 5): Promise<OfferMatch[]> {
    const opposite = input.kind === 'offer' ? 'need' : 'offer';
    const score = `(0.5
      + CASE
          WHEN $3::text IS NOT NULL AND c.zone IS NOT NULL AND unaccent(lower(c.zone)) = unaccent(lower($3)) THEN 0.5
          WHEN $3::text IS NOT NULL AND c.zone IS NOT NULL THEN 0.3 * similarity(unaccent(lower(c.zone)), unaccent(lower($3)))
          ELSE 0
        END)`;
    const sql = `SELECT ${commonCols()}, ${SELECT_COLS}, ${score} AS score
      ${fromJoin('card_offers')}
      WHERE c.deleted_at IS NULL AND c.module = 'offers' AND c.status = 'active'
        AND m.kind = $1 AND m.category = $2 AND ($4::text IS NULL OR c.id <> $4)
      ORDER BY score DESC LIMIT $5`;
    const { rows } = await getPool().query(sql, [opposite, input.category, input.zone, input.excludeId ?? null, limit]);
    return rows.map((r) => ({ card: mapRow(r), score: Math.min(Number(r.score), 1) }));
  },
  transitionOffer(id, to, ctx) {
    return store.transition(id, to, ctx);
  },
  resolveActorOffer(id, ctx) {
    return store.resolveActor(id, ctx);
  },
  revealOfferContact(id) {
    return store.revealContact(id);
  },
};
