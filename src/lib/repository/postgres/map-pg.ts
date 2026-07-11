/**
 * Repositorio del Mapa sobre Postgres/PostGIS. La consulta de listado es por
 * bounding-box del viewport (ST_MakeEnvelope + índice GiST) y la caducidad se
 * evalúa en SQL — exactamente el patrón "nunca todos los puntos a la vez".
 */
import type { MapReportCard } from '@/lib/engine/types';
import type { CreateMapReportInput, ListMapReportsParams, ListMapReportsResult, Repository } from '../types';
import { PgCardStore, baseFromRow, toIso } from './pg-card-store';
import { getPool } from './pool';

const MAX_MAP_RESULTS = 400;

const SELECT_COLS = `m.report_type AS "reportType", m.expires_at AS "expiresAt",
  ST_Y(c.geo::geometry) AS lat, ST_X(c.geo::geometry) AS lng`;

function mapRow(row: Record<string, unknown>): MapReportCard {
  return {
    ...baseFromRow(row),
    module: 'map',
    geo: { lat: Number(row.lat), lng: Number(row.lng) },
    reportType: row.reportType as MapReportCard['reportType'],
    expiresAt: row.expiresAt ? toIso(row.expiresAt) : null,
  } as MapReportCard;
}

const store = new PgCardStore<MapReportCard>({
  moduleId: 'map',
  table: 'map_reports',
  selectCols: SELECT_COLS,
  insertCols: ['report_type', 'expires_at'],
  insertValues: (f) => [f.reportType, f.expiresAt],
  searchCols: ['c.description', 'c.zone'],
  buildExtra: () => [],
  mapRow,
});

type MapsRepo = Pick<
  Repository,
  'listMapReports' | 'getMapReport' | 'createMapReport' | 'transitionMapReport' | 'resolveActorMapReport'
>;

export const mapPgRepo: MapsRepo = {
  async listMapReports(params: ListMapReportsParams): Promise<ListMapReportsResult> {
    const limit = Math.min(params.limit ?? MAX_MAP_RESULTS, MAX_MAP_RESULTS);
    const values: unknown[] = [];
    const push = (v: unknown) => {
      values.push(v);
      return `$${values.length}`;
    };

    const conds = [`c.module = 'map'`, `c.deleted_at IS NULL`, `c.geo IS NOT NULL`];
    if (params.bbox) {
      const b = params.bbox;
      conds.push(
        `ST_Intersects(c.geo, ST_MakeEnvelope(${push(b.west)}, ${push(b.south)}, ${push(b.east)}, ${push(b.north)}, 4326)::geography)`,
      );
    }
    if (!params.includeExpired) {
      conds.push(`c.status = 'active'`, `(m.expires_at IS NULL OR m.expires_at > now())`);
    }
    const where = conds.join(' AND ');

    // Conteos por tipo dentro del bbox (antes del filtro de tipo).
    const countsSql = `SELECT m.report_type AS type, count(*)::int AS total
      FROM cards c JOIN map_reports m ON m.card_id = c.id WHERE ${where} GROUP BY m.report_type`;
    const countsRes = await getPool().query(countsSql, values);
    const counts: Record<string, number> = {};
    for (const r of countsRes.rows) counts[r.type as string] = Number(r.total);

    const typeCond = params.reportType ? ` AND m.report_type = ${push(params.reportType)}` : '';
    const itemsSql = `SELECT c.id, c.module, c.status, c.zone, c.description,
        c.photo_url AS "photoUrl", c.created_at AS "createdAt", c.updated_at AS "updatedAt",
        c.deleted_at AS "deletedAt", ${SELECT_COLS}
      FROM cards c JOIN map_reports m ON m.card_id = c.id
      WHERE ${where}${typeCond}
      ORDER BY c.created_at DESC LIMIT ${push(limit)}`;
    const itemsRes = await getPool().query(itemsSql, values);

    return { items: itemsRes.rows.map(mapRow), counts };
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
      null,
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
