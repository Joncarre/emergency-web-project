/**
 * Núcleo genérico del motor en memoria. Implementa UNA sola vez la mecánica
 * común a todos los módulos: paginación por cursor (keyset), filtros y búsqueda
 * server-side, conteos agregados, máquina de estados, tokens de gestión,
 * soft-delete, avistamientos y audit log.
 *
 * Cada módulo (Personas, Mascotas, …) instancia un CardStore<T> y solo aporta
 * cómo buscar su texto y sus filtros propios. Esta es la tesis del proyecto:
 * compartir el motor reduce drásticamente el código y la superficie de error.
 */
import { nanoid } from 'nanoid';
import type { Actor, CardBase, ModuleId, ProtectedContact, StoredCard } from '@/lib/engine/types';
import { assertTransition } from '@/lib/engine/state-machine';
import { generateManageToken, hashToken, verifyToken } from '@/lib/engine/tokens';
import { getModule } from '@/lib/engine/modules';
import { normalizeText } from '@/lib/utils/text';
import type { ActorContext, CursorPage, Sighting, StatusCounts } from './types';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

export interface ListQuery {
  status?: string;
  zone?: string;
  q?: string;
  cursor?: string | null;
  limit?: number;
  /** Filtros específicos del módulo (p. ej. direction, species). */
  extra?: Record<string, string | undefined>;
}

interface AuditEntry {
  cardId: string;
  action: string;
  at: string;
  ipHash: string | null;
}

export interface CardStoreConfig<T extends CardBase> {
  moduleId: ModuleId;
  /** Texto indexable para la búsqueda libre (`q`). */
  searchText: (card: T) => string;
  /** Aplica filtros propios del módulo. Devuelve false para excluir. */
  matchExtra?: (card: T, extra: Record<string, string | undefined>) => boolean;
}

function encodeCursor(card: CardBase): string {
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
function cmpDesc(a: CardBase, b: CardBase): number {
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? 1 : -1;
  return a.id < b.id ? 1 : -1;
}

export class CardStore<T extends CardBase> {
  private cards = new Map<string, StoredCard<T>>();
  private sightings = new Map<string, Sighting[]>();
  private audit: AuditEntry[] = [];

  constructor(private cfg: CardStoreConfig<T>) {}

  seed(rows: StoredCard<T>[]): void {
    for (const r of rows) this.cards.set(r.card.id, r);
  }

  /** Tarjetas vivas (no borradas) — para similitud/emparejamiento por módulo. */
  allLive(): T[] {
    return [...this.cards.values()].map((s) => s.card).filter((c) => !c.deletedAt);
  }

  private matches(card: T, q: ListQuery): boolean {
    if (card.deletedAt) return false;
    if (q.status && card.status !== q.status) return false;
    if (q.zone && !normalizeText(card.zone ?? '').includes(normalizeText(q.zone))) return false;
    if (q.q && !normalizeText(this.cfg.searchText(card)).includes(normalizeText(q.q))) return false;
    if (q.extra && this.cfg.matchExtra && !this.cfg.matchExtra(card, q.extra)) return false;
    return true;
  }

  async list(query: ListQuery): Promise<CursorPage<T>> {
    const limit = Math.min(Math.max(query.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
    let rows = this.allLive()
      .filter((c) => this.matches(c, query))
      .sort(cmpDesc);

    if (query.cursor) {
      const cur = decodeCursor(query.cursor);
      if (cur) {
        rows = rows.filter(
          (c) => c.createdAt < cur.createdAt || (c.createdAt === cur.createdAt && c.id < cur.id),
        );
      }
    }

    const items = rows.slice(0, limit);
    const nextCursor = rows.length > limit ? encodeCursor(items[items.length - 1]!) : null;
    return { items, nextCursor };
  }

  async countByStatus(filters: Omit<ListQuery, 'status' | 'cursor' | 'limit'>): Promise<StatusCounts> {
    const counts: StatusCounts = {};
    for (const s of getModule(this.cfg.moduleId).statuses) counts[s.id] = 0;
    for (const card of this.allLive()) {
      if (this.matches(card, filters)) counts[card.status] = (counts[card.status] ?? 0) + 1;
    }
    return counts;
  }

  async get(id: string): Promise<T | null> {
    const s = this.cards.get(id);
    return s && !s.card.deletedAt ? s.card : null;
  }

  /** Crea una tarjeta: asigna id, marcas de tiempo, soft-delete y token. */
  async create(
    fields: Omit<T, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>,
    contact: ProtectedContact | null,
    ipHash: string | null,
  ): Promise<{ card: T; manageToken: string }> {
    const now = new Date().toISOString();
    const id = nanoid(12);
    const manageToken = generateManageToken();
    const card = { ...fields, id, createdAt: now, updatedAt: now, deletedAt: null } as T;
    this.cards.set(id, { card, contact, manageTokenHash: hashToken(manageToken) });
    this.pushAudit(id, 'create', ipHash);
    return { card, manageToken };
  }

  async resolveActor(id: string, ctx: ActorContext): Promise<Actor> {
    if (ctx.isModerator) return 'moderator';
    const s = this.cards.get(id);
    if (s && ctx.manageToken && verifyToken(ctx.manageToken, s.manageTokenHash)) return 'owner';
    return 'public';
  }

  async transition(id: string, to: string, ctx: ActorContext): Promise<T> {
    const s = this.cards.get(id);
    if (!s || s.card.deletedAt) throw new Error('not_found');
    const actor = await this.resolveActor(id, ctx);
    assertTransition(this.cfg.moduleId, s.card.status, to, actor);
    s.card.status = to as T['status'];
    s.card.updatedAt = new Date().toISOString();
    this.pushAudit(id, `transition:${to}:${actor}`, ctx.ipHash ?? null);
    return s.card;
  }

  async addSighting(
    id: string,
    input: { note: string | null; zone: string | null; ipHash: string | null },
  ): Promise<{ card: T; sighting: Sighting }> {
    const s = this.cards.get(id);
    if (!s || s.card.deletedAt) throw new Error('not_found');
    const sighting: Sighting = {
      id: nanoid(10),
      cardId: id,
      note: input.note,
      zone: input.zone,
      createdAt: new Date().toISOString(),
    };
    const list = this.sightings.get(id) ?? [];
    list.push(sighting);
    this.sightings.set(id, list);
    this.pushAudit(id, 'sighting', input.ipHash);
    return { card: s.card, sighting };
  }

  async listSightings(id: string): Promise<Sighting[]> {
    return [...(this.sightings.get(id) ?? [])].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }

  async revealContact(id: string): Promise<ProtectedContact | null> {
    const s = this.cards.get(id);
    if (!s || s.card.deletedAt) return null;
    this.pushAudit(id, 'reveal_contact', null);
    return s.contact;
  }

  private pushAudit(cardId: string, action: string, ipHash: string | null): void {
    this.audit.push({ cardId, action, at: new Date().toISOString(), ipHash });
  }
}

/** Devuelve un CardStore persistente entre recargas en caliente (HMR) en dev. */
export function getOrCreateStore<T extends CardBase>(
  key: string,
  factory: () => CardStore<T>,
): CardStore<T> {
  const g = globalThis as unknown as { __rrStores?: Map<string, CardStore<CardBase>> };
  const registry = (g.__rrStores ??= new Map());
  if (!registry.has(key)) registry.set(key, factory() as unknown as CardStore<CardBase>);
  return registry.get(key) as unknown as CardStore<T>;
}
