import { createPlatformStore, listPlans } from '@/modules/identity';
import { PageHeader } from '@/ui/base/page-header';
import { messages } from '@/ui/messages/es-PE';

import { requirePlatformAdmin } from '../../../_lib/session';

import { NewTenantForm } from './new-tenant-form';

// Alta de cliente (E1-H4). El prefijo y el siguiente número de SOF llegan en E3-H1.
export default async function NewTenantPage() {
  const { ctx } = await requirePlatformAdmin();
  const plans = await listPlans(ctx, { store: createPlatformStore() });
  return (
    <>
      <PageHeader title={messages.admin.newTitle} description={messages.admin.newDescription} />
      <NewTenantForm plans={plans} />
    </>
  );
}
