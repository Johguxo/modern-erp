// Guarda los pasos de la política vigente (E4-H1): reemplaza todos en la transacción de la entrega,
// con bloqueo optimista (`version`) y auditoría. Los documentos ya enviados no cambian: E4-H2
// copia los pasos a la instancia al enviar.
import { recordAudit } from '@/modules/identity';
import { requirePermission } from '@/shared/authorization';
import type { Ctx } from '@/shared/context';
import { ConflictError, NotFoundError } from '@/shared/errors';

import type { PolicyStepSpec } from '../domain/policy';
import type { DocType } from '../domain/route-preview';
import { validatePolicySteps } from '../domain/validate-policy-steps';

import type { PolicyAdminDeps } from './ports';
import { toPolicyView, type PolicyView } from './policy-view';

export interface UpdatePolicyStepsInput {
  readonly docType: DocType;
  /** La versión que la pantalla vio al abrir la política. */
  readonly version: number;
  readonly steps: readonly PolicyStepSpec[];
}

function snapshot(steps: readonly PolicyStepSpec[]) {
  return steps.map((step) => ({
    name: step.name,
    approverType: step.approverType,
    role: step.role,
    userIds: [...step.userIds],
    rule: step.rule,
    condition: step.condition,
  }));
}

export async function updatePolicySteps(
  ctx: Ctx,
  input: UpdatePolicyStepsInput,
  deps: PolicyAdminDeps,
): Promise<PolicyView> {
  requirePermission(ctx, 'approval_policies.manage');

  const current = await deps.policies.lockActive(ctx.tenantId, input.docType);
  if (!current) throw new NotFoundError({ message: 'Approval policy not found' });
  if (current.hasReservedSteps) {
    // Reemplazar los pasos borraría los que esta pantalla no sabe editar.
    throw new ConflictError({
      reason: 'policy_has_reserved_steps',
      message: 'The policy has reserved steps that cannot be edited here',
    });
  }
  if (current.version !== input.version) {
    throw new ConflictError({
      reason: 'stale_version',
      message: `Stale version: expected ${input.version}, current ${current.version}`,
    });
  }

  const members = await deps.directory.activeMembers(ctx.tenantId);
  const steps = validatePolicySteps(input.steps, new Set(members.map((member) => member.userId)));

  const updated = await deps.policies.replaceSteps(ctx.tenantId, current.id, steps);

  await recordAudit(
    ctx,
    {
      action: 'approval_policy.updated',
      entityType: 'approval_policy',
      entityId: updated.id,
      data: {
        docType: updated.docType,
        fromVersion: current.version,
        toVersion: updated.version,
        before: snapshot(current.steps),
        after: snapshot(updated.steps),
      },
    },
    deps,
  );
  return toPolicyView(ctx.tenantId, updated, members, deps.directory);
}
