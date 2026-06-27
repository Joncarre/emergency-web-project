/**
 * Isla de listado GENÉRICA para cualquier módulo de tarjetas (Personas, Mascotas…).
 * SSR para el primer pintado + hidratación para búsqueda con debounce, filtros y
 * scroll infinito por cursor contra la API server-side. El cuerpo de la tarjeta
 * se renderiza según `card.module`, reutilizando toda la mecánica común.
 */
import type { ComponentChildren } from 'preact';
import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import type { AnyCard, GoodCard, ModuleId, PersonCard, PetCard, PetSpecies } from '@/lib/engine/types';
import { getModule, getStatusDef, type StatusTone } from '@/lib/engine/modules';
import { useTranslations, type Lang, type UIKey } from '@/i18n/index';
import { timeAgo } from '@/lib/utils/format';

interface Page {
  items: AnyCard[];
  nextCursor: string | null;
  counts: Record<string, number>;
}
interface Filters {
  q: string;
  status: string;
  zone: string;
  direction: string;
  species: string;
}
interface Props {
  lang: Lang;
  module: ModuleId;
  initial: Page;
  initialFilters: Partial<Filters>;
}

const ROUTES: Partial<Record<ModuleId, { detail: string; api: string }>> = {
  people: { detail: '/personas', api: '/api/personas' },
  pets: { detail: '/mascotas', api: '/api/mascotas' },
  goods: { detail: '/bienes', api: '/api/bienes' },
};

const TONE_CLASSES: Record<StatusTone, string> = {
  danger: 'bg-danger-soft text-danger',
  warning: 'bg-warning-soft text-warning',
  success: 'bg-success-soft text-success',
  info: 'bg-primary-soft text-primary',
  neutral: 'bg-surface-3 text-fg-tertiary',
};

function StatusPill({ module, status, lang }: { module: ModuleId; status: string; lang: Lang }) {
  const t = useTranslations(lang);
  const def = getStatusDef(module, status);
  return (
    <span
      class={`inline-flex items-center gap-1.5 rounded-[var(--radius-full)] px-2.5 py-1 text-xs font-medium ${TONE_CLASSES[def?.tone ?? 'neutral']}`}
    >
      <span class="beacon-dot" data-pulse={def?.active ? 'true' : 'false'} />
      {t(`${module}.status.${status}` as UIKey)}
    </span>
  );
}

function MetaRow({ children }: { children: ComponentChildren }) {
  return (
    <div class="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-fg-tertiary">{children}</div>
  );
}
const Dot = () => <span aria-hidden="true">·</span>;

function PersonBody({ card, lang }: { card: PersonCard; lang: Lang }) {
  const t = useTranslations(lang);
  return (
    <>
      <h3 class="mt-2.5 text-base font-semibold leading-tight text-fg">{card.fullName}</h3>
      <MetaRow>
        <span class="font-medium text-fg-secondary">{t(`people.direction.${card.direction}` as UIKey)}</span>
        {card.ageApprox != null && (<><Dot /><span class="tabular">{t('people.age', { n: card.ageApprox })}</span></>)}
        {card.zone && (<><Dot /><span>{card.zone}</span></>)}
      </MetaRow>
    </>
  );
}

function PetBody({ card, lang }: { card: PetCard; lang: Lang }) {
  const t = useTranslations(lang);
  const title = card.name || t(`pets.species.${card.species}` as UIKey);
  return (
    <>
      <div class="mt-2.5 flex items-center gap-2">
        <h3 class="text-base font-semibold leading-tight text-fg">{title}</h3>
        {card.chipId && (
          <span class="rounded-[var(--radius-full)] bg-surface-3 px-2 py-0.5 text-[11px] font-medium text-fg-tertiary tabular">
            chip ·{card.chipId.slice(-4)}
          </span>
        )}
      </div>
      <MetaRow>
        <span class="font-medium text-fg-secondary">{t(`pets.direction.${card.direction}` as UIKey)}</span>
        <Dot /><span>{t(`pets.species.${card.species}` as UIKey)}</span>
        {card.breed && (<><Dot /><span>{card.breed}</span></>)}
        {card.zone && (<><Dot /><span>{card.zone}</span></>)}
      </MetaRow>
    </>
  );
}

function GoodBody({ card, lang }: { card: GoodCard; lang: Lang }) {
  const t = useTranslations(lang);
  return (
    <>
      <h3 class="mt-2.5 font-mono text-base font-semibold leading-tight text-fg">{card.naturalId}</h3>
      <MetaRow>
        <span class="font-medium text-fg-secondary">{t(`goods.direction.${card.direction}` as UIKey)}</span>
        <Dot /><span>{t(`goods.type.${card.goodType}` as UIKey)}</span>
        {card.zone && (<><Dot /><span>{card.zone}</span></>)}
      </MetaRow>
    </>
  );
}

function CardBody({ card, lang }: { card: AnyCard; lang: Lang }) {
  if (card.module === 'people') return <PersonBody card={card} lang={lang} />;
  if (card.module === 'pets') return <PetBody card={card} lang={lang} />;
  return <GoodBody card={card} lang={lang} />;
}

function CardItem({ card, lang, basePath }: { card: AnyCard; lang: Lang; basePath: string }) {
  const lng = lang;
  return (
    <a
      href={`${basePath}/${card.id}`}
      class="block rounded-[var(--radius-md)] border border-border bg-surface p-4 transition-colors hover:border-border-strong hover:bg-surface-2"
    >
      <div class="flex items-start justify-between gap-3">
        <StatusPill module={card.module} status={card.status} lang={lng} />
        <time class="shrink-0 text-xs text-fg-muted tabular" dateTime={card.createdAt}>
          {timeAgo(card.createdAt, lng)}
        </time>
      </div>
      <CardBody card={card} lang={lng} />
      {card.description && <p class="mt-2 line-clamp-2 text-sm text-fg-tertiary">{card.description}</p>}
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

const SPECIES: PetSpecies[] = ['dog', 'cat', 'other'];

export default function CardResults({ lang, module, initial, initialFilters }: Props) {
  const t = useTranslations(lang);
  const routes = ROUTES[module]!;
  const [filters, setFilters] = useState<Filters>({
    q: '', status: '', zone: '', direction: '', species: '', ...initialFilters,
  });
  const [items, setItems] = useState<AnyCard[]>(initial.items);
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
      if (module === 'pets' && f.species) p.set('species', f.species);
      if (c) p.set('cursor', c);
      return `${routes.api}?${p.toString()}`;
    },
    [module, routes.api],
  );

  const load = useCallback(
    async (f: Filters, c: string | null, append: boolean) => {
      setLoading(true);
      setError(false);
      try {
        const res = await fetch(buildUrl(f, c));
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as Page;
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

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    const id = setTimeout(() => load(filters, null, false), 300);
    return () => clearTimeout(id);
  }, [filters, load]);

  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && cursor && !loading) load(filters, cursor, true);
      },
      { rootMargin: '600px' },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [cursor, loading, filters, load]);

  const statuses = getModule(module).statuses;
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const chip = (active: boolean) =>
    'rounded-[var(--radius-full)] border px-3 py-1 text-xs font-medium transition-colors ' +
    (active ? 'border-transparent bg-fg text-bg' : 'border-border bg-surface text-fg-secondary hover:bg-surface-2');
  const placeholder = module === 'pets' ? t('pets.search_placeholder') : t('common.search_placeholder');

  return (
    <div>
      <div class="relative">
        <span class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-muted">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.2-3.2" /></svg>
        </span>
        <input
          type="search"
          class="input pl-10"
          placeholder={placeholder}
          aria-label={t('common.search')}
          value={filters.q}
          onInput={(e) => setFilters((f) => ({ ...f, q: (e.target as HTMLInputElement).value }))}
        />
      </div>

      <div class="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={() => setFilters((f) => ({ ...f, status: '' }))} aria-pressed={filters.status === ''} class={chip(filters.status === '')}>
          {t('common.all')} <span class="tabular opacity-70">{total}</span>
        </button>
        {statuses.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setFilters((f) => ({ ...f, status: f.status === s.id ? '' : s.id }))}
            aria-pressed={filters.status === s.id}
            class={chip(filters.status === s.id)}
          >
            {t(`${module}.status.${s.id}` as UIKey)} <span class="tabular opacity-70">{counts[s.id] ?? 0}</span>
          </button>
        ))}
      </div>

      {module === 'pets' && (
        <select
          class="select mt-3"
          aria-label={t('pets.field.species')}
          value={filters.species}
          onChange={(e) => setFilters((f) => ({ ...f, species: (e.target as HTMLSelectElement).value }))}
        >
          <option value="">{t('common.all')}</option>
          {SPECIES.map((s) => (
            <option key={s} value={s}>{t(`pets.species.${s}` as UIKey)}</option>
          ))}
        </select>
      )}

      <div class="mt-4 space-y-3">
        {error && items.length === 0 ? (
          <div class="rounded-[var(--radius-md)] border border-border bg-surface p-6 text-center">
            <p class="text-sm font-semibold text-fg">{t('common.error.title')}</p>
            <button type="button" class="mt-3 min-h-9 rounded-[var(--radius-sm)] bg-surface-2 px-4 text-sm font-medium hover:bg-surface-3" onClick={() => load(filters, null, false)}>
              {t('common.error.retry')}
            </button>
          </div>
        ) : loading && items.length === 0 ? (
          <><Skeleton /><Skeleton /><Skeleton /></>
        ) : items.length === 0 ? (
          <div class="flex flex-col items-center rounded-[var(--radius-md)] border border-dashed border-border px-6 py-14 text-center">
            <p class="text-sm font-semibold text-fg">{t('common.empty.title')}</p>
            <p class="mt-1 text-sm text-fg-tertiary">{t('common.empty.body')}</p>
          </div>
        ) : (
          items.map((c) => <CardItem key={c.id} card={c} lang={lang} basePath={routes.detail} />)
        )}
      </div>

      <div ref={sentinel} class="h-6" />
      {loading && items.length > 0 && <p class="py-3 text-center text-xs text-fg-muted">{t('common.loading')}</p>}
    </div>
  );
}
