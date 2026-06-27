/**
 * Punto único de acceso al repositorio. Selecciona la implementación según el
 * entorno: Postgres si hay `DATABASE_URL`; en memoria (demo) si no.
 *
 * El resto de la app SIEMPRE importa `getRepository()` y nunca una impl. concreta,
 * así que cambiar de memoria a Postgres no toca páginas ni lógica de negocio.
 */
import type { Repository } from './types';
import { memoryRepository } from './memory';
import { postgresRepository } from './postgres';
import { isDemoMode } from '@/config/deployment';

let instance: Repository | null = null;

export function getRepository(): Repository {
  if (!instance) {
    instance = isDemoMode ? memoryRepository : postgresRepository;
  }
  return instance;
}

export type { Repository } from './types';
