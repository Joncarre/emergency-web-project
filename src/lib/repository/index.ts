/**
 * Punto único de acceso al repositorio. Selecciona la implementación según el
 * entorno: en memoria (demo) si no hay `DATABASE_URL`; Postgres en Fase 2.
 *
 * El resto de la app SIEMPRE importa `getRepository()` y nunca una impl. concreta.
 */
import type { Repository } from './types';
import { memoryRepository } from './memory';
import { isDemoMode } from '@/config/deployment';

let instance: Repository | null = null;

export function getRepository(): Repository {
  if (instance) return instance;
  if (isDemoMode) {
    instance = memoryRepository;
  } else {
    // Fase 2: const { postgresRepository } = await import('./postgres');
    // Mientras no exista la impl. Postgres, caemos a memoria de forma segura.
    instance = memoryRepository;
  }
  return instance;
}

export type { Repository } from './types';
