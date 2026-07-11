# Diccionario de datos

Campos, estados y reglas por módulo. Los campos `(opc.)` son opcionales.
El **contacto** nunca se expone en abierto: se revela tras una acción explícita.

## Campos comunes (motor / tabla `cards`)

| Campo | Tipo | Notas |
|---|---|---|
| `id` | text | Identificador opaco (nanoid), no enumerable |
| `module` | enum | `people`/`pets`/`goods`/`offers`/`map` |
| `status` | text | Estado de la máquina del módulo |
| `zone` | text (opc.) | Zona/ciudad en texto |
| `geo` | point (opc.) | Coordenadas (PostGIS) |
| `description` | text (opc.) | |
| `photo_url` | text (opc.) | Imagen con EXIF/GPS eliminados (Fase 7) |
| `created_at` / `updated_at` | timestamptz | |
| `deleted_at` | timestamptz (opc.) | Soft-delete (reversible) |
| `manage_token_hash` | text | Hash del token de gestión (nunca el token) |

## Personas (`card_people`) — ✅ implementado

| Campo | Tipo | Notas |
|---|---|---|
| `full_name` | text | Nombre y apellidos |
| `age_approx` | int (opc.) | Edad aproximada (0–120) |
| `last_seen_at` | timestamptz (opc.) | Desde cuándo sin contacto |
| `medical_notes` | text (opc.) | Condición médica relevante |
| `direction` | enum | `searching` (busco) / `found` (encontrada sin identificar) |

**Estados:** `missing` → `possible_sighting` → `located`.
**Reglas:** avistamiento (cualquiera) `missing→possible_sighting`; resolver
(`→located`) y descartar/reabrir solo **creador con token** o **moderación**.
**Anti-duplicados:** similitud trigram sobre nombre normalizado + zona + edad.

## Mascotas (`card_pets`) — ⏳ Fase 4

`species`, `name` (opc.), `chip_id` (opc., **UNIQUE**), `breed` (opc.),
`direction` (`lost`/`found`). **Estados:** `lost` · `found` · `reunited`.
Emparejamiento por chip (ID natural) o por similitud zona+descripción.

## Bienes (`card_goods`) — ⏳ Fase 4

`good_type`, `natural_id` (**UNIQUE**: matrícula/nº serie), `direction`
(`found`/`lost`). **Estados:** `found` · `claimed` · `returned`.
Duplicar es imposible: si el ID existe, se enlaza (perdido↔encontrado).

## Ofertas/Necesidades (`card_offers`) — ⏳ Fase 4

`kind` (`offer`/`need`), `category`, `quantity` (opc.), `expires_at` (opc.).
**Estados:** `active` · `fulfilled` · `expired`. Emparejamiento categoría+zona.

## Mapa de estado (`map_reports`) — ✅ implementado

`report_type` (`damage` / `service` / `help_point` / `safe`), `expires_at`
(caducidad en horas al crear; los caducados desaparecen del listado);
geolocalización **obligatoria** en `cards.geo`. **Estados:** `active` ·
`expired` (retirar/reactivar solo con token o moderación). Carga por
bounding-box del viewport + clustering en cliente; sin contacto (minimización).

## Soporte

- `contacts` — contacto protegido (method/value) por tarjeta.
- `sightings` — avistamientos ligados a una tarjeta.
- `audit_log` — append-only: `card_id`, `action`, `at`, `ip_hash`.
- `moderation_reports` — reportes de contenido y su resolución.
