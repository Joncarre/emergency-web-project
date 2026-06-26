/**
 * Identidad de cliente para rate-limiting y audit log.
 * NUNCA se guarda la IP en claro: solo un hash (privacidad / RGPD).
 */
import { createHash } from 'node:crypto';

const SALT = import.meta.env.TOKEN_SIGNING_SECRET || 'dev-salt-change-me';

export function getClientIp(request: Request): string {
  const xff = request.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0]!.trim();
  return request.headers.get('x-real-ip') || 'unknown';
}

export function hashIp(ip: string): string {
  return createHash('sha256').update(`${SALT}:${ip}`).digest('hex').slice(0, 32);
}
