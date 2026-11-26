// Consultas de asignaciones (E4-H2) para la bandeja y la visibilidad, con la transacción de
// withTenant: RLS y filtro explícito por tenantId en ambas tablas.
import { and, asc, desc, eq, inArray, isNull, sql } from 'drizzle-orm';

import type { DbExecutor } from '@/db';
import {
  approvalEvents,
  approvalInstances,
  approvalStepAssignees,
  approvalSteps,
} from '@/db/schema';

import type { ApprovalQueries } from '../application/ports';
import { INSTANCE_STATUSES, type InstanceStatus } from '../domain/approval-instance';
import { STEP_RULES, type StepRule } from '../domain/route-preview';
import type { OpenStepRow, TimelineEventRow } from '../domain/timeline';

// Los valores salen de columnas de texto: un valor fuera de la lista es un dato corrupto y falla
// como error interno (el usuario ve el mensaje genérico).
function parseStepRule(value: string): StepRule {
  const rule = STEP_RULES.find((r) => r === value);
  if (!rule) throw new Error(`Unexpected approval step rule: ${value}`);
  return rule;
}

function parseOpenStatus(value: string): 'pending' | 'waiting' {
  if (value === 'pending' || value === 'waiting') return value;
  throw new Error(`Unexpected open approval step status: ${value}`);
}

function parseInstanceStatus(value: string): InstanceStatus {
  const status = INSTANCE_STATUSES.find((s) => s === value);
  if (!status) throw new Error(`Unexpected approval instance status: ${value}`);
  return status;
}

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

    async timelineSource(tenantId, requestId) {
      const [instance] = await db
        .select({ id: approvalInstances.id, status: approvalInstances.status })
        .from(approvalInstances)
        .where(
          and(eq(approvalInstances.tenantId, tenantId), eq(approvalInstances.requestId, requestId)),
        )
        .orderBy(desc(approvalInstances.round))
        .limit(1);
      if (!instance) return null;

      const eventRows = await db
        .select({
          id: approvalEvents.id,
          type: approvalEvents.type,
          actorUserId: approvalEvents.actorUserId,
          comment: approvalEvents.comment,
          createdAt: approvalEvents.createdAt,
          stepClosed: sql<string | null>`${approvalEvents.data}->>'stepClosed'`,
          stepName: approvalSteps.name,
          stepRule: approvalSteps.rule,
        })
        .from(approvalEvents)
        .leftJoin(
          approvalSteps,
          and(eq(approvalSteps.id, approvalEvents.stepId), eq(approvalSteps.tenantId, tenantId)),
        )
        .where(and(eq(approvalEvents.tenantId, tenantId), eq(approvalEvents.requestId, requestId)))
        .orderBy(asc(approvalEvents.createdAt), asc(approvalEvents.id));
      const events: TimelineEventRow[] = eventRows.map(({ stepClosed, stepRule, ...row }) => ({
        ...row,
        stepRule: stepRule === null ? null : parseStepRule(stepRule),
        stepClosed: stepClosed === null ? null : stepClosed !== 'false',
      }));

      const stepRows = await db
        .select({
          id: approvalSteps.id,
          order: approvalSteps.stepOrder,
          name: approvalSteps.name,
          rule: approvalSteps.rule,
          status: approvalSteps.status,
          pendingSince: approvalSteps.pendingSince,
          assigneeUserId: approvalStepAssignees.userId,
          assigneeDecision: approvalStepAssignees.decision,
        })
        .from(approvalSteps)
        .leftJoin(
          approvalStepAssignees,
          and(
            eq(approvalStepAssignees.stepId, approvalSteps.id),
            eq(approvalStepAssignees.tenantId, tenantId),
          ),
        )
        .where(
          and(
            eq(approvalSteps.tenantId, tenantId),
            eq(approvalSteps.instanceId, instance.id),
            inArray(approvalSteps.status, ['pending', 'waiting']),
          ),
        )
        .orderBy(asc(approvalSteps.stepOrder));
      const open = new Map<string, OpenStepRow & { assigneeIds: string[] }>();
      for (const row of stepRows) {
        let step = open.get(row.id);
        if (!step) {
          step = {
            order: row.order,
            name: row.name,
            rule: parseStepRule(row.rule),
            status: parseOpenStatus(row.status),
            pendingSince: row.pendingSince,
            assigneeIds: [],
          };
          open.set(row.id, step);
        }
        if (row.assigneeUserId && row.assigneeDecision === null) {
          step.assigneeIds.push(row.assigneeUserId);
        }
      }
      return {
        instanceStatus: parseInstanceStatus(instance.status),
        events,
        openSteps: [...open.values()],
      };
    },
  };
}
