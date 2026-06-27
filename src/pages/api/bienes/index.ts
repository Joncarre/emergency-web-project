/**
 * /api/bienes
 *  GET  — listado paginado por cursor + filtros (estado, zona, dirección, tipo)
 *         + búsqueda + conteos (server-side).
 *  POST — alta. El ID natural es ÚNICO: si ya existe, no duplica -> `matched`.
 */
import type { APIRoute } from 'astro';
import type { GoodDirection, GoodType } from '@/lib/engine/types';
import { getRepository } from '@/lib/repository';
import { createGoodSchema } from '@/lib/validation/goods';
import { json, jsonError, tooManyRequests } from '@/lib/http';
import { getClientIp, hashIp } from '@/lib/security/ip';
import { rateLimit } from '@/lib/security/rate-limit';

export const prerender = false;

const DIRECTIONS: GoodDirection[] = ['found', 'lost'];
const TYPES: GoodType[] = ['vehicle', 'machinery', 'other'];

export const GET: APIRoute = async ({ url }) => {
  const repo = getRepository();
  const p = url.searchParams;
  const direction = p.get('direction');
  const goodType = p.get('goodType');

  const filters = {
    status: p.get('status') || undefined,
    zone: p.get('zone') || undefined,
    direction: DIRECTIONS.includes(direction as GoodDirection) ? (direction as GoodDirection) : undefined,
    goodType: TYPES.includes(goodType as GoodType) ? (goodType as GoodType) : undefined,
    q: p.get('q') || undefined,
  };

  const [page, counts] = await Promise.all([
    repo.listGoods({ ...filters, cursor: p.get('cursor'), limit: Number(p.get('limit')) || undefined }),
    repo.countGoodsByStatus({
      zone: filters.zone,
      direction: filters.direction,
      goodType: filters.goodType,
      q: filters.q,
    }),
  ]);

  return json({ ok: true, items: page.items, nextCursor: page.nextCursor, counts });
};

export const POST: APIRoute = async ({ request }) => {
  const ip = getClientIp(request);
  const limit = rateLimit(`goods:create:${ip}`, 8, 10 * 60_000);
  if (!limit.ok) return tooManyRequests(limit.retryAfterSec);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, 'invalid_json');
  }

  const parsed = createGoodSchema.safeParse(body);
  if (!parsed.success) return jsonError(422, 'validation_failed', parsed.error.issues[0]?.message);

  const repo = getRepository();
  const data = parsed.data;
  const result = await repo.createGood(
    {
      goodType: data.goodType,
      naturalId: data.naturalId,
      direction: data.direction,
      zone: data.zone,
      geo: null,
      description: data.description,
      photoUrl: null,
      contact: data.contact,
    },
    hashIp(ip),
  );

  if (result.matched) return json({ ok: true, matched: result.matched });

  const created = result.created!;
  const manageUrl = `/bienes/gestionar?id=${created.card.id}&token=${created.manageToken}`;
  return json({ ok: true, created: created.card, manageToken: created.manageToken, manageUrl }, 201);
};
