// IP y navegador del request para audit_events (E1-H3, ADR-005). La IP es el primer valor de
// x-forwarded-for (Railway la pone; un cliente puede falsearla): solo informativa. Se recortan
// para que un encabezado enorme no llene la tabla.
import type { ClientInfo } from '@/shared/ports/client-info';

const MAX_IP = 64;
const MAX_USER_AGENT = 512;

function clip(value: string | null | undefined, max: number): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

export function clientInfoFromHeaders(headers: Headers): ClientInfo {
  const forwarded = headers.get('x-forwarded-for')?.split(',')[0];
  return {
    ip: clip(forwarded ?? headers.get('x-real-ip'), MAX_IP),
    userAgent: clip(headers.get('user-agent'), MAX_USER_AGENT),
  };
}
