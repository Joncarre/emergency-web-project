/**
 * Repositorio en memoria (modo demo): ensambla los repos por módulo, cada uno
 * una capa fina sobre el mismo CardStore genérico. Esta es la prueba de la
 * tesis del proyecto: añadir un módulo es añadir ~un archivo, no reescribir el
 * motor. La impl. Postgres (Fase 2) reemplazará esto tras la misma interfaz.
 */
import type { Repository } from './types';
import { peopleRepo } from './people-repo';
import { petsRepo } from './pets-repo';

export const memoryRepository: Repository = { ...peopleRepo, ...petsRepo };
