# Runbook de activación rápida

El valor de la plataforma está en **desplegar en minutos** ante un nuevo evento.
Esta lista es la versión actual (modo demo + cimientos); se ampliará con la
provisión de Postgres en la Fase 2.

## Checklist

1. **Clonar y configurar el evento**
   - `cp .env.example .env`
   - Fijar `PUBLIC_EVENT_NAME` (p. ej. "Terremoto Región X — Junio 2026").
   - Fijar `PUBLIC_DEFAULT_LOCALE` (`es` o `en`).
   - Activar solo los módulos relevantes en `PUBLIC_ENABLED_MODULES`
     (hoy operativo: `people`; el resto se muestra como "próximamente").
   - Opcional: `PUBLIC_DEFAULT_ZONE` con la zona/ciudad principal afectada.

2. **Instalar y verificar localmente**
   - `npm install`
   - `npm run build` (ejecuta typecheck + build; debe terminar sin errores).
   - `npm run dev` y comprobar: home, alta de ficha, listado/búsqueda, gestión
     por token y avistamiento.

3. **Secretos (cuando se conecte la BD / anti-abuso)**
   - `TOKEN_SIGNING_SECRET` — generar con `openssl rand -hex 32`.
   - `DATABASE_URL` — Postgres gestionado (aplicar `db/schema.sql`).
   - `CAPTCHA_*`, `STORAGE_*`, `MODERATION_KEY` según se habiliten.
   - Verificar que `.env` **no** se commitea (ya está en `.gitignore`).

4. **Desplegar**
   - Build SSR con el adaptador de Node (`@astrojs/node`, ya configurado).
   - Para edge/CDN, intercambiar el adaptador por `@astrojs/cloudflare` o
     `@astrojs/vercel` en `astro.config.mjs` (sin tocar código de aplicación).

5. **Publicar y vigilar**
   - Comprobar healthcheck / carga de la home.
   - Difundir el enlace.
   - Revisar la cola de moderación periódicamente (Fase 5).

## Verificación funcional rápida (modo demo)

- [ ] La home lista los módulos activos y respeta el idioma por defecto.
- [ ] El selector ES/EN cambia toda la interfaz y **persiste** al recargar.
- [ ] Alta de una persona → aparece el **enlace de gestión** una sola vez.
- [ ] El enlace de gestión permite cambiar el estado (p. ej. → *localizada*).
- [ ] "He visto a esta persona" marca la ficha como *posible localización*.
- [ ] Al teclear un nombre parecido, salen sugerencias **anti-duplicados**.
- [ ] Búsqueda y filtros por estado funcionan; el scroll carga más resultados.
- [ ] Modo claro/oscuro y navegación por teclado (foco visible).
