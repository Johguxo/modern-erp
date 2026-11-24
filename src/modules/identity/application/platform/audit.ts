// Auditoría de la consola (E1-H4, ADR-007): actor_type 'platform_admin', el SuperAdmin del ctx y
// el tenant afectado. Nunca tokens ni contraseñas en `data`.
import type { PlatformCtx } from '@/shared/context';
import type { ClientInfo } from '@/shared/ports/client-info';

import type { AuditEvent } from '../audit';
import type { AuditLog } from '../user-admin-ports';

export function recordPlatformAudit(
  ctx: PlatformCtx,
  tenantId: string | null,
  event: AuditEvent,
  uow: { audit: AuditLog },
  deps: { client: ClientInfo },
): Promise<void> {
  return uow.audit.record({
    tenantId,
    actorUserId: ctx.userId,
    actorType: 'platform_admin',
    action: event.action,
    entityType: event.entityType,
    entityId: event.entityId,
    data: event.data ?? {},
    ip: deps.client.ip,
    userAgent: deps.client.userAgent,
  });
}
