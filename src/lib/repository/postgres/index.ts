/**
 * Repositorio Postgres: ensambla los repos por módulo, cada uno una capa fina
 * sobre el mismo PgCardStore. Implementa la MISMA interfaz Repository que la
 * versión en memoria; se selecciona en repository/index.ts cuando hay DATABASE_URL.
 */
import type { Repository } from '../types';
import { peoplePgRepo } from './people-pg';
import { petsPgRepo } from './pets-pg';
import { goodsPgRepo } from './goods-pg';
import { offersPgRepo } from './offers-pg';
import { mapPgRepo } from './map-pg';

export const postgresRepository: Repository = {
  ...peoplePgRepo,
  ...petsPgRepo,
  ...goodsPgRepo,
  ...offersPgRepo,
  ...mapPgRepo,
};
