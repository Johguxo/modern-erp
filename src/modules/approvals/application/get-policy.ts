// Política de aprobación vigente para configurarla (E4-H1).
import { requirePermission } from '@/shared/authorization';
import type { Ctx } from '@/shared/context';
import { NotFoundError } from '@/shared/errors';

import type { DocType } from '../domain/route-preview';

import type { GetPolicyDeps } from './ports';
import { toPolicyView, type PolicyView } from './policy-view';

export async function getPolicy(
  ctx: Ctx,
  input: { readonly docType: DocType },
  deps: GetPolicyDeps,
): Promise<PolicyView> {
  requirePermission(ctx, 'approval_policies.manage');
  const policy = await deps.policies.findActive(ctx.tenantId, input.docType);
  if (!policy) throw new NotFoundError({ message: 'Approval policy not found' });
  const members = await deps.directory.activeMembers(ctx.tenantId);
  return toPolicyView(ctx.tenantId, policy, members, deps.directory);
}
