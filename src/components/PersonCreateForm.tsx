/**
 * Isla de alta de Personas. Flujo en UNA pantalla (mobile-first):
 *  1) Elegir dirección (busco / he encontrado).
 *  2) Datos mínimos. Mientras se escribe el nombre, comprobación anti-duplicados
 *     en tiempo real ("¿es alguna de estas?").
 *  3) Al publicar, se muestra el enlace de gestión UNA sola vez (copiar/guardar).
 */
import { useEffect, useState } from 'preact/hooks';
import type { PersonCard, PersonDirection } from '@/lib/engine/types';
import { useTranslations, type Lang } from '@/i18n/index';

interface Props {
  lang: Lang;
  defaultZone: string;
}
interface SimilarMatch {
  card: PersonCard;
  score: number;
}
interface CreateResponse {
  ok: boolean;
  card: PersonCard;
  manageUrl: string;
  error?: { code: string; message?: string };
}

export default function PersonCreateForm({ lang, defaultZone }: Props) {
  const t = useTranslations(lang);

  const [direction, setDirection] = useState<PersonDirection>('searching');
  const [fullName, setFullName] = useState('');
  const [ageApprox, setAge] = useState('');
  const [lastSeenAt, setLastSeen] = useState('');
  const [medicalNotes, setMedical] = useState('');
  const [zone, setZone] = useState(defaultZone);
  const [description, setDescription] = useState('');
  const [contactMethod, setContactMethod] = useState<'phone' | 'email' | 'other'>('phone');
  const [contactValue, setContactValue] = useState('');

  const [matches, setMatches] = useState<SimilarMatch[]>([]);
  const [checking, setChecking] = useState(false);
  const [dismissedSimilar, setDismissed] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CreateResponse | null>(null);
  const [copied, setCopied] = useState(false);
  const draftKey = 'rr_people_draft';

  // Borrador local: no perder lo escrito si falla la conexión.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(draftKey);
      if (raw) {
        const d = JSON.parse(raw);
        setDirection(d.direction ?? 'searching');
        setFullName(d.fullName ?? '');
        setZone(d.zone ?? defaultZone);
        setDescription(d.description ?? '');
      }
    } catch {}
  }, [defaultZone]);
  useEffect(() => {
    try {
      localStorage.setItem(draftKey, JSON.stringify({ direction, fullName, zone, description }));
    } catch {}
  }, [direction, fullName, zone, description]);

  // Anti-duplicados en tiempo real (debounced).
  useEffect(() => {
    if (fullName.trim().length < 2) {
      setMatches([]);
      return;
    }
    const id = setTimeout(async () => {
      setChecking(true);
      try {
        const res = await fetch('/api/personas/similar', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            fullName,
            zone: zone || null,
            ageApprox: ageApprox ? Number(ageApprox) : null,
          }),
        });
        const data = await res.json();
        setMatches(data.matches ?? []);
        setDismissed(false);
      } catch {
        setMatches([]);
      } finally {
        setChecking(false);
      }
    }, 400);
    return () => clearTimeout(id);
  }, [fullName, zone, ageApprox]);

  async function submit(e: Event) {
    e.preventDefault();
    if (fullName.trim().length < 2) {
      setError(t('people.field.fullName'));
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/personas', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          direction,
          fullName,
          ageApprox: ageApprox ? Number(ageApprox) : null,
          lastSeenAt: lastSeenAt || null,
          medicalNotes: medicalNotes || null,
          zone: zone || null,
          description: description || null,
          contact: contactValue ? { method: contactMethod, value: contactValue } : null,
        }),
      });
      const data = (await res.json()) as CreateResponse;
      if (!res.ok || !data.ok) throw new Error(data.error?.code ?? 'error');
      try {
        localStorage.removeItem(draftKey);
      } catch {}
      setResult(data);
    } catch {
      setError(t('common.error.title'));
    } finally {
      setSubmitting(false);
    }
  }

  // ----- Éxito: enlace de gestión (una sola vez) -----
  if (result) {
    const manageUrl =
      typeof location !== 'undefined' ? location.origin + result.manageUrl : result.manageUrl;
    return (
      <div class="rounded-[var(--radius-md)] border border-border bg-surface p-5">
        <div class="flex items-center gap-2 text-success">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 4.5 4.5L19 7" /></svg>
          <h2 class="text-lg font-semibold text-fg">{t('people.new.success.title')}</h2>
        </div>
        <p class="mt-2 text-sm text-fg-tertiary">{t('people.new.success.body')}</p>

        <div class="mt-4 rounded-[var(--radius-sm)] border border-warning/40 bg-warning-soft p-3">
          <p class="text-xs font-semibold uppercase tracking-wide text-warning">
            {t('people.new.token.title')}
          </p>
          <p class="mt-1 text-xs text-fg-secondary">{t('people.new.token.warn')}</p>
          <code class="mt-2 block break-all rounded bg-bg/60 p-2 text-xs text-fg">{manageUrl}</code>
          <button
            type="button"
            class="mt-2 inline-flex min-h-9 items-center gap-2 rounded-[var(--radius-sm)] bg-primary px-3 text-sm font-medium text-on-accent hover:bg-primary-hover"
            onClick={() => {
              navigator.clipboard?.writeText(manageUrl);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            }}
          >
            {copied ? t('common.copied') : t('people.new.token.copy')}
          </button>
        </div>

        <a
          href={`/personas/${result.card.id}`}
          class="mt-4 inline-block text-sm font-medium text-primary hover:underline"
        >
          {t('people.new.view')} →
        </a>
      </div>
    );
  }

  const labelCls = 'flex items-center gap-2 text-sm font-medium text-fg-secondary';
  const showSimilar = matches.length > 0 && !dismissedSimilar;

  return (
    <form onSubmit={submit} class="space-y-5">
      {/* Dirección */}
      <fieldset class="space-y-2">
        <legend class={labelCls + ' mb-1'}>{t('people.field.direction')}</legend>
        {(['searching', 'found'] as PersonDirection[]).map((d) => (
          <label
            key={d}
            class={
              'flex cursor-pointer items-start gap-3 rounded-[var(--radius-sm)] border p-3 transition-colors ' +
              (direction === d ? 'border-primary bg-primary-soft' : 'border-border bg-surface hover:bg-surface-2')
            }
          >
            <input
              type="radio"
              name="direction"
              class="mt-0.5 accent-[var(--primary)]"
              checked={direction === d}
              onChange={() => setDirection(d)}
            />
            <span>
              <span class="block text-sm font-medium text-fg">{t(`people.direction.${d}`)}</span>
              <span class="block text-xs text-fg-tertiary">{t(`people.new.direction.${d}.desc`)}</span>
            </span>
          </label>
        ))}
      </fieldset>

      {/* Nombre */}
      <div class="space-y-1.5">
        <label for="fullName" class={labelCls}>
          <span>{t('people.field.fullName')}</span>
          <span class="text-xs text-danger" aria-hidden="true">*</span>
        </label>
        <input
          id="fullName"
          class="input"
          required
          maxLength={120}
          value={fullName}
          onInput={(e) => setFullName((e.target as HTMLInputElement).value)}
        />
        {checking && <p class="text-xs text-fg-muted">{t('people.new.checking')}</p>}
      </div>

      {/* Sugerencias anti-duplicados */}
      {showSimilar && (
        <div class="rounded-[var(--radius-sm)] border border-warning/40 bg-warning-soft p-3">
          <p class="text-sm font-semibold text-fg">{t('people.new.similar.title')}</p>
          <p class="mt-0.5 text-xs text-fg-tertiary">{t('people.new.similar.body')}</p>
          <ul class="mt-2 space-y-1.5">
            {matches.map((m) => (
              <li key={m.card.id}>
                <a
                  href={`/personas/${m.card.id}`}
                  class="flex items-center justify-between gap-2 rounded bg-bg/50 px-3 py-2 text-sm hover:bg-bg"
                >
                  <span class="font-medium text-fg">{m.card.fullName}</span>
                  <span class="text-xs text-fg-tertiary">
                    {m.card.zone} · {t('people.new.similar.use')} →
                  </span>
                </a>
              </li>
            ))}
          </ul>
          <button
            type="button"
            class="mt-2 text-xs font-medium text-fg-secondary underline"
            onClick={() => setDismissed(true)}
          >
            {t('people.new.similar.continue')}
          </button>
        </div>
      )}

      {/* Edad + última vez */}
      <div class="grid grid-cols-2 gap-3">
        <div class="space-y-1.5">
          <label for="age" class={labelCls}>
            <span>{t('people.field.age')}</span>
            <span class="text-xs font-normal text-fg-muted">({t('common.optional')})</span>
          </label>
          <input
            id="age"
            type="number"
            min={0}
            max={120}
            class="input tabular"
            value={ageApprox}
            onInput={(e) => setAge((e.target as HTMLInputElement).value)}
          />
        </div>
        <div class="space-y-1.5">
          <label for="lastSeen" class={labelCls}>
            <span>{t('people.field.lastSeen')}</span>
            <span class="text-xs font-normal text-fg-muted">({t('common.optional')})</span>
          </label>
          <input
            id="lastSeen"
            type="datetime-local"
            class="input"
            value={lastSeenAt}
            onInput={(e) => setLastSeen((e.target as HTMLInputElement).value)}
          />
        </div>
      </div>

      {/* Zona */}
      <div class="space-y-1.5">
        <label for="zone" class={labelCls}>
          <span>{t('common.zone')}</span>
          <span class="text-xs font-normal text-fg-muted">({t('common.optional')})</span>
        </label>
        <input
          id="zone"
          class="input"
          maxLength={120}
          value={zone}
          onInput={(e) => setZone((e.target as HTMLInputElement).value)}
        />
      </div>

      {/* Descripción */}
      <div class="space-y-1.5">
        <label for="desc" class={labelCls}>
          <span>{t('common.description')}</span>
          <span class="text-xs font-normal text-fg-muted">({t('common.optional')})</span>
        </label>
        <textarea
          id="desc"
          class="textarea"
          maxLength={1000}
          value={description}
          onInput={(e) => setDescription((e.target as HTMLTextAreaElement).value)}
        />
      </div>

      {/* Notas médicas */}
      <div class="space-y-1.5">
        <label for="medical" class={labelCls}>
          <span>{t('people.field.medical')}</span>
          <span class="text-xs font-normal text-fg-muted">({t('common.optional')})</span>
        </label>
        <input
          id="medical"
          class="input"
          maxLength={500}
          value={medicalNotes}
          onInput={(e) => setMedical((e.target as HTMLInputElement).value)}
        />
      </div>

      {/* Contacto protegido */}
      <div class="space-y-1.5">
        <label class={labelCls}>
          <span>{t('common.contact')}</span>
          <span class="text-xs font-normal text-fg-muted">({t('common.optional')})</span>
        </label>
        <div class="flex gap-2">
          <select
            class="select w-32 shrink-0"
            value={contactMethod}
            onChange={(e) => setContactMethod((e.target as HTMLSelectElement).value as typeof contactMethod)}
          >
            <option value="phone">{t('common.contact.method.phone')}</option>
            <option value="email">{t('common.contact.method.email')}</option>
            <option value="other">{t('common.contact.method.other')}</option>
          </select>
          <input
            class="input"
            maxLength={200}
            value={contactValue}
            onInput={(e) => setContactValue((e.target as HTMLInputElement).value)}
          />
        </div>
      </div>

      {error && <p class="text-sm font-medium text-danger">{error}</p>}

      <button
        type="submit"
        disabled={submitting}
        class="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-[var(--radius-sm)] bg-primary px-5 text-base font-medium text-on-accent transition-[transform,background-color] duration-150 hover:bg-primary-hover active:scale-[0.98] disabled:opacity-50"
      >
        {submitting ? t('common.loading') : t('people.new.submit')}
      </button>
    </form>
  );
}
