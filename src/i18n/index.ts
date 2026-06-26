/**
 * Helpers de i18n. `useTranslations(lang)` devuelve una función `t` con
 * interpolación de `{placeholders}`. La detección de idioma vive en el
 * middleware; aquí solo la lógica pura, reutilizable también en islas.
 */
import { LANGS, ui, type Lang, type UIKey } from './ui';

export type { Lang, UIKey } from './ui';
export type TranslateFn = (key: UIKey, params?: Record<string, string | number>) => string;

export const LANG_COOKIE = 'rr_lang';

export function isLang(value: string | undefined | null): value is Lang {
  return !!value && (LANGS as readonly string[]).includes(value);
}

export function useTranslations(lang: Lang): TranslateFn {
  const table = ui[lang];
  return (key, params) => {
    let text: string = table[key] ?? ui.es[key] ?? key;
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        text = text.replaceAll(`{${k}}`, String(v));
      }
    }
    return text;
  };
}

/** Negocia el idioma desde una cabecera Accept-Language (p. ej. "en-US,en;q=0.9"). */
export function negotiateLang(acceptLanguage: string | null, fallback: Lang): Lang {
  if (!acceptLanguage) return fallback;
  for (const part of acceptLanguage.split(',')) {
    const code = part.trim().split(';')[0]?.slice(0, 2).toLowerCase();
    if (isLang(code)) return code;
  }
  return fallback;
}
