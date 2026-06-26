/**
 * POST /api/personas/:id/sighting — avistamiento (cualquiera).
 * Formulario nativo (funciona sin JS): valida, registra y redirige de vuelta a
 * la ficha. NO resuelve la tarjeta; la marca como "posible localización".
 */
import type { APIRoute } from 'astro';
import { getRepository } from '@/lib/repository';
import { sightingSchema } from '@/lib/validation/people';
import { redirect, tooManyRequests } from '@/lib/http';
import { getClientIp, hashIp } from '@/lib/security/ip';
import { rateLimit } from '@/lib/security/rate-limit';

export const prerender = false;

export const POST: APIRoute = async ({ params, request }) => {
  const id = params.id!;
  const ip = getClientIp(request);
  const limit = rateLimit(`people:sighting:${ip}`, 15, 10 * 60_000);
  if (!limit.ok) return tooManyRequests(limit.retryAfterSec);

  const form = await request.formData();
  const method = String(form.get('contactMethod') ?? '');
  const value = String(form.get('contactValue') ?? '').trim();
  const raw = {
    note: form.get('note'),
    zone: form.get('zone'),
    contact: value ? { method: method || 'other', value } : null,
  };

  const parsed = sightingSchema.safeParse(raw);
  if (!parsed.success) return redirect(`/personas/${id}?err=validation`);

  const repo = getRepository();
  try {
    await repo.addSighting(id, { ...parsed.data, ipHash: hashIp(ip) });
  } catch {
    return redirect(`/personas?err=not_found`);
  }
  return redirect(`/personas/${id}?ok=sighting`);
};
