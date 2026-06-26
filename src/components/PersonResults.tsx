/**
 * Isla de listado de Personas. Se renderiza también en SSR (primer pintado con
 * contenido real) y se hidrata para añadir: búsqueda con debounce, filtros y
 * scroll infinito por cursor — todo contra la API server-side. Estados
 * explícitos: cargando (skeletons), vacío y error con reintento.
 */
import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import type { PersonCard } from '@/lib/engine/types';
import { getModule, getStatusDef, type StatusTone } from '@/lib/engine/modules';
import { useTranslations, type Lang, type UIKey } from '@/i18n/index';
import { timeAgo } from '@/lib/utils/format';

interface Page {
  items: PersonCard[];
  nextCursor: string | null;
  counts: Record<string, number>;
}
interface Filters {
  q: string;
  status: string;
  zone: string;
  direction: string;
}
interface Props {
  lang: Lang;
  initial: Page;
  initialFilters: Filters;
}

const TONE_CLASSES: Record<StatusTone, string> = {
  danger: 'bg-danger-soft text-danger',
  warning: 'bg-warning-soft text-warning',
  success: 'bg-success-soft text-success',
  info: 'bg-primary-soft text-primary',
  neutral: 'bg-surface-3 text-fg-tertiary',
};

function StatusPill({ status, lang }: { status: string; lang: Lang }) {
  const t = useTranslations(lang);
  const def = getStatusDef('people', status);
  const tone = def?.tone ?? 'neutral';
  return (
    <span
      class={`inline-flex items-center gap-1.5 rounded-[var(--radius-full)] px-2.5 py-1 text-xs font-medium ${TONE_CLASSES[tone]}`}
    >
      <span class="beacon-dot" data-pulse={def?.active ? 'true' : 'false'} />
      {t(`people.status.${status}` as UIKey)}
    </span>
  );
}

function CardItem({ card, lang }: { card: PersonCard; lang: Lang }) {
  const t = useTranslations(lang);
  return (
    <a
      href={`/personas/${card.id}`}
      class="block rounded-[var(--radius-md)] border border-border bg-surface p-4 transition-colors hover:border-border-strong hover:bg-surface-2"
    >
      <div class="flex items-start justify-between gap-3">
        <StatusPill status={card.status} lang={lang} />
        <time class="shrink-0 text-xs text-fg-muted tabular" dateTime={card.createdAt}>
          {timeAgo(card.createdAt, lang)}
        </time>
      </div>

      <h3 class="mt-2.5 text-base font-semibold leading-tight text-fg">{card.fullName}</h3>

      <div class="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-fg-tertiary">
        <span class="font-medium text-fg-secondary">
          {t(`people.direction.${card.direction === 'found' ? 'found' : 'searching'}` as UIKey)}
        </span>
        {card.ageApprox != null && (
          <>
            <span aria-hidden="true">·</span>
            <span class="tabular">{t('people.age', { n: card.ageApprox })}</span>
          </>
        )}
        {card.zone && (
          <>
            <span aria-hidden="true">·</span>
            <span>{card.zone}</span>
          </>
        )}
      </div>

      {card.description && (
        <p class="mt-2 line-clamp-2 text-sm text-fg-tertiary">{card.description}</p>
      )}
    </a>
  );
}

function Skeleton() {
  return (
    <div class="animate-pulse rounded-[var(--radius-md)] border border-border bg-surface p-4">
      <div class="h-5 w-28 rounded-full bg-surface-3" />
      <div class="mt-3 h-4 w-2/3 rounded bg-surface-3" />
      <div class="mt-2 h-3 w-1/2 rounded bg-surface-3" />
    </div>
  );
}

export default function PersonResults({ lang, initial, initialFilters }: Props) {
  const t = useTranslations(lang);
  const [filters, setFilters] = useState<Filters>(initialFilters);
  const [items, setItems] = useState<PersonCard[]>(initial.items);
  const [counts, setCounts] = useState<Record<string, number>>(initial.counts);
  const [cursor, setCursor] = useState<string | null>(initial.nextCursor);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const sentinel = useRef<HTMLDivElement>(null);
  const firstRender = useRef(true);

  const buildUrl = useCallback(
    (f: Filters, c: string | null) => {
      const p = new URLSearchParams();
      if (f.q) p.set('q', f.q);
      if (f.status) p.set('status', f.status);
      if (f.zone) p.set('zone', f.zone);
      if (f.direction) p.set('direction', f.direction);
      if (c) p.set('cursor', c);
      return `/api/personas?${p.toString()}`;
    },
    [],
  );

  const load = useCallback(
    async (f: Filters, c: string | null, append: boolean) => {
      setLoading(true);
      setError(false);
      try {
        const res = await fetch(buildUrl(f, c));
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as Page & { ok: boolean };
        setItems((prev) => (append ? [...prev, ...data.items] : data.items));
        setCursor(data.nextCursor);
        setCounts(data.counts);
      } catch {
        setError(true);
      } finally {
        setLoading(false);
      }
    },
    [buildUrl],
  );

  // Recargar desde el principio cuando cambian los filtros (con debounce).
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return; // los datos iniciales ya vienen del SSR
    }
    const id = setTimeout(() => load(filters, null, false), 300);
    return () => clearTimeout(id);
  }, [filters, load]);

  // Scroll infinito.
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const obs = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting && cursor && !loading) {
        load(filters, cursor, true);
      }
    }, { rootMargin: '600px' });
    obs.observe(el);
    return () => obs.disconnect();
  }, [cursor, loading, filters, load]);

  const statuses = getModule('people').statuses;
  const total = Object.values(counts).reduce((a, b) => a + b, 0);

  return (
    <div>
      {/* Búsqueda */}
      <div class="relative">
        <span class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-muted">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.2-3.2" /></svg>
        </span>
        <input
          type="search"
          class="input pl-10"
          placeholder={t('common.search_placeholder')}
          aria-label={t('common.search')}
          value={filters.q}
          onInput={(e) => setFilters((f) => ({ ...f, q: (e.target as HTMLInputElement).value }))}
        />
      </div>

      {/* Filtros por estado (chips con conteo) */}
      <div class="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setFilters((f) => ({ ...f, status: '' }))}
          aria-pressed={filters.status === ''}
          class={
            'rounded-[var(--radius-full)] border px-3 py-1 text-xs font-medium transition-colors ' +
            (filters.status === ''
              ? 'border-transparent bg-fg text-bg'
              : 'border-border bg-surface text-fg-secondary hover:bg-surface-2')
          }
        >
          {t('common.all')} <span class="tabular opacity-70">{total}</span>
        </button>
        {statuses.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setFilters((f) => ({ ...f, status: f.status === s.id ? '' : s.id }))}
            aria-pressed={filters.status === s.id}
            class={
              'rounded-[var(--radius-full)] border px-3 py-1 text-xs font-medium transition-colors ' +
              (filters.status === s.id
                ? 'border-transparent bg-fg text-bg'
                : 'border-border bg-surface text-fg-secondary hover:bg-surface-2')
            }
          >
            {t(`people.status.${s.id}` as UIKey)}{' '}
            <span class="tabular opacity-70">{counts[s.id] ?? 0}</span>
          </button>
        ))}
      </div>

      {/* Resultados */}
      <div class="mt-4 space-y-3">
        {error && items.length === 0 ? (
          <div class="rounded-[var(--radius-md)] border border-border bg-surface p-6 text-center">
            <p class="text-sm font-semibold text-fg">{t('common.error.title')}</p>
            <button
              type="button"
              class="mt-3 min-h-9 rounded-[var(--radius-sm)] bg-surface-2 px-4 text-sm font-medium hover:bg-surface-3"
              onClick={() => load(filters, null, false)}
            >
              {t('common.error.retry')}
            </button>
          </div>
        ) : loading && items.length === 0 ? (
          <>
            <Skeleton />
            <Skeleton />
            <Skeleton />
          </>
        ) : items.length === 0 ? (
          <div class="flex flex-col items-center rounded-[var(--radius-md)] border border-dashed border-border px-6 py-14 text-center">
            <p class="text-sm font-semibold text-fg">{t('common.empty.title')}</p>
            <p class="mt-1 text-sm text-fg-tertiary">{t('common.empty.body')}</p>
          </div>
        ) : (
          items.map((c) => <CardItem key={c.id} card={c} lang={lang} />)
        )}
      </div>

      {/* Centinela de scroll infinito + indicador */}
      <div ref={sentinel} class="h-6" />
      {loading && items.length > 0 && (
        <p class="py-3 text-center text-xs text-fg-muted">{t('common.loading')}</p>
      )}
    </div>
  );
}
