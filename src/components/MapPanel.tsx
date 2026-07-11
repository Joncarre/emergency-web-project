/**
 * Isla del Mapa de estado/peligro (client:only — Leaflet necesita `window`).
 *
 *  - Carga SIEMPRE por bounding-box del viewport (moveend + debounce), nunca
 *    todos los puntos.
 *  - Clustering ligero por rejilla de píxeles (sin dependencias extra).
 *  - Color SOLO semántico por tipo de reporte (tokens del design system).
 *  - Flujo de reporte: botón → tocar el mapa → formulario → token una sola vez.
 *  - Los popups se construyen con DOM (textContent), nunca con HTML de usuario.
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import type * as Leaflet from 'leaflet';
import type { MapReportCard, MapReportType } from '@/lib/engine/types';
import { ALL_MAP_REPORT_TYPES } from '@/lib/engine/types';
import { useTranslations, type Lang, type UIKey } from '@/i18n/index';
import { timeAgo } from '@/lib/utils/format';

interface Props {
  lang: Lang;
  center: { lat: number; lng: number };
}

interface CreatedInfo {
  manageUrl: string;
}

const TYPE_TOKEN: Record<MapReportType, string> = {
  damage: '--danger',
  service: '--primary',
  help_point: '--warning',
  safe: '--success',
};

const TTL_OPTIONS: { value: number; key: UIKey }[] = [
  { value: 24, key: 'map.ttl.h24' },
  { value: 48, key: 'map.ttl.h48' },
  { value: 72, key: 'map.ttl.h72' },
  { value: 168, key: 'map.ttl.week' },
];

function cssColor(token: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(token).trim() || '#666';
}

/** Clustering simple por rejilla de píxeles al zoom actual. */
function clusterize(
  L: typeof Leaflet,
  map: Leaflet.Map,
  reports: MapReportCard[],
  cellPx = 64,
): { cluster: MapReportCard[]; center: Leaflet.LatLng }[] {
  const cells = new Map<string, MapReportCard[]>();
  for (const r of reports) {
    const pt = map.latLngToContainerPoint([r.geo.lat, r.geo.lng]);
    const key = `${Math.floor(pt.x / cellPx)}:${Math.floor(pt.y / cellPx)}`;
    const arr = cells.get(key) ?? [];
    arr.push(r);
    cells.set(key, arr);
  }
  return [...cells.values()].map((cluster) => {
    const lat = cluster.reduce((s, r) => s + r.geo.lat, 0) / cluster.length;
    const lng = cluster.reduce((s, r) => s + r.geo.lng, 0) / cluster.length;
    return { cluster, center: L.latLng(lat, lng) };
  });
}

export default function MapPanel({ lang, center }: Props) {
  const t = useTranslations(lang);
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Leaflet.Map | null>(null);
  const LRef = useRef<typeof Leaflet | null>(null);
  const layerRef = useRef<Leaflet.LayerGroup | null>(null);
  const placeMarkerRef = useRef<Leaflet.CircleMarker | null>(null);
  const reportsRef = useRef<MapReportCard[]>([]);
  const filterRef = useRef<MapReportType | ''>('');
  const modeRef = useRef<'view' | 'place'>('view');

  const [ready, setReady] = useState(false);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [typeFilter, setTypeFilter] = useState<MapReportType | ''>('');
  const [mode, setMode] = useState<'view' | 'place'>('view');
  const [placed, setPlaced] = useState<{ lat: number; lng: number } | null>(null);
  const [formType, setFormType] = useState<MapReportType>('damage');
  const [formDesc, setFormDesc] = useState('');
  const [formTtl, setFormTtl] = useState(48);
  const [submitting, setSubmitting] = useState(false);
  const [created, setCreated] = useState<CreatedInfo | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(false);

  filterRef.current = typeFilter;
  modeRef.current = mode;

  /** Pinta los marcadores del viewport actual (con clustering). */
  function render() {
    const L = LRef.current;
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!L || !map || !layer) return;
    layer.clearLayers();

    const visible = filterRef.current
      ? reportsRef.current.filter((r) => r.reportType === filterRef.current)
      : reportsRef.current;

    for (const { cluster, center: cCenter } of clusterize(L, map, visible)) {
      if (cluster.length === 1) {
        const r = cluster[0]!;
        const color = cssColor(TYPE_TOKEN[r.reportType]);
        const marker = L.circleMarker([r.geo.lat, r.geo.lng], {
          radius: 9,
          color,
          weight: 2,
          fillColor: color,
          fillOpacity: 0.35,
        });
        // Popup construido con DOM: el texto del usuario va por textContent.
        const div = document.createElement('div');
        div.style.minWidth = '180px';
        const title = document.createElement('strong');
        title.textContent = t(`map.type.${r.reportType}` as UIKey);
        title.style.color = color;
        div.appendChild(title);
        if (r.description) {
          const p = document.createElement('p');
          p.textContent = r.description;
          p.style.margin = '4px 0 0';
          div.appendChild(p);
        }
        const meta = document.createElement('small');
        meta.textContent = `${r.zone ? r.zone + ' · ' : ''}${timeAgo(r.createdAt, lang)}`;
        meta.style.opacity = '0.7';
        div.appendChild(document.createElement('br'));
        div.appendChild(meta);
        marker.bindPopup(div);
        layer.addLayer(marker);
      } else {
        const icon = L.divIcon({
          className: '',
          html: `<div style="width:34px;height:34px;border-radius:9999px;display:flex;align-items:center;justify-content:center;background:var(--surface);border:2px solid var(--border-strong);color:var(--fg);font:600 12px/1 sans-serif;box-shadow:var(--shadow-overlay)">${cluster.length}</div>`,
          iconSize: [34, 34],
          iconAnchor: [17, 17],
        });
        const m = L.marker(cCenter, { icon });
        m.on('click', () => {
          const map2 = mapRef.current!;
          map2.setView(cCenter, Math.min(map2.getZoom() + 2, 18));
        });
        layer.addLayer(m);
      }
    }
  }

  /** Trae los reportes del bbox actual (server-side). */
  async function fetchViewport() {
    const map = mapRef.current;
    if (!map) return;
    const b = map.getBounds();
    const bbox = `${b.getWest()},${b.getSouth()},${b.getEast()},${b.getNorth()}`;
    try {
      const res = await fetch(`/api/mapa?bbox=${encodeURIComponent(bbox)}`);
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      reportsRef.current = data.items ?? [];
      setCounts(data.counts ?? {});
      setError(false);
      render();
    } catch {
      setError(true);
    }
  }

  useEffect(() => {
    let disposed = false;
    let debounce: ReturnType<typeof setTimeout> | undefined;

    (async () => {
      const L = (await import('leaflet')).default as unknown as typeof Leaflet;
      await import('leaflet/dist/leaflet.css');
      if (disposed || !containerRef.current) return;

      LRef.current = L;
      const map = L.map(containerRef.current, {
        center: [center.lat, center.lng],
        zoom: 13,
        zoomControl: true,
      });
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(map);
      mapRef.current = map;
      layerRef.current = L.layerGroup().addTo(map);

      map.on('moveend', () => {
        clearTimeout(debounce);
        debounce = setTimeout(fetchViewport, 250);
      });

      map.on('click', (e: Leaflet.LeafletMouseEvent) => {
        if (modeRef.current !== 'place') return;
        setPlaced({ lat: e.latlng.lat, lng: e.latlng.lng });
        const color = cssColor('--primary');
        if (placeMarkerRef.current) placeMarkerRef.current.remove();
        placeMarkerRef.current = L.circleMarker(e.latlng, {
          radius: 10,
          color,
          weight: 3,
          fillColor: color,
          fillOpacity: 0.5,
        }).addTo(map);
      });

      setReady(true);
      fetchViewport();
    })();

    return () => {
      disposed = true;
      clearTimeout(debounce);
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Repintar cuando cambia el filtro de tipo.
  useEffect(() => {
    render();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typeFilter]);

  function cancelPlacement() {
    setMode('view');
    setPlaced(null);
    placeMarkerRef.current?.remove();
    placeMarkerRef.current = null;
  }

  async function submitReport(e: Event) {
    e.preventDefault();
    if (!placed) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/mapa', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          reportType: formType,
          lat: placed.lat,
          lng: placed.lng,
          description: formDesc || null,
          zone: null,
          ttlHours: formTtl,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error('error');
      setCreated({ manageUrl: data.manageUrl });
      cancelPlacement();
      setFormDesc('');
      fetchViewport();
    } catch {
      setError(true);
    } finally {
      setSubmitting(false);
    }
  }

  const chip = (active: boolean) =>
    'rounded-[var(--radius-full)] border px-2.5 py-1 text-xs font-medium transition-colors ' +
    (active
      ? 'border-transparent bg-fg text-bg'
      : 'border-border bg-surface/90 text-fg-secondary hover:bg-surface-2 backdrop-blur');

  return (
    <div class="relative overflow-hidden rounded-[var(--radius-md)] border border-border">
      {/* Contenedor del mapa */}
      <div ref={containerRef} class="h-[68dvh] min-h-80 w-full bg-surface-2" />
      {!ready && (
        <div class="absolute inset-0 z-[500] flex items-center justify-center bg-surface-2">
          <p class="text-sm text-fg-muted">{t('map.loading')}</p>
        </div>
      )}

      {/* Filtros por tipo (con conteo del viewport) */}
      <div class="absolute left-2 right-2 top-2 z-[600] flex flex-wrap gap-1.5">
        <button type="button" class={chip(typeFilter === '')} onClick={() => setTypeFilter('')}>
          {t('common.all')}
        </button>
        {ALL_MAP_REPORT_TYPES.map((ty) => (
          <button
            key={ty}
            type="button"
            class={chip(typeFilter === ty)}
            onClick={() => setTypeFilter(typeFilter === ty ? '' : ty)}
          >
            <span
              class="mr-1 inline-block h-2 w-2 rounded-full align-middle"
              style={`background: var(${TYPE_TOKEN[ty]})`}
            />
            {t(`map.type.${ty}` as UIKey)} <span class="tabular opacity-70">{counts[ty] ?? 0}</span>
          </button>
        ))}
      </div>

      {/* Botón Reportar / aviso de colocación */}
      {mode === 'view' && !created && (
        <button
          type="button"
          onClick={() => setMode('place')}
          class="absolute bottom-4 left-1/2 z-[600] -translate-x-1/2 rounded-[var(--radius-full)] bg-primary px-5 py-3 text-sm font-semibold text-on-accent shadow-[var(--shadow-overlay)] transition-transform active:scale-[0.97]"
        >
          + {t('map.report.cta')}
        </button>
      )}

      {mode === 'place' && !placed && (
        <div class="absolute bottom-4 left-1/2 z-[600] flex -translate-x-1/2 items-center gap-2 rounded-[var(--radius-full)] bg-surface px-4 py-2.5 text-sm font-medium text-fg shadow-[var(--shadow-overlay)]">
          {t('map.report.place_hint')}
          <button type="button" class="text-fg-muted underline" onClick={cancelPlacement}>
            {t('map.report.cancel')}
          </button>
        </div>
      )}

      {/* Formulario de reporte (panel inferior) */}
      {mode === 'place' && placed && (
        <form
          onSubmit={submitReport}
          class="absolute inset-x-2 bottom-2 z-[700] space-y-3 rounded-[var(--radius-md)] border border-border bg-surface p-4 shadow-[var(--shadow-overlay)]"
        >
          <div class="grid grid-cols-2 gap-2">
            <label class="block text-xs font-medium text-fg-secondary">
              {t('map.field.type')}
              <select
                class="select mt-1"
                value={formType}
                onChange={(e) => setFormType((e.target as HTMLSelectElement).value as MapReportType)}
              >
                {ALL_MAP_REPORT_TYPES.map((ty) => (
                  <option key={ty} value={ty}>{t(`map.type.${ty}` as UIKey)}</option>
                ))}
              </select>
            </label>
            <label class="block text-xs font-medium text-fg-secondary">
              {t('map.field.ttl')}
              <select
                class="select mt-1"
                value={String(formTtl)}
                onChange={(e) => setFormTtl(Number((e.target as HTMLSelectElement).value))}
              >
                {TTL_OPTIONS.map((o) => (
                  <option key={o.value} value={String(o.value)}>{t(o.key)}</option>
                ))}
              </select>
            </label>
          </div>
          <textarea
            class="textarea"
            maxLength={500}
            placeholder={t('common.description')}
            value={formDesc}
            onInput={(e) => setFormDesc((e.target as HTMLTextAreaElement).value)}
          />
          <div class="flex gap-2">
            <button
              type="submit"
              disabled={submitting}
              class="inline-flex min-h-11 flex-1 items-center justify-center rounded-[var(--radius-sm)] bg-primary px-4 text-sm font-medium text-on-accent hover:bg-primary-hover active:scale-[0.98] disabled:opacity-50"
            >
              {submitting ? t('common.loading') : t('map.new.submit')}
            </button>
            <button
              type="button"
              onClick={cancelPlacement}
              class="inline-flex min-h-11 items-center justify-center rounded-[var(--radius-sm)] border border-border bg-surface-2 px-4 text-sm font-medium text-fg hover:bg-surface-3"
            >
              {t('map.report.cancel')}
            </button>
          </div>
        </form>
      )}

      {/* Éxito: enlace de gestión (una sola vez) */}
      {created && (
        <div class="absolute inset-x-2 bottom-2 z-[700] rounded-[var(--radius-md)] border border-warning/40 bg-warning-soft p-4 shadow-[var(--shadow-overlay)]">
          <p class="text-sm font-semibold text-fg">{t('map.new.success.title')}</p>
          <p class="mt-0.5 text-xs text-fg-secondary">{t('map.new.success.body')}</p>
          <code class="mt-2 block break-all rounded bg-bg/60 p-2 text-xs text-fg">
            {location.origin + created.manageUrl}
          </code>
          <div class="mt-2 flex gap-2">
            <button
              type="button"
              class="inline-flex min-h-9 items-center rounded-[var(--radius-sm)] bg-primary px-3 text-sm font-medium text-on-accent hover:bg-primary-hover"
              onClick={() => {
                navigator.clipboard?.writeText(location.origin + created.manageUrl);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
            >
              {copied ? t('common.copied') : t('people.new.token.copy')}
            </button>
            <button
              type="button"
              class="inline-flex min-h-9 items-center rounded-[var(--radius-sm)] border border-border bg-surface px-3 text-sm font-medium text-fg hover:bg-surface-2"
              onClick={() => setCreated(null)}
            >
              OK
            </button>
          </div>
        </div>
      )}

      {error && (
        <p class="absolute left-1/2 top-14 z-[600] -translate-x-1/2 rounded-[var(--radius-sm)] bg-danger-soft px-3 py-1.5 text-xs font-medium text-danger shadow-[var(--shadow-overlay)]">
          {t('common.error.title')}
        </p>
      )}
    </div>
  );
}
