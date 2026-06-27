/**
 * Repositorio de Mascotas sobre el CardStore genérico. Lo distintivo del módulo:
 * emparejamiento por CHIP (ID natural ÚNICO). Al crear con un chip ya existente
 * no se duplica: se devuelve la tarjeta existente como "match" (perdido↔encontrado).
 */
import type { PetCard, PetStatus } from '@/lib/engine/types';
import { normalizeText, trigramSimilarity } from '@/lib/utils/text';
import { CardStore, getOrCreateStore } from './card-store';
import { seedStoredPets } from './seed';
import type { CreatePetInput, PetSimilarMatch, Repository } from './types';

const store = getOrCreateStore<PetCard>('pets', () => {
  const s = new CardStore<PetCard>({
    moduleId: 'pets',
    searchText: (c) => `${c.name ?? ''} ${c.breed ?? ''} ${c.chipId ?? ''} ${c.zone ?? ''}`,
    matchExtra: (c, extra) =>
      (!extra.direction || c.direction === extra.direction) &&
      (!extra.species || c.species === extra.species),
  });
  s.seed(seedStoredPets());
  return s;
});

function findByChip(chipId: string): PetCard | null {
  const norm = chipId.trim().toLowerCase();
  if (!norm) return null;
  return store.allLive().find((c) => (c.chipId ?? '').trim().toLowerCase() === norm) ?? null;
}

type PetsRepo = Pick<
  Repository,
  | 'listPets'
  | 'countPetsByStatus'
  | 'getPet'
  | 'createPet'
  | 'findSimilarPets'
  | 'transitionPet'
  | 'resolveActorPet'
  | 'revealPetContact'
>;

export const petsRepo: PetsRepo = {
  listPets(p) {
    return store.list({
      status: p.status,
      zone: p.zone,
      q: p.q,
      cursor: p.cursor,
      limit: p.limit,
      extra: { direction: p.direction, species: p.species },
    });
  },

  countPetsByStatus(f) {
    return store.countByStatus({
      zone: f.zone,
      q: f.q,
      extra: { direction: f.direction, species: f.species },
    });
  },

  getPet(id) {
    return store.get(id);
  },

  async createPet(input: CreatePetInput, ipHash) {
    // Restricción de unicidad de chip: si ya existe, se enlaza en vez de duplicar.
    if (input.chipId) {
      const existing = findByChip(input.chipId);
      if (existing) return { matched: existing };
    }
    const { card, manageToken } = await store.create(
      {
        module: 'pets',
        status: input.direction as PetStatus, // el estado inicial = la dirección
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
    return { created: { card, manageToken } };
  },

  async findSimilarPets(input, limit = 5) {
    const matches: PetSimilarMatch[] = [];
    // Coincidencia FUERTE por chip.
    if (input.chipId) {
      const byChip = findByChip(input.chipId);
      if (byChip) matches.push({ card: byChip, score: 1, reason: 'chip' });
    }
    // Coincidencia difusa por nombre/raza + especie + zona.
    const inputText = `${input.name ?? ''} ${input.breed ?? ''}`.trim();
    for (const card of store.allLive()) {
      if (matches.some((m) => m.card.id === card.id)) continue;
      let score = inputText ? trigramSimilarity(`${card.name ?? ''} ${card.breed ?? ''}`, inputText) : 0;
      if (input.species && card.species === input.species) score += 0.1;
      if (input.zone && card.zone && normalizeText(card.zone) === normalizeText(input.zone)) score += 0.1;
      if (score >= 0.4) matches.push({ card, score: Math.min(score, 1), reason: 'similar' });
    }
    return matches.sort((a, b) => b.score - a.score).slice(0, limit);
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
