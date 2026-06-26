/**
 * Utilidades de texto para búsqueda y anti-duplicados.
 * En Postgres esto lo hará `unaccent` + índice trigram (pg_trgm); aquí
 * reproducimos una versión ligera para el repositorio en memoria.
 */

/** Minúsculas, sin acentos, sin signos, espacios colapsados. */
export function normalizeText(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function trigrams(value: string): Set<string> {
  const padded = `  ${value} `;
  const grams = new Set<string>();
  for (let i = 0; i < padded.length - 2; i++) {
    grams.add(padded.slice(i, i + 3));
  }
  return grams;
}

/** Coeficiente de Dice sobre trigramas (0..1). Aproxima `similarity()` de pg_trgm. */
export function trigramSimilarity(a: string, b: string): number {
  const na = normalizeText(a);
  const nb = normalizeText(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  const ga = trigrams(na);
  const gb = trigrams(nb);
  let intersection = 0;
  for (const g of ga) if (gb.has(g)) intersection++;
  return (2 * intersection) / (ga.size + gb.size);
}
