/**
 * Isla de alta de Ofertas/Necesidades. Lo distintivo: mientras eliges cara
 * (oferta/necesidad) + categoría + zona, mostramos en vivo las COINCIDENCIAS de
 * la cara opuesta (emparejamiento por categoría + zona). No bloquea: informa.
 */
import { useEffect, useState } from 'preact/hooks';
import type { OfferCard, OfferCategory, OfferKind } from '@/lib/engine/types';
import { ALL_OFFER_CATEGORIES } from '@/lib/engine/types';
import { useTranslations, type Lang, type UIKey } from '@/i18n/index';

interface Props {
  lang: Lang;
  defaultZone: string;
}
interface Match {
  card: OfferCard;
  score: number;
}
interface CreateResponse {
  ok: boolean;
  card?: OfferCard;
  manageUrl?: string;
}

export default function OfferCreateForm({ lang, defaultZone }: Props) {
  const t = useTranslations(lang);

  const [kind, setKind] = useState<OfferKind>('offer');
  const [category, setCategory] = useState<OfferCategory>('water');
  const [quantity, setQuantity] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [zone, setZone] = useState(defaultZone);
  const [description, setDescription] = useState('');
  const [contactMethod, setContactMethod] = useState<'phone' | 'email' | 'other'>('phone');
  const [contactValue, setContactValue] = useState('');

  const [matches, setMatches] = useState<Match[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ card: OfferCard; manageUrl: string } | null>(null);
  const [copied, setCopied] = useState(false);

  // Coincidencias en vivo con la cara opuesta.
  useEffect(() => {
    const id = setTimeout(async () => {
      try {
        const res = await fetch('/api/ofertas/matches', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ kind, category, zone: zone || null }),
        });
        const data = await res.json();
        setMatches(data.matches ?? []);
      } catch {
        setMatches([]);
      }
    }, 350);
    return () => clearTimeout(id);
  }, [kind, category, zone]);

  async function submit(e: Event) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/ofertas', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          kind,
          category,
          quantity: quantity || null,
          expiresAt: expiresAt || null,
          zone: zone || null,
          description: description || null,
          contact: contactValue ? { method: contactMethod, value: contactValue } : null,
        }),
      });
      const data = (await res.json()) as CreateResponse;
      if (!res.ok || !data.ok || !data.card || !data.manageUrl) throw new Error('error');
      setCreated({ card: data.card, manageUrl: data.manageUrl });
    } catch {
      setError(t('common.error.title'));
    } finally {
      setSubmitting(false);
    }
  }

  if (created) {
    const manageUrl = typeof location !== 'undefined' ? location.origin + created.manageUrl : created.manageUrl;
    return (
      <div class="rounded-[var(--radius-md)] border border-border bg-surface p-5">
        <div class="flex items-center gap-2 text-success">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 4.5 4.5L19 7" /></svg>
          <h2 class="text-lg font-semibold text-fg">{t('offers.new.success.title')}</h2>
        </div>
        <p class="mt-2 text-sm text-fg-tertiary">{t('offers.new.success.body')}</p>
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
        <a href={`/ofertas/${created.card.id}`} class="mt-4 inline-block text-sm font-medium text-primary hover:underline">
          {t('offers.new.view')} →
        </a>
      </div>
    );
  }

  const labelCls = 'flex items-center gap-2 text-sm font-medium text-fg-secondary';
  const optional = <span class="text-xs font-normal text-fg-muted">({t('common.optional')})</span>;

  return (
    <form onSubmit={submit} class="space-y-5">
      <fieldset class="space-y-2">
        <legend class={labelCls + ' mb-1'}>{t('offers.field.kind')}</legend>
        {(['offer', 'need'] as OfferKind[]).map((k) => (
          <label key={k} class={'flex cursor-pointer items-start gap-3 rounded-[var(--radius-sm)] border p-3 transition-colors ' + (kind === k ? 'border-primary bg-primary-soft' : 'border-border bg-surface hover:bg-surface-2')}>
            <input type="radio" name="kind" class="mt-0.5 accent-[var(--primary)]" checked={kind === k} onChange={() => setKind(k)} />
            <span>
              <span class="block text-sm font-medium text-fg">{t(`offers.kind.${k}` as UIKey)}</span>
              <span class="block text-xs text-fg-tertiary">{t(`offers.new.kind.${k}.desc` as UIKey)}</span>
            </span>
          </label>
        ))}
      </fieldset>

      <div class="space-y-1.5">
        <label for="cat" class={labelCls}><span>{t('offers.field.category')}</span></label>
        <select id="cat" class="select" value={category} onChange={(e) => setCategory((e.target as HTMLSelectElement).value as OfferCategory)}>
          {ALL_OFFER_CATEGORIES.map((c) => <option key={c} value={c}>{t(`offers.category.${c}` as UIKey)}</option>)}
        </select>
      </div>

      <div class="space-y-1.5">
        <label for="zone" class={labelCls}><span>{t('common.zone')}</span>{optional}</label>
        <input id="zone" class="input" maxLength={120} value={zone} onInput={(e) => setZone((e.target as HTMLInputElement).value)} />
      </div>

      {/* Coincidencias en vivo (cara opuesta) */}
      {matches.length > 0 && (
        <div class="rounded-[var(--radius-sm)] border border-primary/30 bg-primary-soft p-3">
          <p class="text-sm font-semibold text-fg">{t('offers.new.matches.title')}</p>
          <p class="mt-0.5 text-xs text-fg-tertiary">{t('offers.new.matches.body')}</p>
          <ul class="mt-2 space-y-1.5">
            {matches.map((m) => (
              <li key={m.card.id}>
                <a href={`/ofertas/${m.card.id}`} class="flex items-center justify-between gap-2 rounded bg-bg/50 px-3 py-2 text-sm hover:bg-bg">
                  <span class="font-medium text-fg">{t(`offers.kind.${m.card.kind}` as UIKey)} · {t(`offers.category.${m.card.category}` as UIKey)}</span>
                  <span class="text-xs text-fg-tertiary">{m.card.zone} →</span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div class="grid grid-cols-2 gap-3">
        <div class="space-y-1.5">
          <label for="qty" class={labelCls}><span>{t('offers.field.quantity')}</span>{optional}</label>
          <input id="qty" class="input" maxLength={80} value={quantity} onInput={(e) => setQuantity((e.target as HTMLInputElement).value)} />
        </div>
        <div class="space-y-1.5">
          <label for="exp" class={labelCls}><span>{t('offers.field.expires')}</span>{optional}</label>
          <input id="exp" type="datetime-local" class="input" value={expiresAt} onInput={(e) => setExpiresAt((e.target as HTMLInputElement).value)} />
        </div>
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
        {submitting ? t('common.loading') : t('offers.new.submit')}
      </button>
    </form>
  );
}
