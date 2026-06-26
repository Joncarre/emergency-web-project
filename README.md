# rapid-relief

Plataforma web ligera, bilingüe (ES/EN) y **parametrizable** de respuesta rápida
ante catástrofes. Permite a la población civil **registrar, buscar y emparejar**
información crítica durante una emergencia: personas desaparecidas, mascotas,
bienes, oferta/demanda de ayuda y el estado/peligros de la zona en un mapa.

No es "la web de un desastre concreto", sino un **motor reutilizable** que se
despliega en minutos cambiando configuración, no código.

> Documento rector del producto: [`PROMPT_PLATAFORMA_CATASTROFES.md`](./PROMPT_PLATAFORMA_CATASTROFES.md).
> Ante cualquier duda de implementación: **gana la simplicidad y la utilidad**
> para quien usa la herramienta bajo estrés.

---

## Estado actual

Fundamentos + **módulo Personas de extremo a extremo** (la referencia del motor).

| Capacidad | Estado |
|---|---|
| Cimientos (Astro + Tailwind v4 + TypeScript) | ✅ |
| Design tokens + claro/oscuro + WCAG AA | ✅ |
| i18n ES/EN (middleware + cookie persistente) | ✅ |
| Motor común (tarjeta · estados · tokens · soft-delete · audit) | ✅ |
| Repositorio (interfaz + impl. en memoria con datos sintéticos) | ✅ |
| **Personas**: alta, listado, búsqueda, filtros, scroll infinito | ✅ |
| **Personas**: gestión por token, avistamientos, anti-duplicados | ✅ |
| Anti-abuso: rate-limit + validación/saneamiento (zod) | ✅ |
| Persistencia Postgres + PostGIS | ⏳ Fase 2 (esquema en [`db/schema.sql`](./db/schema.sql)) |
| Mascotas · Bienes · Ofertas/Necesidades · Mapa | ⏳ Fase 4 |
| CAPTCHA, subida de imágenes (EXIF strip), moderación | ⏳ Fase 5/7 |

> **Modo demo:** sin `DATABASE_URL`, la app usa un repositorio **en memoria** con
> datos de ejemplo. Ideal para arrancar y ver el flujo completo al instante.

---

## Arranque rápido

Requisitos: **Node ≥ 20.10**.

```bash
npm install
npm run dev          # http://localhost:4321
```

Para `build` / typecheck:

```bash
npm run build        # astro check (typecheck) + astro build
npm run preview
```

Configuración opcional: copia `.env.example` a `.env` y ajusta. Sin `.env` la app
arranca en modo demo con valores por defecto.

---

## Principios rectores (resumen)

1. **Utilidad > funcionalidad** · 2. **Flujo sin fricción, sin registro** ·
3. **Mobile-first real** · 4. **Rápido de desplegar** · 5. **Escalable a picos** ·
6. **Arquitectura simple y modular** · 7. **Bilingüe de extremo a extremo** ·
8. **Sobriedad visual** · 9. **Integridad de datos** · 10. **Privacidad por diseño**.

---

## Arquitectura

### El "motor común"

Casi todos los módulos son el **mismo patrón**: una *tarjeta* con identificador,
una **máquina de estados** y, en varios casos, **emparejamiento** entre dos lados.
El motor provee esto una sola vez; cada módulo es una **especialización**.

```
src/lib/engine/        Motor: tipos, registro de módulos, máquina de estados, tokens
src/lib/repository/    Patrón Repository: interfaz + impl. en memoria (+ Postgres en Fase 2)
src/lib/validation/    Esquemas zod (saneamiento/validación)
src/lib/security/      Rate-limit + hash de IP
src/config/            Configuración por despliegue (feature flags)
src/i18n/              Diccionarios ES/EN + helpers
src/components/        UI (.astro) e islas interactivas (.tsx / Preact)
src/pages/             Páginas SSR + endpoints de API
src/styles/global.css  Design tokens (claro/oscuro) y base
db/schema.sql          Esquema Postgres objetivo (Fase 2)
docs/                  Runbook de activación y diccionario de datos
```

### Decisiones técnicas clave

- **Astro (islas) + SSR**: HTML con contenido real en el primer pintado y JS
  mínimo. La interactividad (búsqueda, filtros, scroll infinito, alta) vive en
  **islas Preact** ligeras, no en un SPA pesado.
- **Listas a escala**: paginación **por cursor** (keyset), filtros y búsqueda
  **siempre server-side**, scroll infinito. Nunca se renderizan 50k/200k tarjetas.
- **Tailwind v4 + design tokens** en CSS: un solo tono por superficie, color
  **solo semántico** (rojo=desaparecida, ámbar=sin confirmar, verde=resuelta).
- **Repository pattern**: la app depende de una interfaz, no de la BD. Cambiar de
  memoria a Postgres no toca páginas ni lógica de negocio.

### Modelo de confianza (uso anónimo)

- **Token de capacidad**: al crear una ficha se genera un token secreto que se
  entrega **una sola vez** (enlace `…/gestionar?token=…`). Solo el creador (o
  moderación) puede **editar/resolver**. En BD solo se guarda el *hash*.
- **Avistamientos**: cualquiera puede aportar una pista; **no** borra la ficha,
  la pasa a *posible localización* y avisa al creador.
- **Anti-duplicados**: UNIQUE en IDs naturales (chip/matrícula) + **similitud
  trigram** en tiempo real para Personas.
- **Soft-delete** + **audit log** append-only (IP hasheada, sin PII).

---

## Configuración por despliegue (feature flags)

Variables `PUBLIC_*` (ver [`.env.example`](./.env.example)):

| Variable | Efecto |
|---|---|
| `PUBLIC_EVENT_NAME` | Nombre del evento mostrado en la interfaz |
| `PUBLIC_DEFAULT_LOCALE` | Idioma por defecto (`es`/`en`) |
| `PUBLIC_ENABLED_MODULES` | Módulos activos (`people,pets,goods,offers,map`) |
| `PUBLIC_DEFAULT_ZONE` | Zona sugerida en formularios |

Activación paso a paso: [`docs/runbook.md`](./docs/runbook.md).

---

## Roadmap (fases del documento rector)

- **Fase 2** — Repositorio Postgres (+ PostGIS) tras la misma interfaz; migraciones.
- **Fase 4** — Mascotas, Bienes, Ofertas/Necesidades y Mapa sobre el motor.
- **Fase 5** — Moderación, CAPTCHA, fusión de duplicados.
- **Fase 6** — Pruebas de carga (100k–200k), virtualización, caché en edge.
- **Fase 7** — Hardening (CSP/HSTS), EXIF strip, RGPD (retención/purga).

---

## Licencia

Ver [`LICENSE`](./LICENSE).
