// Instancias, pasos y asignados del tenant activo (E4-H2) con la transacción de withTenant: RLS y
// filtro explícito por tenantId. app_user no borra y solo actualiza las columnas de 0018; las
// actualizaciones son condicionales para que dos decisiones simultáneas no se pisen.
import { and, asc, desc, eq, inArray, isNull } from 'drizzle-orm';

import type { DbExecutor } from '@/db';
import { approvalInstances, approvalStepAssignees, approvalSteps } from '@/db/schema';

import type { ApprovalInstanceRepository, StepWithRequest } from '../application/ports';
import type {
  AssigneeDecision,
  AssigneeRecord,
  InstanceRecord,
  InstanceStatus,
  StepStatus,
} from '../domain/approval-instance';
import type { StepRule } from '../domain/route-preview';

type InstanceRow = typeof approvalInstances.$inferSelect;
type StepRow = typeof approvalSteps.$inferSelect;
type AssigneeRow = typeof approvalStepAssignees.$inferSelect;

// Los check constraints de la base garantizan estos valores; aquí solo se estrechan los tipos.
function toInstance(row: InstanceRow): InstanceRecord {
  return {
    id: row.id,
    requestId: row.requestId,
    round: row.round,
    status: row.status as InstanceStatus,
  };
}

function toAssignee(row: AssigneeRow): AssigneeRecord {
  return { id: row.id, userId: row.userId, decision: row.decision as AssigneeDecision | null };
}

function toStep(row: StepRow, assignees: readonly AssigneeRow[]): StepWithRequest {
  return {
    id: row.id,
    instanceId: row.instanceId,
    requestId: row.requestId,
    order: row.stepOrder,
    name: row.name,
    rule: row.rule as StepRule,
    status: row.status as StepStatus,
    assignees: assignees.filter((a) => a.stepId === row.id).map(toAssignee),
  };
}

export function createDrizzleInstanceRepository(db: DbExecutor): ApprovalInstanceRepository {
  const assigneesOf = (tenantId: string, stepIds: readonly string[]) =>
    stepIds.length === 0
      ? Promise.resolve<AssigneeRow[]>([])
      : db
          .select()
          .from(approvalStepAssignees)
          .where(
            and(
              eq(approvalStepAssignees.tenantId, tenantId),
              inArray(approvalStepAssignees.stepId, [...stepIds]),
            ),
          )
          .orderBy(asc(approvalStepAssignees.createdAt), asc(approvalStepAssignees.id));

  return {
    async lockLatest(tenantId, requestId) {
      const [row] = await db
        .select()
        .from(approvalInstances)
        .where(
          and(eq(approvalInstances.tenantId, tenantId), eq(approvalInstances.requestId, requestId)),
        )
        .orderBy(desc(approvalInstances.round))
        .limit(1)
        .for('update');
      return row ? toInstance(row) : null;
    },

    async create(tenantId, input) {
      const [row] = await db
        .insert(approvalInstances)
        .values({
          tenantId,
          requestId: input.requestId,
          round: input.round,
          policyId: input.policyId,
          policySnapshot: input.snapshot,
        })
        .returning();
      if (!row) throw new Error('Approval instance insert returned no row');
      return toInstance(row);
    },

    async insertSteps(tenantId, instance, steps, now) {
      if (steps.length === 0) return [];
      const rows = await db
        .insert(approvalSteps)
        .values(
          steps.map((step) => ({
            tenantId,
            instanceId: instance.id,
            requestId: instance.requestId,
            stepOrder: step.order,
            name: step.name,
            rule: step.rule,
            status: step.status,
            pendingSince: step.status === 'pending' ? now : null,
          })),
        )
        .returning();
      const byOrder = new Map(rows.map((row) => [row.stepOrder, row]));
      const assigneeValues = steps.flatMap((step) => {
        const stepRow = byOrder.get(step.order);
        return stepRow
          ? step.assigneeIds.map((userId) => ({ tenantId, stepId: stepRow.id, userId }))
          : [];
      });
      const assignees =
        assigneeValues.length > 0
          ? await db.insert(approvalStepAssignees).values(assigneeValues).returning()
          : [];
      return rows.sort((a, b) => a.stepOrder - b.stepOrder).map((row) => toStep(row, assignees));
    },

    async findStep(tenantId, stepId) {
      const [row] = await db
        .select()
        .from(approvalSteps)
        .where(and(eq(approvalSteps.tenantId, tenantId), eq(approvalSteps.id, stepId)))
        .limit(1);
      if (!row) return null;
      return toStep(row, await assigneesOf(tenantId, [row.id]));
    },

    async stepsOf(tenantId, instanceId) {
      const rows = await db
        .select()
        .from(approvalSteps)
        .where(and(eq(approvalSteps.tenantId, tenantId), eq(approvalSteps.instanceId, instanceId)))
        .orderBy(asc(approvalSteps.stepOrder));
      const assignees = await assigneesOf(
        tenantId,
        rows.map((row) => row.id),
      );
      return rows.map((row) => toStep(row, assignees));
    },

    async recordAssigneeDecision(tenantId, input) {
      const rows = await db
        .update(approvalStepAssignees)
        .set({ decision: input.decision, decidedAt: input.at, comment: input.comment })
        .where(
          and(
            eq(approvalStepAssignees.tenantId, tenantId),
            eq(approvalStepAssignees.stepId, input.stepId),
            eq(approvalStepAssignees.userId, input.userId),
            isNull(approvalStepAssignees.decision),
          ),
        )
        .returning({ id: approvalStepAssignees.id });
      return rows.length === 1;
    },

    async closeStep(tenantId, stepId, patch) {
      const rows = await db
        .update(approvalSteps)
        .set({
          status: patch.status,
          decidedBy: patch.decidedBy,
          decidedAt: patch.decidedAt,
          comment: patch.comment,
          updatedAt: patch.decidedAt,
        })
        .where(
          and(
            eq(approvalSteps.tenantId, tenantId),
            eq(approvalSteps.id, stepId),
            eq(approvalSteps.status, 'pending'),
          ),
        )
        .returning({ id: approvalSteps.id });
      return rows.length === 1;
    },

    async activateStep(tenantId, stepId, now) {
      const rows = await db
        .update(approvalSteps)
        .set({ status: 'pending', pendingSince: now, updatedAt: now })
        .where(
          and(
            eq(approvalSteps.tenantId, tenantId),
            eq(approvalSteps.id, stepId),
            eq(approvalSteps.status, 'waiting'),
          ),
        )
        .returning({ id: approvalSteps.id });
      return rows.length === 1;
    },

    async cancelOpenSteps(tenantId, instanceId, now) {
      const rows = await db
        .update(approvalSteps)
        .set({ status: 'cancelled', updatedAt: now })
        .where(
          and(
            eq(approvalSteps.tenantId, tenantId),
            eq(approvalSteps.instanceId, instanceId),
            inArray(approvalSteps.status, ['waiting', 'pending']),
          ),
        )
        .returning({ id: approvalSteps.id });
      return rows.length;
    },

    async closeInstance(tenantId, instanceId, status, now) {
      const rows = await db
        .update(approvalInstances)
        .set({ status, updatedAt: now })
        .where(
          and(
            eq(approvalInstances.tenantId, tenantId),
            eq(approvalInstances.id, instanceId),
            eq(approvalInstances.status, 'in_progress'),
          ),
        )
        .returning({ id: approvalInstances.id });
      return rows.length === 1;
    },
  };
}
