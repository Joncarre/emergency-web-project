/**
 * Repositorio de Personas: una capa FINA sobre el CardStore genérico. Solo
 * aporta lo propio del módulo (texto de búsqueda, filtro por dirección,
 * similitud trigram para anti-duplicados y el avistamiento que marca
 * "posible localización"). Todo lo demás lo da el motor.
 */
import type { PersonCard } from '@/lib/engine/types';
import { normalizeText, trigramSimilarity } from '@/lib/utils/text';
import { CardStore, getOrCreateStore } from './card-store';
import { seedStoredPeople } from './seed';
import type { CreatePersonInput, PersonSimilarMatch, Repository } from './types';

const store = getOrCreateStore<PersonCard>('people', () => {
  const s = new CardStore<PersonCard>({
    moduleId: 'people',
    searchText: (c) => `${c.fullName} ${c.zone ?? ''}`,
    matchExtra: (c, extra) => !extra.direction || c.direction === extra.direction,
  });
  s.seed(seedStoredPeople());
  return s;
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

export const peopleRepo: PeopleRepo = {
  listPeople(p) {
    return store.list({
      status: p.status,
      zone: p.zone,
      q: p.q,
      cursor: p.cursor,
      limit: p.limit,
      extra: { direction: p.direction },
    });
  },

  countPeopleByStatus(f) {
    return store.countByStatus({ zone: f.zone, q: f.q, extra: { direction: f.direction } });
  },

  getPerson(id) {
    return store.get(id);
  },

  async createPerson(input: CreatePersonInput, ipHash) {
    const { card, manageToken } = await store.create(
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
    return { card, manageToken };
  },

  async findSimilarPeople(input, limit = 5) {
    const matches: PersonSimilarMatch[] = [];
    for (const card of store.allLive()) {
      let score = trigramSimilarity(card.fullName, input.fullName);
      if (input.zone && card.zone && normalizeText(card.zone) === normalizeText(input.zone)) {
        score += 0.1;
      }
      if (
        input.ageApprox != null &&
        card.ageApprox != null &&
        Math.abs(card.ageApprox - input.ageApprox) <= 3
      ) {
        score += 0.1;
      }
      if (score >= 0.35) matches.push({ card, score: Math.min(score, 1) });
    }
    return matches.sort((a, b) => b.score - a.score).slice(0, limit);
  },

  transitionPerson(id, to, ctx) {
    return store.transition(id, to, ctx);
  },

  async addSighting(id, input) {
    const res = await store.addSighting(id, { note: input.note, zone: input.zone, ipHash: input.ipHash });
    // Un avistamiento NO resuelve la ficha: la pasa a "posible localización".
    if (res.card.status === 'missing') {
      await store.transition(id, 'possible_sighting', { ipHash: input.ipHash });
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
