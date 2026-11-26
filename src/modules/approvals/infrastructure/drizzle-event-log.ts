// Eventos de aprobación del tenant activo (E4-H2): solo insert (CLAUDE.md regla 7; grants de 0018 y
// políticas append-only). `created_at` usa clock_timestamp() para que los eventos de una misma
// transacción conserven su orden (now() devuelve la hora de inicio de la transacción).
import { sql } from 'drizzle-orm';

import type { DbExecutor } from '@/db';
import { approvalEvents } from '@/db/schema';

import type { ApprovalEventLog } from '../application/ports';

export function createDrizzleEventLog(db: DbExecutor): ApprovalEventLog {
  return {
    async append(tenantId, event) {
      await db.insert(approvalEvents).values({
        tenantId,
        requestId: event.requestId,
        instanceId: event.instanceId,
        stepId: event.stepId,
        type: event.type,
        actorType: event.actorUserId === null ? 'system' : 'user',
        actorUserId: event.actorUserId,
        comment: event.comment,
        data: { ...event.data },
        createdAt: sql`clock_timestamp()`,
      });
    },
  };
}
