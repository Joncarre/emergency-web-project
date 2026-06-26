/**
 * Token de capacidad ("edit token").
 *
 * Al crear una tarjeta se genera un token secreto que se entrega UNA SOLA VEZ
 * a quien la creó. Es lo único (además de moderación) que permite editar la
 * ficha o resolverla. En la BD solo se guarda el HASH del token, nunca el token.
 */
import { createHash, timingSafeEqual } from 'node:crypto';
import { nanoid } from 'nanoid';

const SECRET = import.meta.env.TOKEN_SIGNING_SECRET || 'dev-insecure-secret-change-me';

/** Token opaco, seguro para URL (`/personas/gestionar?token=…`). */
export function generateManageToken(): string {
  return nanoid(32);
}

export function hashToken(token: string): string {
  return createHash('sha256').update(`${SECRET}:${token}`).digest('hex');
}

/** Comparación en tiempo constante para evitar timing attacks. */
export function verifyToken(token: string, expectedHash: string): boolean {
  const actual = Buffer.from(hashToken(token), 'hex');
  const expected = Buffer.from(expectedHash, 'hex');
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}
