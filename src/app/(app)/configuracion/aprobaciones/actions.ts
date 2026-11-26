'use server';

// Acciones de /configuracion/aprobaciones (E4-H1): validan con el contrato de approvals y llaman al
// caso de uso; approval_policies.manage se revisa aquí y otra vez en el caso de uso. Solo lectura:
// bloqueada.
import { createPolicyAdminDeps, updatePolicySteps } from '@/modules/approvals';
import { updatePolicyStepsContract } from '@/modules/approvals/contracts';

import { action } from '../../../_lib/action';

export const updatePolicyStepsAction = action(
  updatePolicyStepsContract,
  'approval_policies.manage',
  ({ ctx, input, tx, shared }) =>
    updatePolicySteps(ctx, input, createPolicyAdminDeps(tx, { client: shared.client })),
  { name: 'approvals.updatePolicySteps' },
);
