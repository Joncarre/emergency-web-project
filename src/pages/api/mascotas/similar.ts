/**
 * /api/mascotas/similar — coincidencias en tiempo real antes de crear.
 * Chip = coincidencia fuerte (ID natural); además, similitud difusa por
 * nombre/raza + especie + zona.
 */
import type { APIRoute } from 'astro';
import { getRepository } from '@/lib/repository';
import { similarPetsSchema } from '@/lib/validation/pets';
import { json, jsonError, tooManyRequests } from '@/lib/http';
import { getClientIp } from '@/lib/security/ip';
import { rateLimit } from '@/lib/security/rate-limit';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const ip = getClientIp(request);
  const limit = rateLimit(`pets:similar:${ip}`, 40, 60_000);
  if (!limit.ok) return tooManyRequests(limit.retryAfterSec);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, 'invalid_json');
  }

  const parsed = similarPetsSchema.safeParse(body);
  if (!parsed.success) return json({ ok: true, matches: [] });

  const repo = getRepository();
  const matches = await repo.findSimilarPets(parsed.data);
  return json({ ok: true, matches });
};
