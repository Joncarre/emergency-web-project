/**
 * Configuración por despliegue (feature flags).
 *
 * El valor del proyecto está en desplegar en minutos cambiando CONFIGURACIÓN,
 * no código. Todo lo de aquí sale de variables `PUBLIC_*` (ver `.env.example`)
 * con defaults sensatos para que la plantilla arranque sin configurar nada.
 */
import type { ModuleId } from '@/lib/engine/types';
import { ALL_MODULE_IDS } from '@/lib/engine/types';

const DEFAULT_LOCALES = ['es', 'en'] as const;

function parseModules(raw: string | undefined): ModuleId[] {
  if (!raw) return [...ALL_MODULE_IDS];
  const requested = raw
    .split(',')
    .map((m) => m.trim().toLowerCase())
    .filter(Boolean);
  // Conservar el orden canónico y descartar ids desconocidos.
  return ALL_MODULE_IDS.filter((id) => requested.includes(id));
}

export interface DeploymentConfig {
  /** Nombre del evento/catástrofe mostrado en la interfaz. */
  eventName: string;
  /** Idioma por defecto cuando no hay preferencia del usuario. */
  defaultLocale: Lang;
  /** Módulos activos para este despliegue, en orden de presentación. */
  enabledModules: ModuleId[];
  /** Zona/ciudad por defecto sugerida en formularios. */
  defaultZone: string;
}

function resolveLocale(raw: string | undefined): Lang {
  return (DEFAULT_LOCALES as readonly string[]).includes(raw ?? '')
    ? (raw as Lang)
    : 'es';
}

export const deployment: DeploymentConfig = {
  eventName: import.meta.env.PUBLIC_EVENT_NAME?.trim() || 'Respuesta de Emergencia',
  defaultLocale: resolveLocale(import.meta.env.PUBLIC_DEFAULT_LOCALE),
  enabledModules: parseModules(import.meta.env.PUBLIC_ENABLED_MODULES),
  defaultZone: import.meta.env.PUBLIC_DEFAULT_ZONE?.trim() || '',
};

export function isModuleEnabled(id: ModuleId): boolean {
  return deployment.enabledModules.includes(id);
}

/** ¿Estamos en modo demo (sin base de datos configurada)? */
export const isDemoMode = !import.meta.env.DATABASE_URL;
