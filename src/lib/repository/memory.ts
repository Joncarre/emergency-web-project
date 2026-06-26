/**
 * Implementación en memoria del repositorio (modo demo, sin BD).
 * Pensada para arrancar la plantilla al instante. Replica el comportamiento que
 * tendrá Postgres: paginación por cursor (keyset), filtros server-side,
 * conteos agregados, soft-delete y similitud trigram para anti-duplicados.
 */
import { nanoid } from 'nanoid';
import type { Actor, PersonCard, ProtectedContact, StoredCard } from '@/lib/engine/types';
import { getModule } from '@/lib/engine/modules';
import { assertTransition } from '@/lib/engine/state-machine';
import { generateManageToken, hashToken, verifyToken } from '@/lib/engine/tokens';
import { normalizeText, trigramSimilarity } from '@/lib/utils/text';
import { seedStoredPeople } from './seed';
import type {
  ActorContext,
  AddSightingInput,
  CreatePersonInput,
  CreatePersonResult,
  CursorPage,
  ListPeopleParams,
  Repository,
  Sighting,
  SimilarMatch,
  StatusCounts,
} from './types';

interface AuditEntry {
  cardId: string;
  action: string;
  at: string;
  ipHash: string | null;
}

interface MemoryStore {
  people: Map<string, StoredCard<PersonCard>>;
  sightings: Map<string, Sighting[]>;
  audit: AuditEntry[];
}

// Persistir entre recargas en caliente (HMR) durante el desarrollo.
const g = globalThis as unknown as { __rrStore?: MemoryStore };
const store: MemoryStore =
  g.__rrStore ??
  (g.__rrStore = (() => {
    const people = new Map<string, StoredCard<PersonCard>>();
    for (const sc of seedStoredPeople()) people.set(sc.card.id, sc);
    return { people, sightings: new Map(), audit: [] };
  })());

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

function encodeCursor(card: PersonCard): string {
  return Buffer.from(`${card.createdAt}|${card.id}`).toString('base64url');
}
function decodeCursor(cursor: string): { createdAt: string; id: string } | null {
  try {
    const [createdAt, id] = Buffer.from(cursor, 'base64url').toString('utf8').split('|');
    if (!createdAt || !id) return null;
    return { createdAt, id };
  } catch {
    return null;
  }
}

/** Orden estable descendente por (createdAt, id) para keyset pagination. */
function cmpDesc(a: PersonCard, b: PersonCard): number {
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? 1 : -1;
  return a.id < b.id ? 1 : -1;
}

function matchesFilters(card: PersonCard, p: ListPeopleParams): boolean {
  if (card.deletedAt) return false;
  if (p.status && card.status !== p.status) return false;
  if (p.direction && card.direction !== p.direction) return false;
  if (p.zone && !normalizeText(card.zone ?? '').includes(normalizeText(p.zone))) return false;
  if (p.q) {
    const q = normalizeText(p.q);
    const inName = normalizeText(card.fullName).includes(q);
    const inZone = normalizeText(card.zone ?? '').includes(q);
    const fuzzy = trigramSimilarity(card.fullName, p.q) >= 0.3;
    if (!inName && !inZone && !fuzzy) return false;
  }
  return true;
}

function pushAudit(cardId: string, action: string, ipHash: string | null): void {
  store.audit.push({ cardId, action, at: new Date().toISOString(), ipHash });
}

class MemoryRepository implements Repository {
  async listPeople(params: ListPeopleParams): Promise<CursorPage<PersonCard>> {
    const limit = Math.min(Math.max(params.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
    let rows = [...store.people.values()]
      .map((s) => s.card)
      .filter((c) => matchesFilters(c, params))
      .sort(cmpDesc);

    if (params.cursor) {
      const cur = decodeCursor(params.cursor);
      if (cur) {
        rows = rows.filter(
          (c) =>
            c.createdAt < cur.createdAt ||
            (c.createdAt === cur.createdAt && c.id < cur.id),
        );
      }
    }

    const items = rows.slice(0, limit);
    const nextCursor = rows.length > limit ? encodeCursor(items[items.length - 1]!) : null;
    return { items, nextCursor };
  }

  async countPeopleByStatus(
    filters: Pick<ListPeopleParams, 'zone' | 'direction' | 'q'>,
  ): Promise<StatusCounts> {
    const counts: StatusCounts = {};
    for (const s of getModule('people').statuses) counts[s.id] = 0;
    for (const { card } of store.people.values()) {
      if (matchesFilters(card, filters)) counts[card.status] = (counts[card.status] ?? 0) + 1;
    }
    return counts;
  }

  async getPerson(id: string): Promise<PersonCard | null> {
    const s = store.people.get(id);
    return s && !s.card.deletedAt ? s.card : null;
  }

  async createPerson(input: CreatePersonInput, ipHash: string | null): Promise<CreatePersonResult> {
    const now = new Date().toISOString();
    const id = nanoid(12);
    const manageToken = generateManageToken();
    const card: PersonCard = {
      id,
      module: 'people',
      status: getModule('people').initialStatus as PersonCard['status'],
      zone: input.zone,
      geo: input.geo,
      description: input.description,
      photoUrl: input.photoUrl,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      fullName: input.fullName,
      ageApprox: input.ageApprox,
      lastSeenAt: input.lastSeenAt,
      medicalNotes: input.medicalNotes,
      direction: input.direction,
    };
    store.people.set(id, { card, contact: input.contact, manageTokenHash: hashToken(manageToken) });
    pushAudit(id, 'create', ipHash);
    return { card, manageToken };
  }

  async findSimilarPeople(
    input: Pick<CreatePersonInput, 'fullName' | 'zone' | 'ageApprox'>,
    limit = 5,
  ): Promise<SimilarMatch[]> {
    const matches: SimilarMatch[] = [];
    for (const { card } of store.people.values()) {
      if (card.deletedAt) continue;
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
  }

  async resolveActor(id: string, ctx: ActorContext): Promise<Actor> {
    if (ctx.isModerator) return 'moderator';
    const s = store.people.get(id);
    if (s && ctx.manageToken && verifyToken(ctx.manageToken, s.manageTokenHash)) return 'owner';
    return 'public';
  }

  async transitionPerson(id: string, to: string, ctx: ActorContext): Promise<PersonCard> {
    const s = store.people.get(id);
    if (!s || s.card.deletedAt) throw new Error('not_found');
    const actor = await this.resolveActor(id, ctx);
    assertTransition('people', s.card.status, to, actor);
    s.card.status = to as PersonCard['status'];
    s.card.updatedAt = new Date().toISOString();
    pushAudit(id, `transition:${to}:${actor}`, ctx.ipHash ?? null);
    return s.card;
  }

  async addSighting(
    id: string,
    input: AddSightingInput,
  ): Promise<{ card: PersonCard; sighting: Sighting }> {
    const s = store.people.get(id);
    if (!s || s.card.deletedAt) throw new Error('not_found');

    const sighting: Sighting = {
      id: nanoid(10),
      cardId: id,
      note: input.note,
      zone: input.zone,
      createdAt: new Date().toISOString(),
    };
    const list = store.sightings.get(id) ?? [];
    list.push(sighting);
    store.sightings.set(id, list);
    pushAudit(id, 'sighting', input.ipHash);

    // Un avistamiento NO resuelve la ficha: la marca como "posible localización".
    if (s.card.status === 'missing') {
      await this.transitionPerson(id, 'possible_sighting', { ipHash: input.ipHash });
    }
    return { card: s.card, sighting };
  }

  async listSightings(id: string): Promise<Sighting[]> {
    return [...(store.sightings.get(id) ?? [])].sort((a, b) =>
      a.createdAt < b.createdAt ? 1 : -1,
    );
  }

  async revealContact(id: string): Promise<ProtectedContact | null> {
    const s = store.people.get(id);
    if (!s || s.card.deletedAt) return null;
    pushAudit(id, 'reveal_contact', null);
    return s.contact;
  }
}

export const memoryRepository: Repository = new MemoryRepository();
