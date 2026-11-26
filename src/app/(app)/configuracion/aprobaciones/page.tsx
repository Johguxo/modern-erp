import { notFound } from 'next/navigation';

import { withTenant } from '@/db';
import { createGetPolicyDeps, getPolicy } from '@/modules/approvals';
import { hasPermission } from '@/shared/authorization';
import { NotFoundError } from '@/shared/errors';
import { PageHeader } from '@/ui/base/page-header';
import { messages } from '@/ui/messages/es-PE';

import { requireCtx } from '../../../_lib/session';

import { PolicyStepsForm } from './policy-steps-form';

// Política de aprobación del SOF (E4-H1). Sin approval_policies.manage → 404 (no revela que existe).
export default async function ApprovalsPage() {
  const { ctx } = await requireCtx();
  if (!hasPermission(ctx, 'approval_policies.manage')) notFound();

  const policy = await withTenant(ctx, (tx) =>
    getPolicy(ctx, { docType: 'SOF' }, createGetPolicyDeps(tx)),
  ).catch((error: unknown) => {
    // Un cliente sin política (no debería pasar: el alta y el backfill la crean) no tumba la app.
    if (error instanceof NotFoundError) return null;
    throw error;
  });
  if (!policy) notFound();

  return (
    <>
      <PageHeader title={messages.approvals.title} description={messages.approvals.description} />
      <PolicyStepsForm policy={policy} readOnly={ctx.readOnly} />
    </>
  );
}
