'use client';

// /configuracion/centros-de-costo (E2-H2): lista, creación, edición y activación. Sin importar:
// E2-H3 solo trae las importaciones de productos y equipos.
import type { ColumnDef } from '@tanstack/react-table';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import type { CostCenterView } from '@/modules/catalog';
import { StatusBadge } from '@/ui/base/status-badge';
import { Button } from '@/ui/components/button';
import { messages } from '@/ui/messages/es-PE';

import { setCostCenterActiveAction } from '../_catalog/actions';
import { CatalogListView, type Notice } from '../_catalog/catalog-list-view';
import type { ListParams } from '../_catalog/list-params';
import { SetActiveControl } from '../_catalog/set-active-control';

import { CostCenterDialog } from './cost-center-dialog';

const t = messages.catalog;

export function CostCentersManager({
  items,
  total,
  params,
  readOnly,
}: {
  items: CostCenterView[];
  total: number;
  params: ListParams;
  readOnly: boolean;
}) {
  const router = useRouter();
  const [notice, setNotice] = useState<Notice>();

  const done = (next: Notice) => {
    setNotice(next);
    router.refresh();
  };

  const columns: ColumnDef<CostCenterView, unknown>[] = [
    {
      id: 'code',
      header: t.columns.code,
      cell: ({ row }) => <span className="font-medium whitespace-nowrap">{row.original.code}</span>,
    },
    { id: 'name', header: t.columns.name, cell: ({ row }) => row.original.name },
    {
      id: 'status',
      header: t.columns.status,
      cell: ({ row }) => (
        <StatusBadge status={row.original.active ? 'catalog_active' : 'catalog_inactive'} />
      ),
    },
    {
      id: 'actions',
      header: t.columns.actions,
      cell: ({ row }) => {
        const costCenter = row.original;
        return (
          <div className="flex flex-wrap gap-2">
            <CostCenterDialog
              item={costCenter}
              onDone={done}
              trigger={
                <Button
                  type="button"
                  variant="outline"
                  disabled={readOnly}
                  aria-label={`${t.actions.edit} ${costCenter.code}`}
                >
                  {t.actions.edit}
                </Button>
              }
            />
            <SetActiveControl
              name={costCenter.name}
              active={costCenter.active}
              disabled={readOnly}
              setActive={(active) => setCostCenterActiveAction({ id: costCenter.id, active })}
              onDone={done}
            />
          </div>
        );
      },
    },
  ];

  return (
    <CatalogListView
      section="costCenters"
      title={t.costCenters.title}
      description={t.costCenters.description}
      emptyTitle={t.costCenters.emptyTitle}
      emptyDescription={t.costCenters.emptyDescription}
      notice={notice}
      columns={columns}
      rows={items}
      total={total}
      params={params}
      actions={
        <CostCenterDialog
          onDone={done}
          trigger={
            <Button type="button" disabled={readOnly}>
              {t.costCenters.new}
            </Button>
          }
        />
      }
    />
  );
}
