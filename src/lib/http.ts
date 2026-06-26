/** Helpers de respuesta HTTP para los endpoints de la API. */

export function json(data: unknown, status = 200, headers?: HeadersInit): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...headers },
  });
}

export function jsonError(status: number, code: string, message?: string): Response {
  return json({ ok: false, error: { code, message: message ?? code } }, status);
}

export function tooManyRequests(retryAfterSec: number): Response {
  return json({ ok: false, error: { code: 'rate_limited' } }, 429, {
    'retry-after': String(retryAfterSec),
  });
}

export function redirect(location: string, status: 302 | 303 = 303): Response {
  return new Response(null, { status, headers: { location } });
}
