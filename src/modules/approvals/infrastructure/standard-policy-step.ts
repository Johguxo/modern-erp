// Paso de alta del tenant (E4-H1): crea la política "SOF estándar" con sus pasos dentro de la misma
// transacción de la consola (getDbAdmin, sin RLS). Solo escribe en el tenant recibido y es
// idempotente: si ya hay una política SOF activa, no hace nada (el único parcial lo respalda).
import { approvalPolicies, approvalPolicySteps } from '@/db/schema';
import type { TenantSetupStepFactory } from '@/modules/identity';

import { STANDARD_SOF_POLICY } from '../domain/standard-policy';

export const standardPolicySetupStep: TenantSetupStepFactory = (db) => ({
  async run({ tenantId }) {
    const [created] = await db
      .insert(approvalPolicies)
      .values({ tenantId, docType: STANDARD_SOF_POLICY.docType, name: STANDARD_SOF_POLICY.name })
      .onConflictDoNothing()
      .returning({ id: approvalPolicies.id });
    if (!created) return;
    await db.insert(approvalPolicySteps).values(
      STANDARD_SOF_POLICY.steps.map((step, index) => ({
        tenantId,
        policyId: created.id,
        stepOrder: index + 1,
        name: step.name,
        approverType: step.approverType,
        approverRef: step.approverType === 'role' ? step.role : [...step.userIds],
        rule: step.rule,
        condition: step.condition,
      })),
    );
  },
});
