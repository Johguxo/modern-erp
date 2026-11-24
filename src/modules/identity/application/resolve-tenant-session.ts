// Arma el Ctx del request (E1-H2): valida usuario y membresía activos en el tenant de la cookie,
// calcula permisos (nunca por nombre de rol) y el modo solo lectura.
import type { Ctx } from '@/shared/context';

import { permissionsFor } from '../domain/permissions';

import type { Entitlements } from './entitlements';
import type { SessionRepository } from './session-ports';

export async function resolveTenantSession(
  input: { authUserId: string; tenantId: string; requestId: string },
  deps: { sessions: SessionRepository; entitlements: Entitlements },
): Promise<Ctx | null> {
  const [access, readOnly] = await Promise.all([
    deps.sessions.findTenantAccess(input.authUserId, input.tenantId),
    deps.entitlements.isReadOnly(input.tenantId).catch(() => true),
  ]);
  if (!access) return null;
  return {
    tenantId: input.tenantId,
    userId: access.userId,
    roles: access.roles,
    permissions: permissionsFor(access.roles),
    locale: access.locale,
    timezone: access.timezone,
    requestId: input.requestId,
    readOnly,
  };
}
