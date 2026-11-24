'use client';

// /configuracion/equipos (E2-H2): lista, creación, edición y activación de equipos. En solo
// lectura las acciones quedan deshabilitadas (el servidor igual las bloquea).
import type { ColumnDef } from '@tanstack/react-table';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import type { EquipmentView } from '@/modules/catalog';
import { StatusBadge } from '@/ui/base/status-badge';
import { Button } from '@/ui/components/button';
import { messages } from '@/ui/messages/es-PE';

import { setEquipmentActiveAction } from '../_catalog/actions';
import { CatalogListView, type Notice } from '../_catalog/catalog-list-view';
import { ImportButton } from '../_catalog/import-button';
import type { ListParams } from '../_catalog/list-params';
import { SetActiveControl } from '../_catalog/set-active-control';

import { EquipmentDialog } from './equipment-dialog';

const t = messages.catalog;

export function EquipmentManager({
  items,
  total,
  params,
  readOnly,
}: {
  items: EquipmentView[];
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

  const columns: ColumnDef<EquipmentView, unknown>[] = [
    {
      id: 'code',
      header: t.columns.code,
      cell: ({ row }) => <span className="font-medium whitespace-nowrap">{row.original.code}</span>,
    },
    { id: 'name', header: t.columns.name, cell: ({ row }) => row.original.name },
    { id: 'type', header: t.columns.type, cell: ({ row }) => row.original.type ?? t.noValue },
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
        const equipment = row.original;
        return (
          <div className="flex flex-wrap gap-2">
            <EquipmentDialog
              item={equipment}
              onDone={done}
              trigger={
                <Button
                  type="button"
                  variant="outline"
                  disabled={readOnly}
                  aria-label={`${t.actions.edit} ${equipment.code}`}
                >
                  {t.actions.edit}
                </Button>
              }
            />
            <SetActiveControl
              name={equipment.name}
              active={equipment.active}
              disabled={readOnly}
              setActive={(active) => setEquipmentActiveAction({ id: equipment.id, active })}
              onDone={done}
            />
          </div>
        );
      },
    },
  ];

  return (
    <CatalogListView
      section="equipment"
      title={t.equipment.title}
      description={t.equipment.description}
      emptyTitle={t.equipment.emptyTitle}
      emptyDescription={t.equipment.emptyDescription}
      notice={notice}
      columns={columns}
      rows={items}
      total={total}
      params={params}
      actions={
        <>
          <EquipmentDialog
            onDone={done}
            trigger={
              <Button type="button" disabled={readOnly}>
                {t.equipment.new}
              </Button>
            }
          />
          <ImportButton />
        </>
      }
    />
  );
}
