/**
 * Repositorio de Ofertas/Necesidades sobre el CardStore genérico. Es el módulo
 * más flexible: no hay ID natural ni anti-duplicados; lo distintivo es el
 * EMPAREJAMIENTO por categoría + zona entre las dos caras (oferta↔necesidad).
 */
import type { OfferCard, OfferStatus } from '@/lib/engine/types';
import { normalizeText, trigramSimilarity } from '@/lib/utils/text';
import { CardStore, getOrCreateStore } from './card-store';
import { seedStoredOffers } from './seed';
import type { CreateOfferInput, OfferMatch, Repository } from './types';

const store = getOrCreateStore<OfferCard>('offers', () => {
  const s = new CardStore<OfferCard>({
    moduleId: 'offers',
    searchText: (c) => `${c.category} ${c.quantity ?? ''} ${c.zone ?? ''} ${c.description ?? ''}`,
    matchExtra: (c, extra) =>
      (!extra.kind || c.kind === extra.kind) && (!extra.category || c.category === extra.category),
  });
  s.seed(seedStoredOffers());
  return s;
});

type OffersRepo = Pick<
  Repository,
  | 'listOffers'
  | 'countOffersByStatus'
  | 'getOffer'
  | 'createOffer'
  | 'findMatchingOffers'
  | 'transitionOffer'
  | 'resolveActorOffer'
  | 'revealOfferContact'
>;

export const offersRepo: OffersRepo = {
  listOffers(p) {
    return store.list({
      status: p.status,
      zone: p.zone,
      q: p.q,
      cursor: p.cursor,
      limit: p.limit,
      extra: { kind: p.kind, category: p.category },
    });
  },

  countOffersByStatus(f) {
    return store.countByStatus({
      zone: f.zone,
      q: f.q,
      extra: { kind: f.kind, category: f.category },
    });
  },

  getOffer(id) {
    return store.get(id);
  },

  async createOffer(input: CreateOfferInput, ipHash) {
    const { card, manageToken } = await store.create(
      {
        module: 'offers',
        status: 'active' as OfferStatus,
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
    return { card, manageToken };
  },

  async findMatchingOffers(input, limit = 5) {
    // El emparejamiento es con la CARA OPUESTA: una oferta busca necesidades y
    // viceversa, misma categoría, ordenado por proximidad de zona.
    const opposite = input.kind === 'offer' ? 'need' : 'offer';
    const matches: OfferMatch[] = [];
    for (const card of store.allLive()) {
      if (card.id === input.excludeId) continue;
      if (card.status !== 'active') continue;
      if (card.kind !== opposite) continue;
      if (card.category !== input.category) continue;
      let score = 0.5; // misma categoría y cara opuesta = base
      if (input.zone && card.zone) {
        if (normalizeText(card.zone) === normalizeText(input.zone)) score += 0.5;
        else score += 0.3 * trigramSimilarity(card.zone, input.zone);
      }
      matches.push({ card, score: Math.min(score, 1) });
    }
    return matches.sort((a, b) => b.score - a.score).slice(0, limit);
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
