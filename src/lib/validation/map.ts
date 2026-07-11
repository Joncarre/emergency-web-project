/**
 * Validación y saneamiento de entradas del módulo Mapa (zod).
 * Las coordenadas se validan en rango; la caducidad se expresa en horas.
 */
import { z } from 'zod';
import { ALL_MAP_REPORT_TYPES } from '@/lib/engine/types';

const emptyToNull = (v: unknown) => (v === '' || v === undefined ? null : v);

export const createMapReportSchema = z.object({
  reportType: z.enum(ALL_MAP_REPORT_TYPES),
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  zone: z.preprocess(emptyToNull, z.string().trim().max(120).nullable()),
  description: z.preprocess(emptyToNull, z.string().trim().max(500).nullable()),
  ttlHours: z.preprocess(emptyToNull, z.coerce.number().int().min(1).max(336).nullable()),
});

/** bbox del querystring: "west,south,east,north". */
export function parseBBox(raw: string | null): { west: number; south: number; east: number; north: number } | null {
  if (!raw) return null;
  const parts = raw.split(',').map((n) => Number(n.trim()));
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return null;
  const [west, south, east, north] = parts as [number, number, number, number];
  if (south < -90 || north > 90 || south > north || west > east) return null;
  return { west, south, east, north };
}

export type CreateMapReportPayload = z.infer<typeof createMapReportSchema>;
