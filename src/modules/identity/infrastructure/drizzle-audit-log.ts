// audit_events: solo insert (CLAUDE.md regla 7). Con app_user, la política exige que el tenant
// sea el activo y el actor el usuario de la transacción; con getDbAdmin (aceptar invitación) el
// caso de uso fija ambos desde la invitación.
import type { DbExecutor } from '@/db';
import { auditEvents } from '@/db/schema';

import type { AuditLog } from '../application/user-admin-ports';

export function createDrizzleAuditLog(db: DbExecutor): AuditLog {
  return {
    async record(entry) {
      await db.insert(auditEvents).values({
        tenantId: entry.tenantId,
        actorUserId: entry.actorUserId,
        actorType: entry.actorType,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        data: entry.data,
        ip: entry.ip,
        userAgent: entry.userAgent,
      });
    },
  };
}
