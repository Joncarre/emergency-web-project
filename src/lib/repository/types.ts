/**
 * Contrato del repositorio (patrón Repository). El motor y la API dependen de
 * esta interfaz, no de una BD concreta. Hoy: implementación en memoria (demo).
 * Fase 2: implementación Postgres (+ PostGIS) detrás de la MISMA interfaz.
 */
import type {
  Actor,
  GeoPoint,
  PersonCard,
  PersonDirection,
  ProtectedContact,
} from '@/lib/engine/types';

export interface CursorPage<T> {
  items: T[];
  /** Cursor opaco para la siguiente página, o null si no hay más. */
  nextCursor: string | null;
}

export type StatusCounts = Record<string, number>;

export interface ListPeopleParams {
  status?: string;
  zone?: string;
  direction?: PersonDirection;
  /** Búsqueda de texto (nombre/zona) — siempre server-side. */
  q?: string;
  cursor?: string | null;
  limit?: number;
}

export interface CreatePersonInput {
  fullName: string;
  ageApprox: number | null;
  lastSeenAt: string | null;
  medicalNotes: string | null;
  direction: PersonDirection;
  zone: string | null;
  geo: GeoPoint | null;
  description: string | null;
  photoUrl: string | null;
  contact: ProtectedContact | null;
}

export interface CreatePersonResult {
  card: PersonCard;
  /** Token de gestión en claro — se entrega UNA SOLA VEZ. */
  manageToken: string;
}

export interface AddSightingInput {
  note: string | null;
  zone: string | null;
  contact: ProtectedContact | null;
  /** IP hasheada para el audit log (trazabilidad sin exponer PII). */
  ipHash: string | null;
}

export interface Sighting {
  id: string;
  cardId: string;
  note: string | null;
  zone: string | null;
  createdAt: string;
}

export interface SimilarMatch {
  card: PersonCard;
  score: number;
}

/** Contexto de quién actúa: token de gestión y/o clave de moderación. */
export interface ActorContext {
  manageToken?: string | null;
  isModerator?: boolean;
  ipHash?: string | null;
}

export interface Repository {
  // --- Personas (módulo de referencia) ---
  listPeople(params: ListPeopleParams): Promise<CursorPage<PersonCard>>;
  countPeopleByStatus(
    filters: Pick<ListPeopleParams, 'zone' | 'direction' | 'q'>,
  ): Promise<StatusCounts>;
  getPerson(id: string): Promise<PersonCard | null>;
  createPerson(input: CreatePersonInput, ipHash: string | null): Promise<CreatePersonResult>;
  /** Anti-duplicados: tarjetas parecidas en tiempo real (similitud trigram). */
  findSimilarPeople(
    input: Pick<CreatePersonInput, 'fullName' | 'zone' | 'ageApprox'>,
    limit?: number,
  ): Promise<SimilarMatch[]>;
  /** Transición de estado validada contra la máquina del módulo y el actor. */
  transitionPerson(id: string, to: string, ctx: ActorContext): Promise<PersonCard>;
  /** Avistamiento: cualquiera puede aportar una pista (no resuelve la ficha). */
  addSighting(id: string, input: AddSightingInput): Promise<{ card: PersonCard; sighting: Sighting }>;
  listSightings(id: string): Promise<Sighting[]>;
  /** Resuelve el actor a partir del token/clave (owner | moderator | public). */
  resolveActor(id: string, ctx: ActorContext): Promise<Actor>;
  /** Contacto protegido — solo tras acción explícita (relé/anti-abuso). */
  revealContact(id: string): Promise<ProtectedContact | null>;
}
