/**
 * Motor genérico del repositorio sobre Postgres. Implementa UNA sola vez la
 * mecánica común a todos los módulos contra el esquema `cards` + tabla por
 * módulo: paginación por cursor (keyset), filtros/búsqueda server-side, conteos,
 * máquina de estados, tokens, soft-delete, avistamientos, contacto y audit.
 *
 * Cada módulo aporta su config (tabla, columnas, mapeo de filas, filtros).
 * Espejo SQL del CardStore en memoria, tras la MISMA interfaz Repository.
 */
import { nanoid } from 'nanoid';
import type { CardBase, ModuleId, ProtectedContact } from '@/lib/engine/types';
import { assertTransition } from '@/lib/engine/state-machine';
import { getModule } from '@/lib/engine/modules';
import { generateManageToken, hashToken, verifyToken } from '@/lib/engine/tokens';
import type { ActorContext, CursorPage, Sighting, StatusCounts } from '../types';
import { getPool } from './pool';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

export function toIso(v: unknown): string {
  if (v == null) return new Date().toISOString();
  if (v instanceof Date) return v.toISOString();
  return new Date(String(v)).toISOString();
}

/** Columnas comunes (tabla cards) aliased a camelCase del dominio. */
export function commonCols(): string {
  return `c.id, c.module, c.status, c.zone, NULL::text AS geo, c.description,
    c.photo_url AS "photoUrl", c.created_at AS "createdAt", c.updated_at AS "updatedAt",
    c.deleted_at AS "deletedAt"`;
}

export function fromJoin(table: string): string {
  return `FROM cards c JOIN ${table} m ON m.card_id = c.id`;
}

/** Construye los campos comunes de una tarjeta a partir de una fila. */
export function baseFromRow(row: Record<string, unknown>): CardBase {
  return {
    id: row.id as string,
    module: row.module as ModuleId,
    status: row.status as string,
    zone: (row.zone as string | null) ?? null,
    geo: null,
    description: (row.description as string | null) ?? null,
    photoUrl: (row.photoUrl as string | null) ?? null,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
    deletedAt: row.deletedAt ? toIso(row.deletedAt) : null,
  };
}

/** Acumulador de parámetros posicionales ($1, $2, …) seguro frente a inyección. */
export class Params {
  readonly values: unknown[] = [];
  push(v: unknown): string {
    this.values.push(v);
    return `$${this.values.length}`;
  }
}

function clampLimit(n: number | undefined): number {
  return Math.min(Math.max(n ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
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

export interface PgListQuery {
  status?: string;
  zone?: string;
  q?: string;
  cursor?: string | null;
  limit?: number;
  extra?: Record<string, string | undefined>;
}

export interface PgModuleConfig<T extends CardBase> {
  moduleId: ModuleId;
  table: string;
  /** Columnas de la tabla del módulo, aliased a camelCase (sin las comunes). */
  selectCols: string;
  /** Columnas (snake_case) de la tabla del módulo para INSERT, sin card_id. */
  insertCols: string[];
  /** Valores alineados con insertCols a partir de los campos de la tarjeta. */
  insertValues: (fields: Record<string, unknown>) => unknown[];
  /** Columnas cualificadas para la búsqueda libre `q` (ILIKE + unaccent). */
  searchCols: string[];
  /** Condiciones SQL para filtros propios del módulo (direction, species…). */
  buildExtra: (extra: Record<string, string | undefined>, p: Params) => string[];
  mapRow: (row: Record<string, unknown>) => T;
}

export class PgCardStore<T extends CardBase> {
  constructor(private cfg: PgModuleConfig<T>) {}

  private whereConds(p: Params, q: Omit<PgListQuery, 'cursor' | 'limit'>): string[] {
    const conds = [`c.module = ${p.push(this.cfg.moduleId)}`, `c.deleted_at IS NULL`];
    if (q.status) conds.push(`c.status = ${p.push(q.status)}`);
    if (q.zone) conds.push(`unaccent(lower(c.zone)) LIKE unaccent(lower(${p.push(`%${q.zone}%`)}))`);
    if (q.q) {
      const term = p.push(`%${q.q}%`);
      const ors = this.cfg.searchCols.map(
        (col) => `unaccent(lower(coalesce(${col},''))) LIKE unaccent(lower(${term}))`,
      );
      conds.push(`(${ors.join(' OR ')})`);
    }
    if (q.extra) conds.push(...this.cfg.buildExtra(q.extra, p));
    return conds;
  }

  async list(query: PgListQuery): Promise<CursorPage<T>> {
    const p = new Params();
    const conds = this.whereConds(p, query);
    if (query.cursor) {
      const cur = decodeCursor(query.cursor);
      if (cur) {
        conds.push(`(c.created_at, c.id) < (${p.push(cur.createdAt)}::timestamptz, ${p.push(cur.id)})`);
      }
    }
    const limit = clampLimit(query.limit);
    const sql = `SELECT ${commonCols()}, ${this.cfg.selectCols} ${fromJoin(this.cfg.table)}
      WHERE ${conds.join(' AND ')}
      ORDER BY c.created_at DESC, c.id DESC
      LIMIT ${p.push(limit + 1)}`;
    const { rows } = await getPool().query(sql, p.values);
    const items = rows.slice(0, limit).map((r) => this.cfg.mapRow(r));
    const nextCursor = rows.length > limit ? encodeCursor(items[items.length - 1]!) : null;
    return { items, nextCursor };
  }

  async countByStatus(filters: Omit<PgListQuery, 'status' | 'cursor' | 'limit'>): Promise<StatusCounts> {
    const p = new Params();
    const conds = this.whereConds(p, filters);
    const sql = `SELECT c.status, count(*)::int AS total
      ${fromJoin(this.cfg.table)} WHERE ${conds.join(' AND ')} GROUP BY c.status`;
    const { rows } = await getPool().query(sql, p.values);
    const counts: StatusCounts = {};
    for (const s of getModule(this.cfg.moduleId).statuses) counts[s.id] = 0;
    for (const row of rows) counts[row.status as string] = Number(row.total);
    return counts;
  }

  async get(id: string): Promise<T | null> {
    const sql = `SELECT ${commonCols()}, ${this.cfg.selectCols} ${fromJoin(this.cfg.table)}
      WHERE c.id = $1 AND c.module = $2 AND c.deleted_at IS NULL`;
    const { rows } = await getPool().query(sql, [id, this.cfg.moduleId]);
    return rows[0] ? this.cfg.mapRow(rows[0]) : null;
  }

  async create(
    fields: Omit<T, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>,
    contact: ProtectedContact | null,
    ipHash: string | null,
  ): Promise<{ card: T; manageToken: string }> {
    const id = nanoid(12);
    const manageToken = generateManageToken();
    const f = fields as unknown as Record<string, unknown>;
    const client = await getPool().connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO cards (id, module, status, zone, description, photo_url, manage_token_hash)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [id, this.cfg.moduleId, f.status, f.zone, f.description, f.photoUrl, hashToken(manageToken)],
      );
      const cols = ['card_id', ...this.cfg.insertCols];
      const vals = [id, ...this.cfg.insertValues(f)];
      const placeholders = vals.map((_, i) => `$${i + 1}`).join(', ');
      await client.query(`INSERT INTO ${this.cfg.table} (${cols.join(', ')}) VALUES (${placeholders})`, vals);
      if (contact) {
        await client.query(`INSERT INTO contacts (card_id, method, value) VALUES ($1,$2,$3)`, [
          id,
          contact.method,
          contact.value,
        ]);
      }
      await client.query(`INSERT INTO audit_log (card_id, action, ip_hash) VALUES ($1,'create',$2)`, [id, ipHash]);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
    const now = new Date().toISOString();
    const card = { ...fields, id, createdAt: now, updatedAt: now, deletedAt: null } as T;
    return { card, manageToken };
  }

  async resolveActor(id: string, ctx: ActorContext) {
    if (ctx.isModerator) return 'moderator' as const;
    const { rows } = await getPool().query(
      `SELECT manage_token_hash FROM cards WHERE id = $1 AND deleted_at IS NULL`,
      [id],
    );
    if (rows[0] && ctx.manageToken && verifyToken(ctx.manageToken, rows[0].manage_token_hash)) {
      return 'owner' as const;
    }
    return 'public' as const;
  }

  async transition(id: string, to: string, ctx: ActorContext): Promise<T> {
    const { rows } = await getPool().query(
      `SELECT status, manage_token_hash FROM cards WHERE id = $1 AND module = $2 AND deleted_at IS NULL`,
      [id, this.cfg.moduleId],
    );
    if (!rows[0]) throw new Error('not_found');
    const actor = ctx.isModerator
      ? 'moderator'
      : ctx.manageToken && verifyToken(ctx.manageToken, rows[0].manage_token_hash)
        ? 'owner'
        : 'public';
    assertTransition(this.cfg.moduleId, rows[0].status, to, actor);
    await getPool().query(`UPDATE cards SET status = $1, updated_at = now() WHERE id = $2`, [to, id]);
    await getPool().query(`INSERT INTO audit_log (card_id, action, ip_hash) VALUES ($1,$2,$3)`, [
      id,
      `transition:${to}:${actor}`,
      ctx.ipHash ?? null,
    ]);
    return (await this.get(id))!;
  }

  async addSighting(
    id: string,
    input: { note: string | null; zone: string | null; ipHash: string | null },
  ): Promise<{ card: T; sighting: Sighting }> {
    const exists = await getPool().query(
      `SELECT 1 FROM cards WHERE id = $1 AND module = $2 AND deleted_at IS NULL`,
      [id, this.cfg.moduleId],
    );
    if (!exists.rows[0]) throw new Error('not_found');
    const sid = nanoid(10);
    await getPool().query(`INSERT INTO sightings (id, card_id, note, zone) VALUES ($1,$2,$3,$4)`, [
      sid,
      id,
      input.note,
      input.zone,
    ]);
    await getPool().query(`INSERT INTO audit_log (card_id, action, ip_hash) VALUES ($1,'sighting',$2)`, [
      id,
      input.ipHash,
    ]);
    const card = (await this.get(id))!;
    return {
      card,
      sighting: { id: sid, cardId: id, note: input.note, zone: input.zone, createdAt: new Date().toISOString() },
    };
  }

  async listSightings(id: string): Promise<Sighting[]> {
    const { rows } = await getPool().query(
      `SELECT id, card_id AS "cardId", note, zone, created_at AS "createdAt"
       FROM sightings WHERE card_id = $1 ORDER BY created_at DESC`,
      [id],
    );
    return rows.map((r) => ({
      id: r.id,
      cardId: r.cardId,
      note: r.note,
      zone: r.zone,
      createdAt: toIso(r.createdAt),
    }));
  }

  async revealContact(id: string): Promise<ProtectedContact | null> {
    const { rows } = await getPool().query(`SELECT method, value FROM contacts WHERE card_id = $1`, [id]);
    if (!rows[0]) return null;
    await getPool().query(`INSERT INTO audit_log (card_id, action) VALUES ($1,'reveal_contact')`, [id]);
    return { method: rows[0].method, value: rows[0].value };
  }
}
