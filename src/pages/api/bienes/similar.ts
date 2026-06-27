/**
 * /api/bienes/similar — coincidencias en tiempo real antes de crear.
 * El ID natural es coincidencia FUERTE (unicidad); además apoyo por tipo + zona.
 */
import type { APIRoute } from 'astro';
import { getRepository } from '@/lib/repository';
import { similarGoodsSchema } from '@/lib/validation/goods';
import { json, jsonError, tooManyRequests } from '@/lib/http';
import { getClientIp } from '@/lib/security/ip';
import { rateLimit } from '@/lib/security/rate-limit';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const ip = getClientIp(request);
  const limit = rateLimit(`goods:similar:${ip}`, 40, 60_000);
  if (!limit.ok) return tooManyRequests(limit.retryAfterSec);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, 'invalid_json');
  }

  const parsed = similarGoodsSchema.safeParse(body);
  if (!parsed.success) return json({ ok: true, matches: [] });

  const repo = getRepository();
  const matches = await repo.findSimilarGoods(parsed.data);
  return json({ ok: true, matches });
};
