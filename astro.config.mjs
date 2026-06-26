// @ts-check
import { defineConfig } from 'astro/config';
import preact from '@astrojs/preact';
import node from '@astrojs/node';
import tailwindcss from '@tailwindcss/vite';

// Arquitectura de islas: SSR por defecto (listados/búsqueda dinámicos del lado
// servidor) con JS mínimo en el cliente. El adaptador de Node permite `build` y
// despliegue self-hosted; se puede intercambiar por @astrojs/cloudflare o
// @astrojs/vercel en el runbook sin tocar código de aplicación.
export default defineConfig({
  output: 'server',
  adapter: node({ mode: 'standalone' }),
  integrations: [preact()],
  vite: {
    plugins: [tailwindcss()],
  },
  // i18n se resuelve en src/middleware.ts vía cookie/Accept-Language para
  // mantener un único árbol de rutas y una preferencia de idioma persistente.
});
