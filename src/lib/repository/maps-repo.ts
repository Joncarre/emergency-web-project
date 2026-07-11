/**
 * Repositorio del Mapa de estado/peligro sobre el CardStore genérico. Lo
 * distintivo del módulo: los reportes son GEOLOCALIZADOS y se listan SOLO por
 * bounding-box del viewport (nunca todos), con caducidad para que la
 * información obsoleta desaparezca sola.
 */
import type { MapReportCard } from '@/lib/engine/types';
import { CardStore, getOrCreateStore } from './card-store';
import { seedStoredMapReports } from './seed';
import type { BBox, CreateMapReportInput, ListMapReportsParams, ListMapReportsResult, Repository } from './types';

const MAX_MAP_RESULTS = 400;

const store = getOrCreateStore<MapReportCard>('map', () => {
  const s = new CardStore<MapReportCard>({
    moduleId: 'map',
    searchText: (c) => `${c.description ?? ''} ${c.zone ?? ''}`,
  });
  s.seed(seedStoredMapReports());
  return s;
});

function inBBox(card: MapReportCard, b: BBox): boolean {
  return (
    card.geo.lat >= b.south && card.geo.lat <= b.north &&
    card.geo.lng >= b.west && card.geo.lng <= b.east
  );
}

/** Un reporte está vigente si su estado es activo y no ha caducado. */
function isLive(card: MapReportCard, now: number): boolean {
  if (card.status !== 'active') return false;
  if (card.expiresAt && new Date(card.expiresAt).getTime() < now) return false;
  return true;
}

type MapsRepo = Pick<
  Repository,
  'listMapReports' | 'getMapReport' | 'createMapReport' | 'transitionMapReport' | 'resolveActorMapReport'
>;

export const mapsRepo: MapsRepo = {
  async listMapReports(params: ListMapReportsParams): Promise<ListMapReportsResult> {
    const now = Date.now();
    const limit = Math.min(params.limit ?? MAX_MAP_RESULTS, MAX_MAP_RESULTS);

    let rows = store.allLive();
    if (params.bbox) rows = rows.filter((c) => inBBox(c, params.bbox!));
    if (!params.includeExpired) rows = rows.filter((c) => isLive(c, now));

    // Conteos por tipo dentro del bbox, ANTES del filtro de tipo (para chips).
    const counts: Record<string, number> = {};
    for (const c of rows) counts[c.reportType] = (counts[c.reportType] ?? 0) + 1;

    if (params.reportType) rows = rows.filter((c) => c.reportType === params.reportType);
    rows = rows.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).slice(0, limit);

    return { items: rows, counts };
  },

  getMapReport(id) {
    return store.get(id);
  },

  async createMapReport(input: CreateMapReportInput, ipHash) {
    const expiresAt = input.ttlHours ? new Date(Date.now() + input.ttlHours * 3_600_000).toISOString() : null;
    return store.create(
      {
        module: 'map',
        status: 'active',
        zone: input.zone,
        geo: input.geo,
        description: input.description,
        photoUrl: null,
        reportType: input.reportType,
        expiresAt,
      },
      null, // los reportes del mapa no llevan contacto (minimización de datos)
      ipHash,
    );
  },

  transitionMapReport(id, to, ctx) {
    return store.transition(id, to, ctx);
  },

  resolveActorMapReport(id, ctx) {
    return store.resolveActor(id, ctx);
  },
};
