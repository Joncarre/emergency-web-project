/**
 * Middleware: resuelve el idioma de cada petición una sola vez y lo expone en
 * `Astro.locals` (lang + t). Prioridad: cookie del usuario -> Accept-Language
 * -> idioma por defecto del despliegue. Un único árbol de rutas, preferencia
 * persistente (la fija LanguageSwitcher escribiendo la cookie).
 */
import { defineMiddleware } from 'astro:middleware';
import { deployment } from '@/config/deployment';
import { LANG_COOKIE, isLang, negotiateLang, useTranslations } from '@/i18n/index';

export const onRequest = defineMiddleware((context, next) => {
  const cookieLang = context.cookies.get(LANG_COOKIE)?.value;
  const lang = isLang(cookieLang)
    ? cookieLang
    : negotiateLang(context.request.headers.get('accept-language'), deployment.defaultLocale);

  context.locals.lang = lang;
  context.locals.t = useTranslations(lang);
  return next();
});
