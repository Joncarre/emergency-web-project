/**
 * /api/personas
 *  GET  — listado paginado por cursor + filtros + búsqueda + conteos (server-side).
 *  POST — alta de ficha (rate-limited + validada). Devuelve el token UNA vez.
 */
import type { APIRoute } from 'astro';
import type { PersonDirection } from '@/lib/engine/types';
import { getRepository } from '@/lib/repository';
import { createPersonSchema } from '@/lib/validation/people';
import { json, jsonError, tooManyRequests } from '@/lib/http';
import { getClientIp, hashIp } from '@/lib/security/ip';
import { rateLimit } from '@/lib/security/rate-limit';

export const prerender = false;

const DIRECTIONS: PersonDirection[] = ['searching', 'found'];

export const GET: APIRoute = async ({ url }) => {
  const repo = getRepository();
  const p = url.searchParams;
  const direction = p.get('direction');

  const filters = {
    status: p.get('status') || undefined,
    zone: p.get('zone') || undefined,
    direction: DIRECTIONS.includes(direction as PersonDirection)
      ? (direction as PersonDirection)
      : undefined,
    q: p.get('q') || undefined,
  };

  const [page, counts] = await Promise.all([
    repo.listPeople({
      ...filters,
      cursor: p.get('cursor'),
      limit: Number(p.get('limit')) || undefined,
    }),
    repo.countPeopleByStatus({ zone: filters.zone, direction: filters.direction, q: filters.q }),
  ]);

  return json({ ok: true, items: page.items, nextCursor: page.nextCursor, counts });
};

export const POST: APIRoute = async ({ request }) => {
  const ip = getClientIp(request);
  const limit = rateLimit(`people:create:${ip}`, 8, 10 * 60_000);
  if (!limit.ok) return tooManyRequests(limit.retryAfterSec);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, 'invalid_json');
  }

  const parsed = createPersonSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(422, 'validation_failed', parsed.error.issues[0]?.message);
  }

  const repo = getRepository();
  const data = parsed.data;
  const result = await repo.createPerson(
    {
      fullName: data.fullName,
      ageApprox: data.ageApprox,
      lastSeenAt: data.lastSeenAt,
      medicalNotes: data.medicalNotes,
      direction: data.direction,
      zone: data.zone,
      geo: null,
      description: data.description,
      photoUrl: null,
      contact: data.contact,
    },
    hashIp(ip),
  );

  const manageUrl = `/personas/gestionar?id=${result.card.id}&token=${result.manageToken}`;
  return json({ ok: true, card: result.card, manageToken: result.manageToken, manageUrl }, 201);
};
