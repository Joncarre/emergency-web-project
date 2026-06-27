/**
 * Repositorio de Bienes sobre el CardStore genérico. Lo distintivo: el ID
 * natural (matrícula / nº de serie) es OBLIGATORIO y ESTRICTAMENTE ÚNICO. Al
 * crear con un identificador ya existente no se duplica: se devuelve la ficha
 * existente (emparejamiento perdido↔encontrado garantizado por la unicidad).
 */
import type { GoodCard, GoodStatus } from '@/lib/engine/types';
import { normalizeText, trigramSimilarity } from '@/lib/utils/text';
import { CardStore, getOrCreateStore } from './card-store';
import { seedStoredGoods } from './seed';
import type { CreateGoodInput, GoodSimilarMatch, Repository } from './types';

const store = getOrCreateStore<GoodCard>('goods', () => {
  const s = new CardStore<GoodCard>({
    moduleId: 'goods',
    searchText: (c) => `${c.naturalId} ${c.zone ?? ''} ${c.description ?? ''}`,
    matchExtra: (c, extra) =>
      (!extra.direction || c.direction === extra.direction) &&
      (!extra.goodType || c.goodType === extra.goodType),
  });
  s.seed(seedStoredGoods());
  return s;
});

/** Normaliza el ID natural para comparación (sin espacios/guiones, mayúsculas). */
function normalizeNaturalId(value: string): string {
  return value.replace(/[\s-]/g, '').toUpperCase();
}

function findByNaturalId(naturalId: string): GoodCard | null {
  const norm = normalizeNaturalId(naturalId);
  if (!norm) return null;
  return store.allLive().find((c) => normalizeNaturalId(c.naturalId) === norm) ?? null;
}

type GoodsRepo = Pick<
  Repository,
  | 'listGoods'
  | 'countGoodsByStatus'
  | 'getGood'
  | 'createGood'
  | 'findSimilarGoods'
  | 'transitionGood'
  | 'resolveActorGood'
  | 'revealGoodContact'
>;

export const goodsRepo: GoodsRepo = {
  listGoods(p) {
    return store.list({
      status: p.status,
      zone: p.zone,
      q: p.q,
      cursor: p.cursor,
      limit: p.limit,
      extra: { direction: p.direction, goodType: p.goodType },
    });
  },

  countGoodsByStatus(f) {
    return store.countByStatus({
      zone: f.zone,
      q: f.q,
      extra: { direction: f.direction, goodType: f.goodType },
    });
  },

  getGood(id) {
    return store.get(id);
  },

  async createGood(input: CreateGoodInput, ipHash) {
    // Unicidad estricta del ID natural: si existe, se enlaza, nunca se duplica.
    const existing = findByNaturalId(input.naturalId);
    if (existing) return { matched: existing };

    const { card, manageToken } = await store.create(
      {
        module: 'goods',
        status: 'found' as GoodStatus,
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
    return { created: { card, manageToken } };
  },

  async findSimilarGoods(input, limit = 5) {
    const matches: GoodSimilarMatch[] = [];
    // Coincidencia FUERTE por ID natural.
    if (input.naturalId) {
      const byId = findByNaturalId(input.naturalId);
      if (byId) matches.push({ card: byId, score: 1, reason: 'natural_id' });
    }
    // Coincidencia difusa por zona + tipo (apoyo secundario).
    for (const card of store.allLive()) {
      if (matches.some((m) => m.card.id === card.id)) continue;
      let score = 0;
      if (input.goodType && card.goodType === input.goodType) score += 0.2;
      if (input.zone && card.zone) score += 0.3 * trigramSimilarity(card.zone, input.zone);
      if (input.zone && card.zone && normalizeText(card.zone) === normalizeText(input.zone)) score += 0.2;
      if (score >= 0.45) matches.push({ card, score: Math.min(score, 0.95), reason: 'similar' });
    }
    return matches.sort((a, b) => b.score - a.score).slice(0, limit);
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
