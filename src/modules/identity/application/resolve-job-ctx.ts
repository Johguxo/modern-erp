// Ctx de un job del worker (E2-H3): no hay sesión ni cookie, así que se reconstruye desde la base
// con el usuario que creó el trabajo y su tenant. Si el usuario o la membresía ya no están
// activos devuelve null (el job termina como no autorizado). Los permisos salen de permissionsFor.
import type { Ctx } from '@/shared/context';

import { permissionsFor } from '../domain/permissions';

import type { Entitlements } from './entitlements';
import type { SessionRepository } from './session-ports';

export async function resolveJobCtx(
  input: { userId: string; tenantId: string; requestId: string },
  deps: { sessions: SessionRepository; entitlements: Entitlements },
): Promise<Ctx | null> {
  const [access, readOnly] = await Promise.all([
    deps.sessions.findTenantAccessByUserId(input.userId, input.tenantId),
    // Ante un error al consultar el plan se trata como solo lectura (el lado seguro).
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
