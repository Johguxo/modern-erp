// Auditoría (E1-H3): el actor y el tenant salen del ctx, nunca de lo que envía el cliente. La IP y
// el navegador viajan en `client` (fuera de Ctx; la IP es solo informativa). Nunca se registran
// tokens ni contraseñas en `data`.
import type { Ctx } from '@/shared/context';
import type { ClientInfo } from '@/shared/ports/client-info';

import type { AuditLog } from './user-admin-ports';

export interface AuditEvent {
  readonly action: string;
  readonly entityType: string;
  readonly entityId: string | null;
  readonly data?: Readonly<Record<string, unknown>>;
}

export function recordAudit(
  ctx: Pick<Ctx, 'tenantId' | 'userId'>,
  event: AuditEvent,
  deps: { audit: AuditLog; client: ClientInfo },
): Promise<void> {
  return deps.audit.record({
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    actorType: 'user',
    action: event.action,
    entityType: event.entityType,
    entityId: event.entityId,
    data: event.data ?? {},
    ip: deps.client.ip,
    userAgent: deps.client.userAgent,
  });
}
