/**
 * POST /api/personas/:id/contact — revelar contacto protegido tras una acción
 * explícita (anti-scraping). Rate-limited. En producción iría tras CAPTCHA y/o
 * un relé que evite exponer el dato en bruto.
 */
import type { APIRoute } from 'astro';
import { getRepository } from '@/lib/repository';
import { json, jsonError, tooManyRequests } from '@/lib/http';
import { getClientIp } from '@/lib/security/ip';
import { rateLimit } from '@/lib/security/rate-limit';

export const prerender = false;

export const POST: APIRoute = async ({ params, request }) => {
  const id = params.id!;
  const ip = getClientIp(request);
  const limit = rateLimit(`people:contact:${ip}`, 20, 10 * 60_000);
  if (!limit.ok) return tooManyRequests(limit.retryAfterSec);

  const repo = getRepository();
  const contact = await repo.revealContact(id);
  if (!contact) return jsonError(404, 'not_found');
  return json({ ok: true, contact });
};
