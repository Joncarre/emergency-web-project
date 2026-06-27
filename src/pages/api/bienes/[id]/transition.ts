/**
 * POST /api/bienes/:id/transition — cambio de estado (creador con token o
 * moderación). Formulario nativo desde la página de gestión. La autorización
 * la decide el motor (state-machine) según el actor resuelto por el token.
 */
import type { APIRoute } from 'astro';
import { getRepository } from '@/lib/repository';
import { transitionSchema } from '@/lib/validation/people';
import { redirect, tooManyRequests } from '@/lib/http';
import { getClientIp, hashIp } from '@/lib/security/ip';
import { rateLimit } from '@/lib/security/rate-limit';
import { TransitionError } from '@/lib/engine/state-machine';

export const prerender = false;

const MODERATION_KEY = import.meta.env.MODERATION_KEY || '';

export const POST: APIRoute = async ({ params, request }) => {
  const id = params.id!;
  const ip = getClientIp(request);
  const limit = rateLimit(`goods:transition:${ip}`, 30, 10 * 60_000);
  if (!limit.ok) return tooManyRequests(limit.retryAfterSec);

  const form = await request.formData();
  const token = String(form.get('token') ?? '');
  const modKey = String(form.get('modKey') ?? '');
  const parsed = transitionSchema.safeParse({ to: form.get('to') });

  const back = `/bienes/gestionar?id=${id}&token=${encodeURIComponent(token)}`;
  if (!parsed.success) return redirect(`${back}&err=validation`);

  const repo = getRepository();
  try {
    await repo.transitionGood(id, parsed.data.to, {
      manageToken: token,
      isModerator: !!MODERATION_KEY && modKey === MODERATION_KEY,
      ipHash: hashIp(ip),
    });
  } catch (err) {
    if (err instanceof TransitionError) return redirect(`${back}&err=${err.code}`);
    return redirect(`/bienes?err=not_found`);
  }
  return redirect(`${back}&ok=1`);
};
