/**
 * Isla de alta de Mascotas. Como Personas, en una pantalla. Lo propio del módulo:
 * si se aporta el nº de chip, comprobamos coincidencia exacta en vivo; y al
 * publicar, si el chip ya existe NO se duplica: se muestra la ficha existente
 * (emparejamiento perdido↔encontrado).
 */
import { useEffect, useState } from 'preact/hooks';
import type { PetCard, PetDirection, PetSpecies } from '@/lib/engine/types';
import { useTranslations, type Lang, type UIKey } from '@/i18n/index';

interface Props {
  lang: Lang;
  defaultZone: string;
}
interface SimilarMatch {
  card: PetCard;
  score: number;
  reason: 'chip' | 'similar';
}
interface CreateResponse {
  ok: boolean;
  created?: PetCard;
  matched?: PetCard;
  manageUrl?: string;
}

const SPECIES: PetSpecies[] = ['dog', 'cat', 'other'];

export default function PetCreateForm({ lang, defaultZone }: Props) {
  const t = useTranslations(lang);

  const [direction, setDirection] = useState<PetDirection>('lost');
  const [species, setSpecies] = useState<PetSpecies>('dog');
  const [name, setName] = useState('');
  const [chipId, setChip] = useState('');
  const [breed, setBreed] = useState('');
  const [zone, setZone] = useState(defaultZone);
  const [description, setDescription] = useState('');
  const [contactMethod, setContactMethod] = useState<'phone' | 'email' | 'other'>('phone');
  const [contactValue, setContactValue] = useState('');

  const [matches, setMatches] = useState<SimilarMatch[]>([]);
  const [dismissed, setDismissed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ card: PetCard; manageUrl: string } | null>(null);
  const [matched, setMatched] = useState<PetCard | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const hasInput = chipId.trim().length >= 3 || name.trim().length >= 2 || breed.trim().length >= 2;
    if (!hasInput) {
      setMatches([]);
      return;
    }
    const id = setTimeout(async () => {
      try {
        const res = await fetch('/api/mascotas/similar', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ species, name: name || null, breed: breed || null, chipId: chipId || null, zone: zone || null }),
        });
        const data = await res.json();
        setMatches(data.matches ?? []);
        setDismissed(false);
      } catch {
        setMatches([]);
      }
    }, 400);
    return () => clearTimeout(id);
  }, [name, breed, species, zone, chipId]);

  async function submit(e: Event) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/mascotas', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          direction,
          species,
          name: name || null,
          chipId: chipId || null,
          breed: breed || null,
          zone: zone || null,
          description: description || null,
          contact: contactValue ? { method: contactMethod, value: contactValue } : null,
        }),
      });
      const data = (await res.json()) as CreateResponse;
      if (!res.ok || !data.ok) throw new Error('error');
      if (data.matched) setMatched(data.matched);
      else if (data.created && data.manageUrl) setCreated({ card: data.created, manageUrl: data.manageUrl });
    } catch {
      setError(t('common.error.title'));
    } finally {
      setSubmitting(false);
    }
  }

  // ----- Chip ya existente: enlazar, no duplicar -----
  if (matched) {
    return (
      <div class="rounded-[var(--radius-md)] border border-warning/40 bg-warning-soft p-5">
        <h2 class="text-lg font-semibold text-fg">{t('pets.new.matched.title')}</h2>
        <p class="mt-2 text-sm text-fg-secondary">{t('pets.new.matched.body')}</p>
        <a href={`/mascotas/${matched.id}`} class="mt-4 inline-block text-sm font-medium text-primary hover:underline">
          {t('pets.new.matched.view')} →
        </a>
      </div>
    );
  }

  // ----- Éxito: enlace de gestión (una sola vez) -----
  if (created) {
    const manageUrl = typeof location !== 'undefined' ? location.origin + created.manageUrl : created.manageUrl;
    return (
      <div class="rounded-[var(--radius-md)] border border-border bg-surface p-5">
        <div class="flex items-center gap-2 text-success">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 4.5 4.5L19 7" /></svg>
          <h2 class="text-lg font-semibold text-fg">{t('pets.new.success.title')}</h2>
        </div>
        <p class="mt-2 text-sm text-fg-tertiary">{t('pets.new.success.body')}</p>
        <div class="mt-4 rounded-[var(--radius-sm)] border border-warning/40 bg-warning-soft p-3">
          <p class="text-xs font-semibold uppercase tracking-wide text-warning">{t('people.new.token.title')}</p>
          <p class="mt-1 text-xs text-fg-secondary">{t('people.new.token.warn')}</p>
          <code class="mt-2 block break-all rounded bg-bg/60 p-2 text-xs text-fg">{manageUrl}</code>
          <button
            type="button"
            class="mt-2 inline-flex min-h-9 items-center gap-2 rounded-[var(--radius-sm)] bg-primary px-3 text-sm font-medium text-on-accent hover:bg-primary-hover"
            onClick={() => { navigator.clipboard?.writeText(manageUrl); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
          >
            {copied ? t('common.copied') : t('people.new.token.copy')}
          </button>
        </div>
        <a href={`/mascotas/${created.card.id}`} class="mt-4 inline-block text-sm font-medium text-primary hover:underline">
          {t('pets.new.view')} →
        </a>
      </div>
    );
  }

  const labelCls = 'flex items-center gap-2 text-sm font-medium text-fg-secondary';
  const optional = <span class="text-xs font-normal text-fg-muted">({t('common.optional')})</span>;
  const showSimilar = matches.length > 0 && !dismissed;

  return (
    <form onSubmit={submit} class="space-y-5">
      <fieldset class="space-y-2">
        <legend class={labelCls + ' mb-1'}>{t('pets.field.direction')}</legend>
        {(['lost', 'found'] as PetDirection[]).map((d) => (
          <label key={d} class={'flex cursor-pointer items-start gap-3 rounded-[var(--radius-sm)] border p-3 transition-colors ' + (direction === d ? 'border-primary bg-primary-soft' : 'border-border bg-surface hover:bg-surface-2')}>
            <input type="radio" name="direction" class="mt-0.5 accent-[var(--primary)]" checked={direction === d} onChange={() => setDirection(d)} />
            <span>
              <span class="block text-sm font-medium text-fg">{t(`pets.direction.${d}` as UIKey)}</span>
              <span class="block text-xs text-fg-tertiary">{t(`pets.new.direction.${d}.desc` as UIKey)}</span>
            </span>
          </label>
        ))}
      </fieldset>

      <div class="grid grid-cols-2 gap-3">
        <div class="space-y-1.5">
          <label for="species" class={labelCls}><span>{t('pets.field.species')}</span></label>
          <select id="species" class="select" value={species} onChange={(e) => setSpecies((e.target as HTMLSelectElement).value as PetSpecies)}>
            {SPECIES.map((s) => <option key={s} value={s}>{t(`pets.species.${s}` as UIKey)}</option>)}
          </select>
        </div>
        <div class="space-y-1.5">
          <label for="name" class={labelCls}><span>{t('pets.field.name')}</span>{optional}</label>
          <input id="name" class="input" maxLength={80} value={name} onInput={(e) => setName((e.target as HTMLInputElement).value)} />
        </div>
      </div>

      <div class="space-y-1.5">
        <label for="chip" class={labelCls}><span>{t('pets.field.chip')}</span>{optional}</label>
        <input id="chip" class="input tabular" maxLength={40} value={chipId} onInput={(e) => setChip((e.target as HTMLInputElement).value)} />
      </div>

      {showSimilar && (
        <div class="rounded-[var(--radius-sm)] border border-warning/40 bg-warning-soft p-3">
          <p class="text-sm font-semibold text-fg">{t('pets.new.similar.title')}</p>
          <p class="mt-0.5 text-xs text-fg-tertiary">{t('pets.new.similar.body')}</p>
          <ul class="mt-2 space-y-1.5">
            {matches.map((m) => (
              <li key={m.card.id}>
                <a href={`/mascotas/${m.card.id}`} class="flex items-center justify-between gap-2 rounded bg-bg/50 px-3 py-2 text-sm hover:bg-bg">
                  <span class="font-medium text-fg">{m.card.name || t(`pets.species.${m.card.species}` as UIKey)}</span>
                  <span class="text-xs text-fg-tertiary">
                    {m.reason === 'chip' ? t('pets.new.similar.chip') : m.card.zone} · {t('pets.new.similar.use')} →
                  </span>
                </a>
              </li>
            ))}
          </ul>
          <button type="button" class="mt-2 text-xs font-medium text-fg-secondary underline" onClick={() => setDismissed(true)}>
            {t('pets.new.similar.continue')}
          </button>
        </div>
      )}

      <div class="space-y-1.5">
        <label for="breed" class={labelCls}><span>{t('pets.field.breed')}</span>{optional}</label>
        <input id="breed" class="input" maxLength={80} value={breed} onInput={(e) => setBreed((e.target as HTMLInputElement).value)} />
      </div>

      <div class="space-y-1.5">
        <label for="zone" class={labelCls}><span>{t('common.zone')}</span>{optional}</label>
        <input id="zone" class="input" maxLength={120} value={zone} onInput={(e) => setZone((e.target as HTMLInputElement).value)} />
      </div>

      <div class="space-y-1.5">
        <label for="desc" class={labelCls}><span>{t('common.description')}</span>{optional}</label>
        <textarea id="desc" class="textarea" maxLength={1000} value={description} onInput={(e) => setDescription((e.target as HTMLTextAreaElement).value)} />
      </div>

      <div class="space-y-1.5">
        <label class={labelCls}><span>{t('common.contact')}</span>{optional}</label>
        <div class="flex gap-2">
          <select class="select w-32 shrink-0" value={contactMethod} onChange={(e) => setContactMethod((e.target as HTMLSelectElement).value as typeof contactMethod)}>
            <option value="phone">{t('common.contact.method.phone')}</option>
            <option value="email">{t('common.contact.method.email')}</option>
            <option value="other">{t('common.contact.method.other')}</option>
          </select>
          <input class="input" maxLength={200} value={contactValue} onInput={(e) => setContactValue((e.target as HTMLInputElement).value)} />
        </div>
      </div>

      {error && <p class="text-sm font-medium text-danger">{error}</p>}

      <button type="submit" disabled={submitting} class="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-[var(--radius-sm)] bg-primary px-5 text-base font-medium text-on-accent transition-[transform,background-color] duration-150 hover:bg-primary-hover active:scale-[0.98] disabled:opacity-50">
        {submitting ? t('common.loading') : t('pets.new.submit')}
      </button>
    </form>
  );
}
