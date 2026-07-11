/**
 * Datos sintéticos para el modo demo (sin BD). Deterministas: el mismo arranque
 * produce las mismas fichas, útil para desarrollo y capturas. La prueba de carga
 * a gran escala (100k–200k) es otra cosa y vive en la Fase 6.
 */
import type {
  GoodCard,
  GoodDirection,
  GoodStatus,
  GoodType,
  MapReportCard,
  MapReportType,
  OfferCard,
  OfferCategory,
  OfferKind,
  OfferStatus,
  PersonCard,
  PersonStatus,
  PetCard,
  PetDirection,
  PetSpecies,
  PetStatus,
  ProtectedContact,
  StoredCard,
} from '@/lib/engine/types';
import { ALL_MAP_REPORT_TYPES, ALL_OFFER_CATEGORIES } from '@/lib/engine/types';
import { hashToken, generateManageToken } from '@/lib/engine/tokens';

const FIRST = ['María', 'Lucía', 'Carmen', 'Ana', 'Sofía', 'Marta', 'José', 'Antonio', 'Manuel', 'Carlos', 'David', 'Javier', 'Elena', 'Pablo', 'Rosa', 'Miguel', 'Laura', 'Andrés'];
const LAST = ['García', 'Rodríguez', 'González', 'Fernández', 'López', 'Martínez', 'Sánchez', 'Pérez', 'Gómez', 'Ruiz', 'Díaz', 'Torres', 'Vargas', 'Castro'];
const ZONES = ['Sector Norte', 'Casco Antiguo', 'Ribera del Río', 'Barrio Alto', 'Polígono Sur', 'La Marina', 'Cerro Verde', 'Valle Bajo'];
const NOTES = [
  'Llevaba chaqueta azul y mochila gris.',
  'Persona mayor, posible desorientación.',
  'Estatura media, pelo canoso, gafas.',
  'Menor de edad, camiseta roja.',
  'Necesita medicación para la tensión.',
  'Vista por última vez cerca del puente.',
];

// PRNG determinista (mulberry32) para reproducibilidad.
function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const STATUSES: PersonStatus[] = ['missing', 'missing', 'missing', 'possible_sighting', 'located'];

export function seedStoredPeople(count = 36): StoredCard<PersonCard>[] {
  const rand = rng(42);
  const out: StoredCard<PersonCard>[] = [];
  const now = Date.now();

  for (let i = 0; i < count; i++) {
    const pick = <T>(arr: T[]) => arr[Math.floor(rand() * arr.length)]!;
    const fullName = `${pick(FIRST)} ${pick(LAST)}`;
    const status = STATUSES[i % STATUSES.length]!;
    const direction = rand() > 0.78 ? 'found' : 'searching';
    const createdAt = new Date(now - Math.floor(rand() * 6 * 86_400_000)).toISOString();

    const card: PersonCard = {
      id: `seed-${(i + 1).toString().padStart(3, '0')}`,
      module: 'people',
      status,
      zone: pick(ZONES),
      geo: null,
      description: pick(NOTES),
      photoUrl: null,
      createdAt,
      updatedAt: createdAt,
      deletedAt: null,
      fullName: direction === 'found' ? `Sin identificar (≈${fullName.split(' ')[0]})` : fullName,
      ageApprox: 6 + Math.floor(rand() * 84),
      lastSeenAt: createdAt,
      medicalNotes: rand() > 0.6 ? pick(NOTES) : null,
      direction,
    };

    const contact: ProtectedContact = {
      method: rand() > 0.5 ? 'phone' : 'email',
      value: rand() > 0.5 ? '+34 600 000 000' : 'contacto@example.org',
    };

    out.push({ card, contact, manageTokenHash: hashToken(generateManageToken()) });
  }
  return out;
}

const GOOD_TYPES: GoodType[] = ['vehicle', 'machinery', 'other'];
const GOOD_STATUSES: GoodStatus[] = ['found', 'found', 'claimed', 'returned'];
const GOOD_NOTES = [
  'Arrastrado por la riada, con barro.',
  'Aparcado, sin daños visibles.',
  'Volcado junto al cauce.',
  'Recogido en el punto de reunión.',
];

export function seedStoredGoods(count = 18): StoredCard<GoodCard>[] {
  const rand = rng(99);
  const out: StoredCard<GoodCard>[] = [];
  const now = Date.now();

  for (let i = 0; i < count; i++) {
    const pick = <T>(arr: T[]) => arr[Math.floor(rand() * arr.length)]!;
    const goodType = pick(GOOD_TYPES);
    const status = GOOD_STATUSES[i % GOOD_STATUSES.length]!;
    const direction: GoodDirection = rand() > 0.5 ? 'found' : 'lost';
    const createdAt = new Date(now - Math.floor(rand() * 5 * 86_400_000)).toISOString();
    // Uno fijo y conocido para demostrar el emparejamiento por ID natural.
    const naturalId =
      i === 0
        ? '1234ABC'
        : goodType === 'vehicle'
          ? `${1000 + i * 7}${String.fromCharCode(66 + (i % 20))}${String.fromCharCode(67 + (i % 19))}${String.fromCharCode(68 + (i % 18))}`
          : `SN-${(100000 + i * 911).toString()}`;

    const card: GoodCard = {
      id: `good-${(i + 1).toString().padStart(3, '0')}`,
      module: 'goods',
      status,
      zone: pick(ZONES),
      geo: null,
      description: pick(GOOD_NOTES),
      photoUrl: null,
      createdAt,
      updatedAt: createdAt,
      deletedAt: null,
      goodType,
      naturalId,
      direction,
    };

    const contact: ProtectedContact = {
      method: rand() > 0.5 ? 'phone' : 'email',
      value: rand() > 0.5 ? '+34 600 222 333' : 'bienes@example.org',
    };

    out.push({ card, contact, manageTokenHash: hashToken(generateManageToken()) });
  }
  return out;
}

const OFFER_KINDS: OfferKind[] = ['offer', 'need'];
const OFFER_STATUSES: OfferStatus[] = ['active', 'active', 'active', 'fulfilled', 'expired'];
const OFFER_QTY = ['', '10 uds.', '2 plazas', '50 L', 'según necesidad', '3 cajas'];
const OFFER_NOTES = [
  'Disponible toda la semana.',
  'Recogida en el punto de reparto.',
  'Familia con dos niños pequeños.',
  'Puedo desplazarme con furgoneta.',
  'Urgente, para esta noche.',
];

export function seedStoredOffers(count = 22): StoredCard<OfferCard>[] {
  const rand = rng(123);
  const out: StoredCard<OfferCard>[] = [];
  const now = Date.now();

  for (let i = 0; i < count; i++) {
    const pick = <T>(arr: T[]) => arr[Math.floor(rand() * arr.length)]!;
    // Alternar cara para garantizar pares oferta/necesidad emparejables.
    const kind: OfferKind = OFFER_KINDS[i % 2]!;
    const category: OfferCategory = ALL_OFFER_CATEGORIES[i % ALL_OFFER_CATEGORIES.length]!;
    const status = OFFER_STATUSES[i % OFFER_STATUSES.length]!;
    const createdAt = new Date(now - Math.floor(rand() * 4 * 86_400_000)).toISOString();
    const expiresAt = rand() > 0.6 ? new Date(now + (1 + Math.floor(rand() * 5)) * 86_400_000).toISOString() : null;
    const qty = pick(OFFER_QTY);

    const card: OfferCard = {
      id: `offer-${(i + 1).toString().padStart(3, '0')}`,
      module: 'offers',
      status,
      zone: pick(ZONES),
      geo: null,
      description: pick(OFFER_NOTES),
      photoUrl: null,
      createdAt,
      updatedAt: createdAt,
      deletedAt: null,
      kind,
      category,
      quantity: qty || null,
      expiresAt,
    };

    const contact: ProtectedContact = {
      method: rand() > 0.5 ? 'phone' : 'email',
      value: rand() > 0.5 ? '+34 600 333 444' : 'ayuda@example.org',
    };

    out.push({ card, contact, manageTokenHash: hashToken(generateManageToken()) });
  }
  return out;
}

/** Centro de la ciudad demo (València) — el mapa arranca centrado aquí. */
export const DEMO_MAP_CENTER = { lat: 39.4699, lng: -0.3763 };

const MAP_NOTES: Record<MapReportType, string[]> = {
  damage: ['Calle cortada por barro.', 'Cables caídos en la acera.', 'Puente inaccesible.', 'Bajos inundados.'],
  service: ['Farmacia abierta.', 'Gasolinera operativa.', 'Zona con cobertura y luz.', 'Cajero funcionando.'],
  help_point: ['Punto de reparto de agua.', 'Refugio habilitado en el polideportivo.', 'Puesto médico avanzado.'],
  safe: ['Familia localizada, todos bien.', 'A salvo en casa de familiares.'],
};

export function seedStoredMapReports(count = 32): StoredCard<MapReportCard>[] {
  const rand = rng(2024);
  const out: StoredCard<MapReportCard>[] = [];
  const now = Date.now();

  for (let i = 0; i < count; i++) {
    const pick = <T>(arr: T[]) => arr[Math.floor(rand() * arr.length)]!;
    const reportType = ALL_MAP_REPORT_TYPES[i % ALL_MAP_REPORT_TYPES.length]!;
    const createdAt = new Date(now - Math.floor(rand() * 2 * 86_400_000)).toISOString();
    // ~1 de cada 8 caducado, para probar el filtrado de obsoletos.
    const expired = i % 8 === 7;
    const expiresAt = expired
      ? new Date(now - 3_600_000).toISOString()
      : new Date(now + (12 + Math.floor(rand() * 60)) * 3_600_000).toISOString();

    const card: MapReportCard = {
      id: `map-${(i + 1).toString().padStart(3, '0')}`,
      module: 'map',
      status: 'active',
      zone: pick(ZONES),
      geo: {
        lat: DEMO_MAP_CENTER.lat + (rand() - 0.5) * 0.08,
        lng: DEMO_MAP_CENTER.lng + (rand() - 0.5) * 0.10,
      },
      description: pick(MAP_NOTES[reportType]),
      photoUrl: null,
      createdAt,
      updatedAt: createdAt,
      deletedAt: null,
      reportType,
      expiresAt,
    };

    out.push({ card, contact: null, manageTokenHash: hashToken(generateManageToken()) });
  }
  return out;
}

const PET_SPECIES: PetSpecies[] = ['dog', 'cat', 'other'];
const PET_NAMES = ['Toby', 'Luna', 'Max', 'Nala', 'Rocky', 'Kira', 'Coco', 'Bruno', 'Mía', 'Thor', 'Lola', 'Simba'];
const BREEDS_DOG = ['Mestizo', 'Labrador', 'Pastor alemán', 'Galgo', 'Bodeguero', 'Border collie'];
const BREEDS_CAT = ['Común europeo', 'Siamés', 'Atigrado', 'Persa'];
const PET_NOTES = [
  'Collar rojo, muy asustado.',
  'Sin collar, responde a su nombre.',
  'Cojea de una pata trasera.',
  'Microchip puesto en la clínica del barrio.',
  'Visto cerca del parque inundado.',
];
const PET_STATUSES: PetStatus[] = ['lost', 'lost', 'found', 'found', 'reunited'];

export function seedStoredPets(count = 24): StoredCard<PetCard>[] {
  const rand = rng(7);
  const out: StoredCard<PetCard>[] = [];
  const now = Date.now();

  for (let i = 0; i < count; i++) {
    const pick = <T>(arr: T[]) => arr[Math.floor(rand() * arr.length)]!;
    const species = pick(PET_SPECIES);
    const status = PET_STATUSES[i % PET_STATUSES.length]!;
    const direction: PetDirection = status === 'found' ? 'found' : status === 'reunited' ? (rand() > 0.5 ? 'lost' : 'found') : 'lost';
    const createdAt = new Date(now - Math.floor(rand() * 5 * 86_400_000)).toISOString();
    // ~40% con chip; uno fijo y conocido para demostrar el emparejamiento.
    const hasChip = rand() > 0.6;
    const chipId = i === 0 ? '985112003456789' : hasChip ? `9851120${(10000000 + i * 137).toString()}` : null;

    const card: PetCard = {
      id: `pet-${(i + 1).toString().padStart(3, '0')}`,
      module: 'pets',
      status,
      zone: pick(ZONES),
      geo: null,
      description: pick(PET_NOTES),
      photoUrl: null,
      createdAt,
      updatedAt: createdAt,
      deletedAt: null,
      species,
      name: rand() > 0.2 ? pick(PET_NAMES) : null,
      chipId,
      breed: species === 'dog' ? pick(BREEDS_DOG) : species === 'cat' ? pick(BREEDS_CAT) : null,
      direction,
    };

    const contact: ProtectedContact = {
      method: rand() > 0.5 ? 'phone' : 'email',
      value: rand() > 0.5 ? '+34 600 111 222' : 'mascotas@example.org',
    };

    out.push({ card, contact, manageTokenHash: hashToken(generateManageToken()) });
  }
  return out;
}
