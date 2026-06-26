/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/client" />

type Lang = import('./i18n/ui').Lang;
type TranslateFn = import('./i18n/index').TranslateFn;

declare namespace App {
  interface Locals {
    /** Idioma resuelto para la petición (cookie -> Accept-Language -> defecto). */
    lang: Lang;
    /** Función de traducción ligada al idioma de la petición. */
    t: TranslateFn;
  }
}

interface ImportMetaEnv {
  readonly PUBLIC_EVENT_NAME?: string;
  readonly PUBLIC_DEFAULT_LOCALE?: string;
  readonly PUBLIC_ENABLED_MODULES?: string;
  readonly PUBLIC_DEFAULT_ZONE?: string;
  readonly DATABASE_URL?: string;
  readonly TOKEN_SIGNING_SECRET?: string;
  readonly MODERATION_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
