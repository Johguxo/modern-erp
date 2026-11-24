'use client';

// Tabla de clientes de la consola (E1-H4). El nombre es un enlace al detalle (teclado y lectores
// de pantalla); el clic en la fila es solo un atajo de mouse.
import type { ColumnDef } from '@tanstack/react-table';
import type { Route } from 'next';
import Link from 'next/link';

import type { TenantListItem } from '@/modules/identity';
import { DataTable } from '@/ui/base/data-table';
import { messages } from '@/ui/messages/es-PE';

import { SubscriptionBadge } from './subscription-badge';

const t = messages.admin;

export function tenantHref(tenantId: string): Route {
  return `/admin/clientes/${tenantId}` as Route;
}

const columns: ColumnDef<TenantListItem, unknown>[] = [
  {
    id: 'name',
    header: t.columns.name,
    cell: ({ row }) => (
      <div className="min-w-0">
        <Link
          href={tenantHref(row.original.tenantId)}
          className="font-medium text-foreground underline-offset-4 hover:underline"
        >
          {row.original.name}
        </Link>
        <p className="text-xs text-muted-foreground">{row.original.slug}</p>
      </div>
    ),
  },
  {
    id: 'plan',
    header: t.columns.plan,
    cell: ({ row }) => row.original.subscription?.planName ?? '—',
  },
  {
    id: 'status',
    header: t.columns.status,
    cell: ({ row }) => <SubscriptionBadge status={row.original.subscription?.status ?? null} />,
  },
  {
    id: 'users',
    header: t.columns.users,
    cell: ({ row }) => {
      const { activeMembers, liveInvitations, subscription } = row.original;
      return (
        <div>
          <span className="tabular-nums">
            {subscription ? t.usage(activeMembers, subscription.userLimit) : `${activeMembers} / —`}
          </span>
          {liveInvitations > 0 ? (
            <p className="text-xs text-muted-foreground">{t.pendingInvitations(liveInvitations)}</p>
          ) : null}
        </div>
      );
    },
  },
];

export function TenantsTable({ tenants }: { tenants: TenantListItem[] }) {
  return (
    <DataTable
      columns={columns}
      data={tenants}
      getRowHref={(tenant) => tenantHref(tenant.tenantId)}
    />
  );
}
