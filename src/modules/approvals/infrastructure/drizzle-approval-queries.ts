// Consultas de asignaciones (E4-H2) para la bandeja y la visibilidad, con la transacción de
// withTenant: RLS y filtro explícito por tenantId en ambas tablas.
import { and, desc, eq, inArray, isNull } from 'drizzle-orm';

import type { DbExecutor } from '@/db';
import { approvalStepAssignees, approvalSteps } from '@/db/schema';

import type { ApprovalQueries } from '../application/ports';

export function createDrizzleApprovalQueries(db: DbExecutor): ApprovalQueries {
  const joined = (tenantId: string, userId: string) =>
    and(
      eq(approvalStepAssignees.tenantId, tenantId),
      eq(approvalSteps.tenantId, tenantId),
      eq(approvalStepAssignees.userId, userId),
    );

  /** Pasos `pending` del usuario que aún no decidió. */
  const pendingFor = (tenantId: string, userId: string) =>
    and(
      joined(tenantId, userId),
      eq(approvalSteps.status, 'pending'),
      isNull(approvalStepAssignees.decision),
    );

  return {
    async assignedRequestIds(tenantId, userId) {
      const rows = await db
        .selectDistinct({ requestId: approvalSteps.requestId })
        .from(approvalStepAssignees)
        .innerJoin(approvalSteps, eq(approvalSteps.id, approvalStepAssignees.stepId))
        .where(joined(tenantId, userId));
      return rows.map((row) => row.requestId);
    },

    async isAssigned(tenantId, userId, requestId) {
      const rows = await db
        .select({ id: approvalStepAssignees.id })
        .from(approvalStepAssignees)
        .innerJoin(approvalSteps, eq(approvalSteps.id, approvalStepAssignees.stepId))
        .where(and(joined(tenantId, userId), eq(approvalSteps.requestId, requestId)))
        .limit(1);
      return rows.length > 0;
    },

    async pendingRequestIds(tenantId, userId) {
      const rows = await db
        .selectDistinct({ requestId: approvalSteps.requestId })
        .from(approvalStepAssignees)
        .innerJoin(approvalSteps, eq(approvalSteps.id, approvalStepAssignees.stepId))
        .where(pendingFor(tenantId, userId));
      return rows.map((row) => row.requestId);
    },

    async pendingStepId(tenantId, userId, requestId) {
      const [row] = await db
        .select({ stepId: approvalSteps.id })
        .from(approvalStepAssignees)
        .innerJoin(approvalSteps, eq(approvalSteps.id, approvalStepAssignees.stepId))
        .where(and(pendingFor(tenantId, userId), eq(approvalSteps.requestId, requestId)))
        .limit(1);
      return row?.stepId ?? null;
    },

    async latestStoppingStep(tenantId, requestId) {
      const [row] = await db
        .select({
          status: approvalSteps.status,
          decidedBy: approvalSteps.decidedBy,
          decidedAt: approvalSteps.decidedAt,
          comment: approvalSteps.comment,
        })
        .from(approvalSteps)
        .where(
          and(
            eq(approvalSteps.tenantId, tenantId),
            eq(approvalSteps.requestId, requestId),
            inArray(approvalSteps.status, ['rejected', 'changes_requested']),
          ),
        )
        .orderBy(desc(approvalSteps.decidedAt))
        .limit(1);
      if (!row?.decidedBy || !row.decidedAt) return null;
      return {
        kind: row.status === 'rejected' ? 'reject' : 'request_changes',
        decidedBy: row.decidedBy,
        comment: row.comment,
        decidedAt: row.decidedAt,
      };
    },
  };
}
