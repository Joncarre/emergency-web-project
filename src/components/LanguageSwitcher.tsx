/**
 * Isla mínima para cambiar de idioma. Escribe la cookie de preferencia (que lee
 * el middleware en SSR) y recarga. JS irrisorio: dos botones y un set de cookie.
 */
import { LANG_COOKIE, type Lang } from '@/i18n/index';

interface Props {
  lang: Lang;
  labelEs: string;
  labelEn: string;
  ariaLabel: string;
}

export default function LanguageSwitcher({ lang, labelEs, labelEn, ariaLabel }: Props) {
  function setLang(next: Lang) {
    if (next === lang) return;
    document.cookie = `${LANG_COOKIE}=${next};path=/;max-age=31536000;samesite=lax`;
    location.reload();
  }

  const opts: { id: Lang; label: string }[] = [
    { id: 'es', label: labelEs },
    { id: 'en', label: labelEn },
  ];

  return (
    <div
      role="group"
      aria-label={ariaLabel}
      class="inline-flex rounded-[var(--radius-sm)] border border-border bg-surface-2 p-0.5"
    >
      {opts.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => setLang(o.id)}
          aria-pressed={o.id === lang}
          class={
            'min-h-9 rounded-[calc(var(--radius-sm)-2px)] px-2.5 text-xs font-medium transition-colors ' +
            (o.id === lang
              ? 'bg-surface text-fg shadow-[var(--shadow-overlay)]'
              : 'text-fg-tertiary hover:text-fg')
          }
        >
          {o.id.toUpperCase()}
          <span class="sr-only"> — {o.label}</span>
        </button>
      ))}
    </div>
  );
}
