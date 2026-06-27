/**
 * Registro de módulos: cada módulo declara sus estados y su máquina de
 * transiciones de forma DECLARATIVA. El motor (state-machine.ts), el UI
 * (StateBadge) y la API leen de aquí — una sola fuente de verdad por módulo.
 */
import type { Actor, ModuleId } from './types';

/** Tono visual del beacon de estado (color SIEMPRE semántico). */
export type StatusTone = 'danger' | 'warning' | 'success' | 'info' | 'neutral';

export interface StatusDef {
  id: string;
  tone: StatusTone;
  /** Estado "abierto/activo": el beacon pulsa (atrae la atención). */
  active: boolean;
}

export interface TransitionDef {
  from: string;
  to: string;
  /** Roles autorizados a ejecutar esta transición. */
  by: Actor[];
  /** Clave i18n de la etiqueta de la acción. */
  actionKey: string;
}

export interface ModuleDef {
  id: ModuleId;
  labelKey: string;
  /** id de icono (ver components/Icon.astro). */
  icon: string;
  statuses: StatusDef[];
  /** Estado inicial al crear, según la "dirección" de la tarjeta. */
  initialStatus: string;
  transitions: TransitionDef[];
  /** ¿Tiene páginas/endpoints en este build? */
  implemented: boolean;
}

/* ---------------------------------------------------------------------------
   Personas — módulo de referencia, totalmente implementado.
   --------------------------------------------------------------------------- */
const people: ModuleDef = {
  id: 'people',
  labelKey: 'module.people',
  icon: 'person',
  initialStatus: 'missing',
  statuses: [
    { id: 'missing', tone: 'danger', active: true },
    { id: 'possible_sighting', tone: 'warning', active: true },
    { id: 'located', tone: 'success', active: false },
  ],
  transitions: [
    // Cualquiera puede aportar una pista (avistamiento) -> estado intermedio.
    {
      from: 'missing',
      to: 'possible_sighting',
      by: ['public', 'owner', 'moderator'],
      actionKey: 'people.action.report_sighting',
    },
    // Solo quien creó la ficha (con token) o moderación puede RESOLVER.
    {
      from: 'possible_sighting',
      to: 'located',
      by: ['owner', 'moderator'],
      actionKey: 'people.action.confirm_located',
    },
    {
      from: 'missing',
      to: 'located',
      by: ['owner', 'moderator'],
      actionKey: 'people.action.mark_located',
    },
    // Descartar una pista no confirmada (vuelve a desaparecida).
    {
      from: 'possible_sighting',
      to: 'missing',
      by: ['owner', 'moderator'],
      actionKey: 'people.action.dismiss_sighting',
    },
    // Reabrir si fue un error.
    {
      from: 'located',
      to: 'missing',
      by: ['owner', 'moderator'],
      actionKey: 'people.action.reopen',
    },
  ],
  implemented: true,
};

/* ---------------------------------------------------------------------------
   Resto de módulos — declarados para que aparezcan en la home y compartan el
   motor; sus páginas/endpoints llegan en la Fase 4 (implemented: false).
   --------------------------------------------------------------------------- */
const pets: ModuleDef = {
  id: 'pets',
  labelKey: 'module.pets',
  icon: 'paw',
  // El estado inicial coincide con la dirección (lost/found); lo fija el repo.
  initialStatus: 'lost',
  statuses: [
    { id: 'lost', tone: 'danger', active: true },
    { id: 'found', tone: 'warning', active: true },
    { id: 'reunited', tone: 'success', active: false },
  ],
  transitions: [
    { from: 'lost', to: 'reunited', by: ['owner', 'moderator'], actionKey: 'pets.action.mark_reunited' },
    { from: 'found', to: 'reunited', by: ['owner', 'moderator'], actionKey: 'pets.action.mark_reunited' },
    { from: 'reunited', to: 'lost', by: ['owner', 'moderator'], actionKey: 'pets.action.reopen_lost' },
    { from: 'reunited', to: 'found', by: ['owner', 'moderator'], actionKey: 'pets.action.reopen_found' },
  ],
  implemented: true,
};

const goods: ModuleDef = {
  id: 'goods',
  labelKey: 'module.goods',
  icon: 'box',
  initialStatus: 'found',
  statuses: [
    { id: 'found', tone: 'info', active: true },
    { id: 'claimed', tone: 'warning', active: true },
    { id: 'returned', tone: 'success', active: false },
  ],
  transitions: [],
  implemented: false,
};

const offers: ModuleDef = {
  id: 'offers',
  labelKey: 'module.offers',
  icon: 'hands',
  initialStatus: 'active',
  statuses: [
    { id: 'active', tone: 'info', active: true },
    { id: 'fulfilled', tone: 'success', active: false },
    { id: 'expired', tone: 'neutral', active: false },
  ],
  transitions: [],
  implemented: false,
};

const map: ModuleDef = {
  id: 'map',
  labelKey: 'module.map',
  icon: 'map',
  initialStatus: 'active',
  statuses: [
    { id: 'active', tone: 'info', active: true },
    { id: 'expired', tone: 'neutral', active: false },
  ],
  transitions: [],
  implemented: false,
};

export const MODULES: Record<ModuleId, ModuleDef> = { people, pets, goods, offers, map };

export function getModule(id: ModuleId): ModuleDef {
  return MODULES[id];
}

export function getStatusDef(id: ModuleId, statusId: string): StatusDef | undefined {
  return MODULES[id].statuses.find((s) => s.id === statusId);
}
