import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';

import { createPlatformStore, getTenant, listPlans } from '@/modules/identity';
import { systemClock } from '@/shared/adapters/system-clock';
import { PageHeader } from '@/ui/base/page-header';
import { messages } from '@/ui/messages/es-PE';

import { requirePlatformAdmin } from '../../../_lib/session';

import { TenantDetailView, type DetailNotice } from './tenant-detail';

const NOTICES = ['created', 'createdEmailFailed'] as const;

// Detalle de un cliente (E1-H4): cambiar plan, estado de la suscripción y límite de usuarios, e
// invitar a un administrador.
export default async function TenantPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ aviso?: string }>;
}) {
  const { ctx } = await requirePlatformAdmin();
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();

  const store = createPlatformStore();
  const [tenant, plans] = await Promise.all([
    getTenant(ctx, { tenantId: id }, { store, clock: systemClock }),
    listPlans(ctx, { store }),
  ]);
  if (!tenant) notFound();

  const { aviso } = await searchParams;
  const notice = NOTICES.find((n): n is DetailNotice => n === aviso);

  return (
    <>
      <Link
        href="/admin/clientes"
        className="mb-4 inline-flex min-h-11 items-center text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        ← {messages.admin.back}
      </Link>
      <PageHeader
        title={tenant.name}
        description={`${tenant.slug} · ${messages.admin.detail.currency(tenant.currency)}`}
      />
      <TenantDetailView tenant={tenant} plans={plans} initialNotice={notice} />
    </>
  );
}
