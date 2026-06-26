/**
 * Datos sintéticos para el modo demo (sin BD). Deterministas: el mismo arranque
 * produce las mismas fichas, útil para desarrollo y capturas. La prueba de carga
 * a gran escala (100k–200k) es otra cosa y vive en la Fase 6.
 */
import type { PersonCard, PersonStatus, ProtectedContact, StoredCard } from '@/lib/engine/types';
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
