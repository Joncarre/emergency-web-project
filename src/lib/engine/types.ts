/**
 * Motor común — tipos compartidos.
 *
 * Idea central del proyecto: casi todos los módulos son el MISMO patrón
 * (tarjeta + máquina de estados + emparejamiento). Aquí viven los tipos que
 * comparten todos; cada módulo añade los suyos como especialización.
 */

export const ALL_MODULE_IDS = ['people', 'pets', 'goods', 'offers', 'map'] as const;
export type ModuleId = (typeof ALL_MODULE_IDS)[number];

export type GeoPoint = { lat: number; lng: number };

/** Quién intenta una acción/transición. Determina qué está permitido. */
export type Actor = 'owner' | 'moderator' | 'public';

/** Contacto protegido. NUNCA se serializa en respuestas de listado público. */
export interface ProtectedContact {
  method: 'phone' | 'email' | 'other';
  value: string;
}

/** Campos comunes a toda tarjeta gestionada por el motor. */
export interface CardBase {
  id: string;
  module: ModuleId;
  status: string;
  zone: string | null;
  geo: GeoPoint | null;
  description: string | null;
  photoUrl: string | null;
  /** ISO 8601 */
  createdAt: string;
  /** ISO 8601 */
  updatedAt: string;
  /** soft-delete: nunca borramos físicamente (reversible por moderación). */
  deletedAt: string | null;
}

/* ---------------------------------------------------------------------------
   Módulo Personas (especialización de referencia)
   --------------------------------------------------------------------------- */

export type PersonDirection = 'searching' | 'found';
export type PersonStatus = 'missing' | 'possible_sighting' | 'located';

export interface PersonCard extends CardBase {
  module: 'people';
  status: PersonStatus;
  fullName: string;
  /** Edad aproximada en años (o null si solo se conoce un rango textual). */
  ageApprox: number | null;
  /** Última vez con contacto (ISO) o null. */
  lastSeenAt: string | null;
  medicalNotes: string | null;
  direction: PersonDirection;
}

/* ---------------------------------------------------------------------------
   Módulo Mascotas (especialización: emparejamiento por chip / ID natural)
   --------------------------------------------------------------------------- */

export type PetDirection = 'lost' | 'found';
export type PetStatus = 'lost' | 'found' | 'reunited';
export type PetSpecies = 'dog' | 'cat' | 'other';

export interface PetCard extends CardBase {
  module: 'pets';
  status: PetStatus;
  species: PetSpecies;
  name: string | null;
  /** Nº de chip — ID natural ÚNICO cuando se aporta (dispara emparejamiento). */
  chipId: string | null;
  breed: string | null;
  direction: PetDirection;
}

/* ---------------------------------------------------------------------------
   Módulo Bienes (especialización: ID natural ESTRICTAMENTE único)
   --------------------------------------------------------------------------- */

export type GoodDirection = 'found' | 'lost';
export type GoodStatus = 'found' | 'claimed' | 'returned';
export type GoodType = 'vehicle' | 'machinery' | 'other';

export interface GoodCard extends CardBase {
  module: 'goods';
  status: GoodStatus;
  goodType: GoodType;
  /** Matrícula / nº de serie — ID natural ÚNICO y obligatorio. */
  naturalId: string;
  direction: GoodDirection;
}

/**
 * Unión de todas las tarjetas conocidas por el motor. Cada módulo nuevo se
 * incorpora aquí sin tocar el núcleo (listado, filtros, tokens, soft-delete,
 * máquina de estados y audit son genéricos).
 */
export type AnyCard = PersonCard | PetCard | GoodCard;

/** Registro interno persistido: tarjeta + datos sensibles fuera del payload. */
export interface StoredCard<T extends CardBase = AnyCard> {
  card: T;
  contact: ProtectedContact | null;
  manageTokenHash: string;
}
