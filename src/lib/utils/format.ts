/**
 * Formato sensible al locale (fechas, números, "hace X"). i18n de extremo a
 * extremo: nada de formatos hardcodeados a un idioma.
 */
import type { Lang } from '@/i18n/ui';

const LOCALE: Record<Lang, string> = { es: 'es-ES', en: 'en-US' };

export function formatDate(iso: string, lang: Lang): string {
  return new Intl.DateTimeFormat(LOCALE[lang], {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(iso));
}

export function formatDateTime(iso: string, lang: Lang): string {
  return new Intl.DateTimeFormat(LOCALE[lang], {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}

export function formatNumber(n: number, lang: Lang): string {
  return new Intl.NumberFormat(LOCALE[lang]).format(n);
}

/** "hace 3 h" / "3 h ago" usando Intl.RelativeTimeFormat. */
export function timeAgo(iso: string, lang: Lang): string {
  const rtf = new Intl.RelativeTimeFormat(LOCALE[lang], { numeric: 'auto' });
  const diffMs = Date.now() - new Date(iso).getTime();
  const sec = Math.round(diffMs / 1000);
  const ranges: [Intl.RelativeTimeFormatUnit, number][] = [
    ['year', 31_536_000],
    ['month', 2_592_000],
    ['week', 604_800],
    ['day', 86_400],
    ['hour', 3_600],
    ['minute', 60],
  ];
  for (const [unit, secondsIn] of ranges) {
    if (Math.abs(sec) >= secondsIn) {
      return rtf.format(-Math.round(sec / secondsIn), unit);
    }
  }
  return rtf.format(-sec, 'second');
}
