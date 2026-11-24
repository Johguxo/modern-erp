import Link from 'next/link';

import { createPlatformStore, listTenants } from '@/modules/identity';
import { EmptyState } from '@/ui/base/empty-state';
import { PageHeader } from '@/ui/base/page-header';
import { Button } from '@/ui/components/button';
import { messages } from '@/ui/messages/es-PE';

import { requirePlatformAdmin } from '../../_lib/session';

import { TenantsTable } from './tenants-table';

const t = messages.admin;

// Lista de clientes (E1-H4): nombre, plan, estado de la suscripción y usuarios activos / límite.
export default async function TenantsPage() {
  const { ctx } = await requirePlatformAdmin();
  const tenants = await listTenants(ctx, { store: createPlatformStore() });

  const newButton = (
    <Button asChild>
      <Link href="/admin/clientes/nuevo">{t.newTenant}</Link>
    </Button>
  );

  return (
    <>
      <PageHeader title={t.title} description={t.description} actions={newButton} />
      {tenants.length === 0 ? (
        <EmptyState
          title={t.emptyTitle}
          description={t.emptyDescription}
          action={
            <Button asChild>
              <Link href="/admin/clientes/nuevo">{t.createFirst}</Link>
            </Button>
          }
        />
      ) : (
        <TenantsTable tenants={tenants} />
      )}
    </>
  );
}
