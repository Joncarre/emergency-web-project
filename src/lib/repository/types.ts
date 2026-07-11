/**
 * Contrato del repositorio (patrón Repository). El motor y la API dependen de
 * esta interfaz, no de una BD concreta. Hoy: implementación en memoria sobre un
 * núcleo genérico (card-store.ts). Fase 2: Postgres tras la MISMA interfaz.
 */
import type {
  Actor,
  GeoPoint,
  GoodCard,
  GoodDirection,
  GoodType,
  MapReportCard,
  MapReportType,
  OfferCard,
  OfferCategory,
  OfferKind,
  PersonCard,
  PersonDirection,
  PetCard,
  PetDirection,
  PetSpecies,
  ProtectedContact,
} from '@/lib/engine/types';

/* --- Tipos genéricos compartidos por todos los módulos --- */

export interface CursorPage<T> {
  items: T[];
  /** Cursor opaco para la siguiente página, o null si no hay más. */
  nextCursor: string | null;
}

export type StatusCounts = Record<string, number>;

export interface Sighting {
  id: string;
  cardId: string;
  note: string | null;
  zone: string | null;
  createdAt: string;
}

/** Contexto de quién actúa: token de gestión y/o clave de moderación. */
export interface ActorContext {
  manageToken?: string | null;
  isModerator?: boolean;
  ipHash?: string | null;
}

/* --- Personas --- */

export interface ListPeopleParams {
  status?: string;
  zone?: string;
  direction?: PersonDirection;
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
  manageToken: string;
}

export interface PersonSimilarMatch {
  card: PersonCard;
  score: number;
}

export interface AddSightingInput {
  note: string | null;
  zone: string | null;
  contact: ProtectedContact | null;
  ipHash: string | null;
}

/* --- Mascotas --- */

export interface ListPetsParams {
  status?: string;
  zone?: string;
  direction?: PetDirection;
  species?: PetSpecies;
  q?: string;
  cursor?: string | null;
  limit?: number;
}

export interface CreatePetInput {
  species: PetSpecies;
  name: string | null;
  chipId: string | null;
  breed: string | null;
  direction: PetDirection;
  zone: string | null;
  geo: GeoPoint | null;
  description: string | null;
  photoUrl: string | null;
  contact: ProtectedContact | null;
}

/**
 * Resultado del alta de mascota. Si el chip ya existe (UNIQUE), no se duplica:
 * se devuelve `matched` con la tarjeta existente (emparejamiento perdido↔encontrado).
 */
export interface CreatePetResult {
  created?: { card: PetCard; manageToken: string };
  matched?: PetCard;
}

export interface PetSimilarMatch {
  card: PetCard;
  score: number;
  reason: 'chip' | 'similar';
}

/** Entrada para sugerencias de mascotas (todo opcional: el formulario va llenándose). */
export interface SimilarPetsInput {
  name: string | null;
  breed: string | null;
  species: PetSpecies | null;
  zone: string | null;
  chipId: string | null;
}

/* --- Bienes --- */

export interface ListGoodsParams {
  status?: string;
  zone?: string;
  direction?: GoodDirection;
  goodType?: GoodType;
  q?: string;
  cursor?: string | null;
  limit?: number;
}

export interface CreateGoodInput {
  goodType: GoodType;
  naturalId: string;
  direction: GoodDirection;
  zone: string | null;
  geo: GeoPoint | null;
  description: string | null;
  photoUrl: string | null;
  contact: ProtectedContact | null;
}

/** Si el ID natural ya existe (UNIQUE), no se duplica: se devuelve `matched`. */
export interface CreateGoodResult {
  created?: { card: GoodCard; manageToken: string };
  matched?: GoodCard;
}

export interface GoodSimilarMatch {
  card: GoodCard;
  score: number;
  reason: 'natural_id' | 'similar';
}

export interface SimilarGoodsInput {
  naturalId: string | null;
  goodType: GoodType | null;
  zone: string | null;
}

/* --- Ofertas / Necesidades --- */

export interface ListOffersParams {
  status?: string;
  zone?: string;
  kind?: OfferKind;
  category?: OfferCategory;
  q?: string;
  cursor?: string | null;
  limit?: number;
}

export interface CreateOfferInput {
  kind: OfferKind;
  category: OfferCategory;
  quantity: string | null;
  expiresAt: string | null;
  zone: string | null;
  geo: GeoPoint | null;
  description: string | null;
  photoUrl: string | null;
  contact: ProtectedContact | null;
}

export interface CreateOfferResult {
  card: OfferCard;
  manageToken: string;
}

/** Entrada para sugerir emparejamientos (la cara opuesta: oferta↔necesidad). */
export interface MatchOffersInput {
  kind: OfferKind;
  category: OfferCategory;
  zone: string | null;
  excludeId?: string | null;
}

export interface OfferMatch {
  card: OfferCard;
  score: number;
}

/* --- Mapa de estado/peligro --- */

/** Bounding box del viewport: oeste/sur/este/norte (lng, lat, lng, lat). */
export interface BBox {
  west: number;
  south: number;
  east: number;
  north: number;
}

export interface ListMapReportsParams {
  /** Solo los puntos dentro del viewport — NUNCA todos a la vez. */
  bbox?: BBox;
  reportType?: MapReportType;
  includeExpired?: boolean;
  limit?: number;
}

export interface ListMapReportsResult {
  items: MapReportCard[];
  /** Conteo por tipo dentro del bbox (antes del filtro de tipo). */
  counts: Record<string, number>;
}

export interface CreateMapReportInput {
  reportType: MapReportType;
  geo: GeoPoint;
  zone: string | null;
  description: string | null;
  /** Caducidad en horas desde ahora (null = sin caducidad). */
  ttlHours: number | null;
}

export interface CreateMapReportResult {
  card: MapReportCard;
  manageToken: string;
}

/* --- Interfaz del repositorio --- */

export interface Repository {
  // Personas
  listPeople(params: ListPeopleParams): Promise<CursorPage<PersonCard>>;
  countPeopleByStatus(filters: Pick<ListPeopleParams, 'zone' | 'direction' | 'q'>): Promise<StatusCounts>;
  getPerson(id: string): Promise<PersonCard | null>;
  createPerson(input: CreatePersonInput, ipHash: string | null): Promise<CreatePersonResult>;
  findSimilarPeople(
    input: Pick<CreatePersonInput, 'fullName' | 'zone' | 'ageApprox'>,
    limit?: number,
  ): Promise<PersonSimilarMatch[]>;
  transitionPerson(id: string, to: string, ctx: ActorContext): Promise<PersonCard>;
  addSighting(id: string, input: AddSightingInput): Promise<{ card: PersonCard; sighting: Sighting }>;
  listSightings(id: string): Promise<Sighting[]>;
  resolveActor(id: string, ctx: ActorContext): Promise<Actor>;
  revealContact(id: string): Promise<ProtectedContact | null>;

  // Mascotas
  listPets(params: ListPetsParams): Promise<CursorPage<PetCard>>;
  countPetsByStatus(filters: Pick<ListPetsParams, 'zone' | 'direction' | 'species' | 'q'>): Promise<StatusCounts>;
  getPet(id: string): Promise<PetCard | null>;
  createPet(input: CreatePetInput, ipHash: string | null): Promise<CreatePetResult>;
  findSimilarPets(input: SimilarPetsInput, limit?: number): Promise<PetSimilarMatch[]>;
  transitionPet(id: string, to: string, ctx: ActorContext): Promise<PetCard>;
  resolveActorPet(id: string, ctx: ActorContext): Promise<Actor>;
  revealPetContact(id: string): Promise<ProtectedContact | null>;

  // Bienes
  listGoods(params: ListGoodsParams): Promise<CursorPage<GoodCard>>;
  countGoodsByStatus(filters: Pick<ListGoodsParams, 'zone' | 'direction' | 'goodType' | 'q'>): Promise<StatusCounts>;
  getGood(id: string): Promise<GoodCard | null>;
  createGood(input: CreateGoodInput, ipHash: string | null): Promise<CreateGoodResult>;
  findSimilarGoods(input: SimilarGoodsInput, limit?: number): Promise<GoodSimilarMatch[]>;
  transitionGood(id: string, to: string, ctx: ActorContext): Promise<GoodCard>;
  resolveActorGood(id: string, ctx: ActorContext): Promise<Actor>;
  revealGoodContact(id: string): Promise<ProtectedContact | null>;

  // Ofertas / Necesidades
  listOffers(params: ListOffersParams): Promise<CursorPage<OfferCard>>;
  countOffersByStatus(filters: Pick<ListOffersParams, 'zone' | 'kind' | 'category' | 'q'>): Promise<StatusCounts>;
  getOffer(id: string): Promise<OfferCard | null>;
  createOffer(input: CreateOfferInput, ipHash: string | null): Promise<CreateOfferResult>;
  findMatchingOffers(input: MatchOffersInput, limit?: number): Promise<OfferMatch[]>;
  transitionOffer(id: string, to: string, ctx: ActorContext): Promise<OfferCard>;
  resolveActorOffer(id: string, ctx: ActorContext): Promise<Actor>;
  revealOfferContact(id: string): Promise<ProtectedContact | null>;

  // Mapa de estado/peligro
  listMapReports(params: ListMapReportsParams): Promise<ListMapReportsResult>;
  getMapReport(id: string): Promise<MapReportCard | null>;
  createMapReport(input: CreateMapReportInput, ipHash: string | null): Promise<CreateMapReportResult>;
  transitionMapReport(id: string, to: string, ctx: ActorContext): Promise<MapReportCard>;
  resolveActorMapReport(id: string, ctx: ActorContext): Promise<Actor>;
}
