'use client';

// Tabla de la bandeja: 7 columnas del prototipo con paginación del servidor. El N° es un enlace
// (teclado y lectores de pantalla); el clic en la fila es solo un atajo de mouse. Un borrador
// propio abre el editor; lo demás, el detalle.
import type { ColumnDef } from '@tanstack/react-table';
import type { Route } from 'next';
import Link from 'next/link';
import { useMemo } from 'react';

import type { InboxItem } from '@/modules/requests';
import { DataTable } from '@/ui/base/data-table';
import { DateText } from '@/ui/base/date-text';
import { EmptyState } from '@/ui/base/empty-state';
import { MoneyText } from '@/ui/base/money-text';
import { StatusBadge } from '@/ui/base/status-badge';
import { messages } from '@/ui/messages/es-PE';

const t = messages.inbox;

export function requestHref(item: Pick<InboxItem, 'id' | 'isOwnDraft'>): Route {
  return (item.isOwnDraft ? `/solicitudes/${item.id}/editar` : `/solicitudes/${item.id}`) as Route;
}

const header = (label: string) => (
  <span className="text-xs font-semibold tracking-wide uppercase">{label}</span>
);

export function RequestsTable({
  items,
  timeZone,
  page,
  pageCount,
}: {
  items: InboxItem[];
  timeZone: string;
  page: number;
  pageCount: number;
}) {
  const columns = useMemo<ColumnDef<InboxItem, unknown>[]>(
    () => [
      {
        id: 'number',
        header: () => header(t.columns.number),
        cell: ({ row }) => (
          <Link
            href={requestHref(row.original)}
            className="font-semibold text-primary hover:text-primary-hover"
          >
            {row.original.number ?? t.draftNumber}
          </Link>
        ),
      },
      { id: 'type', header: () => header(t.columns.type), cell: ({ row }) => row.original.docType },
      {
        id: 'requester',
        header: () => header(t.columns.requester),
        cell: ({ row }) => row.original.requesterName ?? t.noValue,
      },
      {
        id: 'area',
        header: () => header(t.columns.area),
        cell: ({ row }) => (
          <span className="text-ink-2">{row.original.areaLabel ?? t.noValue}</span>
        ),
      },
      {
        id: 'amount',
        header: () => header(t.columns.amount),
        cell: ({ row }) => (
          <MoneyText amount={row.original.totalAmount} currency={row.original.currency} />
        ),
      },
      {
        id: 'status',
        header: () => header(t.columns.status),
        cell: ({ row }) => <StatusBadge status={row.original.displayStatus} />,
      },
      {
        id: 'updated',
        header: () => header(t.columns.updated),
        cell: ({ row }) => (
          <DateText
            value={row.original.updatedAt}
            timeZone={timeZone}
            className="whitespace-nowrap text-muted-foreground"
          />
        ),
      },
    ],
    [timeZone],
  );

  return (
    <DataTable
      className="min-w-0 rounded-none border-0 [&_table]:min-w-[760px]"
      columns={columns}
      data={items}
      getRowHref={requestHref}
      page={page}
      pageCount={pageCount}
      emptyState={
        <EmptyState
          className="rounded-none border-0"
          title={t.noResultsTitle}
          description={t.noResultsDescription}
        />
      }
    />
  );
}
