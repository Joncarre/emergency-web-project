/**
 * /api/personas/similar — anti-duplicados en tiempo real.
 * Devuelve fichas parecidas (similitud trigram + zona + edad) ANTES de crear,
 * para evitar duplicar a una misma persona desaparecida.
 */
import type { APIRoute } from 'astro';
import { getRepository } from '@/lib/repository';
import { similarPeopleSchema } from '@/lib/validation/people';
import { json, jsonError, tooManyRequests } from '@/lib/http';
import { getClientIp } from '@/lib/security/ip';
import { rateLimit } from '@/lib/security/rate-limit';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const ip = getClientIp(request);
  const limit = rateLimit(`people:similar:${ip}`, 40, 60_000);
  if (!limit.ok) return tooManyRequests(limit.retryAfterSec);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, 'invalid_json');
  }

  const parsed = similarPeopleSchema.safeParse(body);
  if (!parsed.success) return json({ ok: true, matches: [] });

  const repo = getRepository();
  const matches = await repo.findSimilarPeople(parsed.data);
  return json({ ok: true, matches });
};
