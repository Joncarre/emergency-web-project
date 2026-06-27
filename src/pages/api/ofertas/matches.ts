/**
 * /api/ofertas/matches — sugerencias de emparejamiento (la cara opuesta).
 * Dada una cara (oferta/necesidad) + categoría + zona, devuelve las fichas
 * activas de la cara contraria que mejor encajan por proximidad de zona.
 */
import type { APIRoute } from 'astro';
import { getRepository } from '@/lib/repository';
import { matchOffersSchema } from '@/lib/validation/offers';
import { json, jsonError, tooManyRequests } from '@/lib/http';
import { getClientIp } from '@/lib/security/ip';
import { rateLimit } from '@/lib/security/rate-limit';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const ip = getClientIp(request);
  const limit = rateLimit(`offers:matches:${ip}`, 40, 60_000);
  if (!limit.ok) return tooManyRequests(limit.retryAfterSec);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, 'invalid_json');
  }

  const parsed = matchOffersSchema.safeParse(body);
  if (!parsed.success) return json({ ok: true, matches: [] });

  const repo = getRepository();
  const matches = await repo.findMatchingOffers(parsed.data);
  return json({ ok: true, matches });
};
