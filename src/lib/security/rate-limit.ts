/**
 * Rate limiter en memoria (ventana deslizante). Suficiente para una instancia
 * y para frenar abuso básico en creación y cambios de estado. En despliegue
 * multi-instancia se sustituye por uno respaldado por Redis/Durable Objects.
 */
const g = globalThis as unknown as { __rrRate?: Map<string, number[]> };
const buckets: Map<string, number[]> = (g.__rrRate ??= new Map());

export interface RateResult {
  ok: boolean;
  retryAfterSec: number;
}

export function rateLimit(key: string, max: number, windowMs: number): RateResult {
  const now = Date.now();
  const hits = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);

  if (hits.length >= max) {
    const oldest = hits[0]!;
    return { ok: false, retryAfterSec: Math.ceil((windowMs - (now - oldest)) / 1000) };
  }

  hits.push(now);
  buckets.set(key, hits);
  return { ok: true, retryAfterSec: 0 };
}
