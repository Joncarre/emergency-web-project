/**
 * Isla de "ver contacto": el dato protegido no se renderiza en el HTML público.
 * Solo se obtiene tras una acción explícita (y rate-limited) del usuario.
 */
import { useState } from 'preact/hooks';
import { useTranslations, type Lang } from '@/i18n/index';

interface Props {
  lang: Lang;
  id: string;
}
interface Contact {
  method: 'phone' | 'email' | 'other';
  value: string;
}

export default function RevealContact({ lang, id }: Props) {
  const t = useTranslations(lang);
  const [contact, setContact] = useState<Contact | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  async function reveal() {
    setLoading(true);
    setError(false);
    try {
      const res = await fetch(`/api/personas/${id}/contact`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error();
      setContact(data.contact);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  if (contact) {
    const href =
      contact.method === 'phone'
        ? `tel:${contact.value}`
        : contact.method === 'email'
          ? `mailto:${contact.value}`
          : undefined;
    return (
      <div class="rounded-[var(--radius-sm)] border border-border bg-surface-2 p-3">
        <p class="text-xs font-medium text-fg-tertiary">{t('common.contact')}</p>
        {href ? (
          <a href={href} class="text-sm font-semibold text-primary hover:underline">
            {contact.value}
          </a>
        ) : (
          <p class="text-sm font-semibold text-fg">{contact.value}</p>
        )}
      </div>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={reveal}
        disabled={loading}
        class="inline-flex min-h-11 items-center justify-center gap-2 rounded-[var(--radius-sm)] border border-border bg-surface-2 px-4 text-sm font-medium text-fg transition-colors hover:bg-surface-3 disabled:opacity-50"
      >
        {loading ? t('common.loading') : t('common.contact.reveal')}
      </button>
      {error && <p class="mt-1 text-xs text-danger">{t('common.error.title')}</p>}
    </div>
  );
}
