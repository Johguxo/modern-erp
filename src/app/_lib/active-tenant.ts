// Cookie firmada de empresa activa (ADR-002 §6, ADR-006). Valor `v1.<tenantId>.<firma>`, con la
// firma HMAC-SHA256(SESSION_SECRET) atada al usuario de Auth: otra cuenta del mismo navegador no
// puede reutilizarla y una cookie manipulada se descarta sin tocar la base. La membresía se valida
// igual en cada request.
import { createHmac, timingSafeEqual } from 'node:crypto';

export const ACTIVE_TENANT_COOKIE = 'active_tenant';
const VERSION = 'v1';
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function signature(secret: string, authUserId: string, tenantId: string): string {
  return createHmac('sha256', secret)
    .update(`active_tenant:${VERSION}:${authUserId}:${tenantId}`)
    .digest('base64url');
}

export function signActiveTenant(secret: string, authUserId: string, tenantId: string): string {
  return `${VERSION}.${tenantId}.${signature(secret, authUserId, tenantId)}`;
}

/** tenantId si la cookie es válida para este usuario; null si falta, está rota o fue alterada. */
export function verifyActiveTenant(
  secret: string,
  authUserId: string,
  value: string | undefined,
): string | null {
  if (!value) return null;
  const [version, tenantId, given, ...rest] = value.split('.');
  if (version !== VERSION || !tenantId || !given || rest.length > 0 || !UUID.test(tenantId)) {
    return null;
  }
  const expected = Buffer.from(signature(secret, authUserId, tenantId));
  const actual = Buffer.from(given);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  return tenantId;
}

export function activeTenantCookieOptions(appUrl: string) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: appUrl.startsWith('https://'),
    path: '/',
    maxAge: MAX_AGE_SECONDS,
  };
}
