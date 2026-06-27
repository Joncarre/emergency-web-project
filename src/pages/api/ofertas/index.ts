/**
 * /api/ofertas
 *  GET  — listado paginado por cursor + filtros (estado, zona, cara, categoría)
 *         + búsqueda + conteos (server-side).
 *  POST — alta (sin anti-duplicados: varias personas pueden ofrecer lo mismo).
 */
import type { APIRoute } from 'astro';
import type { OfferCategory, OfferKind } from '@/lib/engine/types';
import { ALL_OFFER_CATEGORIES } from '@/lib/engine/types';
import { getRepository } from '@/lib/repository';
import { createOfferSchema } from '@/lib/validation/offers';
import { json, jsonError, tooManyRequests } from '@/lib/http';
import { getClientIp, hashIp } from '@/lib/security/ip';
import { rateLimit } from '@/lib/security/rate-limit';

export const prerender = false;

const KINDS: OfferKind[] = ['offer', 'need'];

export const GET: APIRoute = async ({ url }) => {
  const repo = getRepository();
  const p = url.searchParams;
  const kind = p.get('kind');
  const category = p.get('category');

  const filters = {
    status: p.get('status') || undefined,
    zone: p.get('zone') || undefined,
    kind: KINDS.includes(kind as OfferKind) ? (kind as OfferKind) : undefined,
    category: (ALL_OFFER_CATEGORIES as readonly string[]).includes(category ?? '')
      ? (category as OfferCategory)
      : undefined,
    q: p.get('q') || undefined,
  };

  const [page, counts] = await Promise.all([
    repo.listOffers({ ...filters, cursor: p.get('cursor'), limit: Number(p.get('limit')) || undefined }),
    repo.countOffersByStatus({
      zone: filters.zone,
      kind: filters.kind,
      category: filters.category,
      q: filters.q,
    }),
  ]);

  return json({ ok: true, items: page.items, nextCursor: page.nextCursor, counts });
};

export const POST: APIRoute = async ({ request }) => {
  const ip = getClientIp(request);
  const limit = rateLimit(`offers:create:${ip}`, 10, 10 * 60_000);
  if (!limit.ok) return tooManyRequests(limit.retryAfterSec);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, 'invalid_json');
  }

  const parsed = createOfferSchema.safeParse(body);
  if (!parsed.success) return jsonError(422, 'validation_failed', parsed.error.issues[0]?.message);

  const repo = getRepository();
  const data = parsed.data;
  const result = await repo.createOffer(
    {
      kind: data.kind,
      category: data.category,
      quantity: data.quantity,
      expiresAt: data.expiresAt,
      zone: data.zone,
      geo: null,
      description: data.description,
      photoUrl: null,
      contact: data.contact,
    },
    hashIp(ip),
  );

  const manageUrl = `/ofertas/gestionar?id=${result.card.id}&token=${result.manageToken}`;
  return json({ ok: true, card: result.card, manageToken: result.manageToken, manageUrl }, 201);
};
