/**
 * /api/mapa
 *  GET  — reportes del bounding-box del viewport (?bbox=w,s,e,n&type=…),
 *         nunca todos los puntos; incluye conteos por tipo.
 *  POST — alta de reporte geolocalizado (rate-limited + validado).
 */
import type { APIRoute } from 'astro';
import type { MapReportType } from '@/lib/engine/types';
import { ALL_MAP_REPORT_TYPES } from '@/lib/engine/types';
import { getRepository } from '@/lib/repository';
import { createMapReportSchema, parseBBox } from '@/lib/validation/map';
import { json, jsonError, tooManyRequests } from '@/lib/http';
import { getClientIp, hashIp } from '@/lib/security/ip';
import { rateLimit } from '@/lib/security/rate-limit';

export const prerender = false;

export const GET: APIRoute = async ({ url }) => {
  const repo = getRepository();
  const p = url.searchParams;
  const bbox = parseBBox(p.get('bbox'));
  const type = p.get('type');

  const result = await repo.listMapReports({
    bbox: bbox ?? undefined,
    reportType: (ALL_MAP_REPORT_TYPES as readonly string[]).includes(type ?? '')
      ? (type as MapReportType)
      : undefined,
  });

  return json({ ok: true, items: result.items, counts: result.counts });
};

export const POST: APIRoute = async ({ request }) => {
  const ip = getClientIp(request);
  const limit = rateLimit(`map:create:${ip}`, 10, 10 * 60_000);
  if (!limit.ok) return tooManyRequests(limit.retryAfterSec);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, 'invalid_json');
  }

  const parsed = createMapReportSchema.safeParse(body);
  if (!parsed.success) return jsonError(422, 'validation_failed', parsed.error.issues[0]?.message);

  const repo = getRepository();
  const data = parsed.data;
  const result = await repo.createMapReport(
    {
      reportType: data.reportType,
      geo: { lat: data.lat, lng: data.lng },
      zone: data.zone,
      description: data.description,
      ttlHours: data.ttlHours ?? 48,
    },
    hashIp(ip),
  );

  const manageUrl = `/mapa/gestionar?id=${result.card.id}&token=${result.manageToken}`;
  return json({ ok: true, card: result.card, manageToken: result.manageToken, manageUrl }, 201);
};
