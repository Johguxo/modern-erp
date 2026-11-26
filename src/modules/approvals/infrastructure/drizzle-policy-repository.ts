// Repositorio de políticas de aprobación (E4-H1) con la transacción de withTenant: RLS del tenant
// activo y además filtro explícito por tenantId. app_user no inserta ni borra políticas; solo sube
// version y updated_at (grants de 0016). Los pasos se reemplazan: se borran y se insertan.
import { and, asc, eq, sql } from 'drizzle-orm';

import type { DbExecutor } from '@/db';
import { approvalPolicies, approvalPolicySteps } from '@/db/schema';
import { TENANT_ROLES, type Role } from '@/shared/permissions';

import type { PolicyRepository } from '../application/ports';
import type { Policy, PolicyStep } from '../domain/policy';
import type { DocType, StepRule } from '../domain/route-preview';

type PolicyRow = typeof approvalPolicies.$inferSelect;
type StepRow = typeof approvalPolicySteps.$inferSelect;

function toRole(value: unknown): Role | null {
  return typeof value === 'string' && (TENANT_ROLES as readonly string[]).includes(value)
    ? (value as Role)
    : null;
}

function toUserIds(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

/**
 * Los tipos reservados (requester_manager, external_email) y los roles desconocidos no se editan en
 * el MVP: devuelve null y la política queda marcada con `hasReservedSteps`.
 */
function toStep(row: StepRow): PolicyStep | null {
  if (row.approverType !== 'role' && row.approverType !== 'users') return null;
  if (row.approverType === 'role' && toRole(row.approverRef) === null) return null;
  const condition =
    typeof row.condition === 'object' && row.condition !== null && !Array.isArray(row.condition)
      ? (row.condition as Record<string, unknown>)
      : {};
  return {
    order: row.stepOrder,
    name: row.name,
    approverType: row.approverType,
    role: row.approverType === 'role' ? toRole(row.approverRef) : null,
    userIds: row.approverType === 'users' ? toUserIds(row.approverRef) : [],
    rule: row.rule as StepRule,
    condition,
  };
}

function toPolicy(row: PolicyRow, rows: readonly StepRow[]): Policy {
  const parsed = rows.map(toStep);
  const steps = parsed.flatMap((step) => step ?? []);
  return {
    id: row.id,
    docType: row.docType as DocType,
    name: row.name,
    version: row.version,
    steps,
    hasReservedSteps: steps.length !== rows.length,
  };
}

export function createDrizzlePolicyRepository(db: DbExecutor): PolicyRepository {
  const stepsOf = (tenantId: string, policyId: string) =>
    db
      .select()
      .from(approvalPolicySteps)
      .where(
        and(eq(approvalPolicySteps.tenantId, tenantId), eq(approvalPolicySteps.policyId, policyId)),
      )
      .orderBy(asc(approvalPolicySteps.stepOrder));

  const activeWhere = (tenantId: string, docType: DocType) =>
    and(
      eq(approvalPolicies.tenantId, tenantId),
      eq(approvalPolicies.docType, docType),
      eq(approvalPolicies.active, true),
    );

  return {
    async findActive(tenantId, docType) {
      const [row] = await db
        .select()
        .from(approvalPolicies)
        .where(activeWhere(tenantId, docType))
        .limit(1);
      return row ? toPolicy(row, await stepsOf(tenantId, row.id)) : null;
    },

    async findActiveForStart(tenantId, docType) {
      const [row] = await db
        .select()
        .from(approvalPolicies)
        .where(activeWhere(tenantId, docType))
        .limit(1)
        .for('share');
      return row ? toPolicy(row, await stepsOf(tenantId, row.id)) : null;
    },

    async lockActive(tenantId, docType) {
      const [row] = await db
        .select()
        .from(approvalPolicies)
        .where(activeWhere(tenantId, docType))
        .limit(1)
        .for('update');
      return row ? toPolicy(row, await stepsOf(tenantId, row.id)) : null;
    },

    async replaceSteps(tenantId, policyId, steps) {
      await db
        .delete(approvalPolicySteps)
        .where(
          and(
            eq(approvalPolicySteps.tenantId, tenantId),
            eq(approvalPolicySteps.policyId, policyId),
          ),
        );
      if (steps.length > 0) {
        await db.insert(approvalPolicySteps).values(
          steps.map((step, index) => ({
            tenantId,
            policyId,
            stepOrder: index + 1,
            name: step.name,
            approverType: step.approverType,
            approverRef: step.approverType === 'role' ? step.role : [...step.userIds],
            rule: step.rule,
            condition: step.condition,
          })),
        );
      }
      const [row] = await db
        .update(approvalPolicies)
        .set({ version: sql`${approvalPolicies.version} + 1` })
        .where(and(eq(approvalPolicies.tenantId, tenantId), eq(approvalPolicies.id, policyId)))
        .returning();
      if (!row) throw new Error('Approval policy disappeared while updating its steps');
      return toPolicy(row, await stepsOf(tenantId, policyId));
    },
  };
}
