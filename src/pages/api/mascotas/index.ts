/**
 * /api/mascotas
 *  GET  — listado paginado por cursor + filtros (estado, zona, dirección,
 *         especie) + búsqueda + conteos (server-side).
 *  POST — alta. Si el chip ya existe (UNIQUE), no duplica: devuelve `matched`.
 */
import type { APIRoute } from 'astro';
import type { PetDirection, PetSpecies } from '@/lib/engine/types';
import { getRepository } from '@/lib/repository';
import { createPetSchema } from '@/lib/validation/pets';
import { json, jsonError, tooManyRequests } from '@/lib/http';
import { getClientIp, hashIp } from '@/lib/security/ip';
import { rateLimit } from '@/lib/security/rate-limit';

export const prerender = false;

const DIRECTIONS: PetDirection[] = ['lost', 'found'];
const SPECIES: PetSpecies[] = ['dog', 'cat', 'other'];

export const GET: APIRoute = async ({ url }) => {
  const repo = getRepository();
  const p = url.searchParams;
  const direction = p.get('direction');
  const species = p.get('species');

  const filters = {
    status: p.get('status') || undefined,
    zone: p.get('zone') || undefined,
    direction: DIRECTIONS.includes(direction as PetDirection) ? (direction as PetDirection) : undefined,
    species: SPECIES.includes(species as PetSpecies) ? (species as PetSpecies) : undefined,
    q: p.get('q') || undefined,
  };

  const [page, counts] = await Promise.all([
    repo.listPets({ ...filters, cursor: p.get('cursor'), limit: Number(p.get('limit')) || undefined }),
    repo.countPetsByStatus({
      zone: filters.zone,
      direction: filters.direction,
      species: filters.species,
      q: filters.q,
    }),
  ]);

  return json({ ok: true, items: page.items, nextCursor: page.nextCursor, counts });
};

export const POST: APIRoute = async ({ request }) => {
  const ip = getClientIp(request);
  const limit = rateLimit(`pets:create:${ip}`, 8, 10 * 60_000);
  if (!limit.ok) return tooManyRequests(limit.retryAfterSec);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, 'invalid_json');
  }

  const parsed = createPetSchema.safeParse(body);
  if (!parsed.success) return jsonError(422, 'validation_failed', parsed.error.issues[0]?.message);

  const repo = getRepository();
  const data = parsed.data;
  const result = await repo.createPet(
    {
      species: data.species,
      name: data.name,
      chipId: data.chipId,
      breed: data.breed,
      direction: data.direction,
      zone: data.zone,
      geo: null,
      description: data.description,
      photoUrl: null,
      contact: data.contact,
    },
    hashIp(ip),
  );

  // Chip ya existente -> emparejar (no duplicar).
  if (result.matched) return json({ ok: true, matched: result.matched });

  const created = result.created!;
  const manageUrl = `/mascotas/gestionar?id=${created.card.id}&token=${created.manageToken}`;
  return json({ ok: true, created: created.card, manageToken: created.manageToken, manageUrl }, 201);
};
