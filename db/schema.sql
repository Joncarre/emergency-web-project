-- ============================================================================
--  rapid-relief — esquema PostgreSQL (objetivo Fase 2)
--
--  Modelo del "motor común": una tabla base `cards` con campos compartidos +
--  una tabla por módulo con sus campos propios (herencia por composición).
--  Extensiones: pg_trgm (búsqueda/anti-duplicados), unaccent (normalización),
--  postgis (mapa y proximidad).
--
--  IDs: texto opaco (nanoid) en lugar de secuenciales -> no enumerables, sin
--  PII en URLs (principio de privacidad). El audit_log sí usa bigserial interno.
-- ============================================================================

create extension if not exists pg_trgm;
create extension if not exists unaccent;
create extension if not exists postgis;

create type module_id as enum ('people', 'pets', 'goods', 'offers', 'map');

-- ---------------------------------------------------------------------------
-- Tabla base de tarjetas (campos comunes a todos los módulos)
-- ---------------------------------------------------------------------------
create table cards (
  id                text primary key,
  module            module_id   not null,
  status            text        not null,
  zone              text,
  geo               geography(Point, 4326),
  description       text,
  photo_url         text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz,                       -- soft-delete (reversible)
  manage_token_hash text        not null               -- solo el hash, nunca el token
);

-- Listado/filtrado server-side (solo tarjetas vivas). El orden por (created_at,
-- id) habilita paginación por cursor (keyset) O(1).
create index idx_cards_module_created on cards (module, created_at desc, id desc)
  where deleted_at is null;
create index idx_cards_module_status  on cards (module, status)  where deleted_at is null;
create index idx_cards_module_zone    on cards (module, zone)    where deleted_at is null;
-- Índice geoespacial para carga por bounding-box del mapa.
create index idx_cards_geo on cards using gist (geo) where deleted_at is null;

-- ---------------------------------------------------------------------------
-- Personas
-- ---------------------------------------------------------------------------
create table card_people (
  card_id      text primary key references cards (id) on delete cascade,
  full_name    text not null,
  age_approx   int  check (age_approx between 0 and 120),
  last_seen_at timestamptz,
  medical_notes text,
  direction    text not null check (direction in ('searching', 'found'))
);
-- Anti-duplicados por nombre: similitud trigram sobre el nombre normalizado.
create index idx_people_fullname_trgm
  on card_people using gin (unaccent(lower(full_name)) gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- Mascotas (Fase 4)
-- ---------------------------------------------------------------------------
create table card_pets (
  card_id   text primary key references cards (id) on delete cascade,
  species   text not null,
  name      text,
  chip_id   text,                       -- ID natural único cuando existe
  breed     text,
  direction text not null check (direction in ('lost', 'found'))
);
-- UNIQUE parcial: imposible duplicar un chip; si existe, se enlaza.
create unique index uq_pets_chip on card_pets (chip_id) where chip_id is not null;

-- ---------------------------------------------------------------------------
-- Bienes (Fase 4)
-- ---------------------------------------------------------------------------
create table card_goods (
  card_id    text primary key references cards (id) on delete cascade,
  good_type  text not null,
  natural_id text not null,             -- matrícula / nº de serie
  direction  text not null check (direction in ('found', 'lost'))
);
create unique index uq_goods_natural_id on card_goods (natural_id);

-- ---------------------------------------------------------------------------
-- Ofertas / Necesidades (Fase 4)
-- ---------------------------------------------------------------------------
create table card_offers (
  card_id    text primary key references cards (id) on delete cascade,
  kind       text not null check (kind in ('offer', 'need')),
  category   text not null,
  quantity   text,
  expires_at timestamptz
);
create index idx_offers_kind_category on card_offers (kind, category);

-- ---------------------------------------------------------------------------
-- Mapa de estado/peligro (Fase 4) — la geolocalización vive en cards.geo
-- ---------------------------------------------------------------------------
create table map_reports (
  card_id     text primary key references cards (id) on delete cascade,
  report_type text not null,
  expires_at  timestamptz
);

-- ---------------------------------------------------------------------------
-- Soporte: contacto protegido, avistamientos, auditoría, moderación
-- ---------------------------------------------------------------------------
create table contacts (
  card_id text primary key references cards (id) on delete cascade,
  method  text not null check (method in ('phone', 'email', 'other')),
  value   text not null              -- cifrar en reposo en producción
);

create table sightings (
  id         text primary key,
  card_id    text not null references cards (id) on delete cascade,
  note       text,
  zone       text,
  geo        geography(Point, 4326),
  created_at timestamptz not null default now()
);
create index idx_sightings_card on sightings (card_id, created_at desc);

-- Append-only: trazabilidad sin exponer PII (solo IP hasheada).
create table audit_log (
  id      bigserial primary key,
  card_id text not null,
  action  text not null,
  at      timestamptz not null default now(),
  ip_hash text
);
create index idx_audit_card on audit_log (card_id, at desc);

create table moderation_reports (
  id          text primary key,
  card_id     text not null references cards (id) on delete cascade,
  reason      text,
  status      text not null default 'open' check (status in ('open', 'resolved', 'dismissed')),
  created_at  timestamptz not null default now(),
  resolved_at timestamptz
);
create index idx_moderation_status on moderation_reports (status, created_at desc);

-- ---------------------------------------------------------------------------
-- Contadores agregados (cacheados) — nunca COUNT(*) en vivo por petición.
-- Refrescar por trigger o tarea periódica.
-- ---------------------------------------------------------------------------
create materialized view card_status_counts as
  select module, status, count(*) as total
  from cards
  where deleted_at is null
  group by module, status;
create unique index uq_card_status_counts on card_status_counts (module, status);
-- refresh materialized view concurrently card_status_counts;
