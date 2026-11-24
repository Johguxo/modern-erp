'use client';

// /configuracion/productos (E2-H2): lista, creación, edición y activación de productos. En solo
// lectura las acciones quedan deshabilitadas (el servidor igual las bloquea).
import type { ColumnDef } from '@tanstack/react-table';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import type { ProductView } from '@/modules/catalog';
import { MoneyText } from '@/ui/base/money-text';
import { StatusBadge } from '@/ui/base/status-badge';
import { Button } from '@/ui/components/button';
import type { CurrencyCode } from '@/ui/format/money';
import { messages } from '@/ui/messages/es-PE';

import { setProductActiveAction } from '../_catalog/actions';
import { CatalogListView, type Notice } from '../_catalog/catalog-list-view';
import { ImportButton } from '../_catalog/import-button';
import type { ListParams } from '../_catalog/list-params';
import { SetActiveControl } from '../_catalog/set-active-control';

import { ProductDialog } from './product-dialog';

const t = messages.catalog;

export function ProductsManager({
  items,
  total,
  params,
  tenantCurrency,
  readOnly,
}: {
  items: ProductView[];
  total: number;
  params: ListParams;
  tenantCurrency: CurrencyCode;
  readOnly: boolean;
}) {
  const router = useRouter();
  const [notice, setNotice] = useState<Notice>();

  const done = (next: Notice) => {
    setNotice(next);
    router.refresh();
  };

  const columns: ColumnDef<ProductView, unknown>[] = [
    {
      id: 'code',
      header: t.columns.code,
      cell: ({ row }) => <span className="font-medium whitespace-nowrap">{row.original.code}</span>,
    },
    { id: 'name', header: t.columns.name, cell: ({ row }) => row.original.name },
    { id: 'unit', header: t.columns.unit, cell: ({ row }) => row.original.unit },
    {
      id: 'category',
      header: t.columns.category,
      cell: ({ row }) => row.original.category ?? t.noValue,
    },
    {
      id: 'price',
      header: () => <div className="text-right">{t.columns.price}</div>,
      cell: ({ row }) => {
        const { referencePrice, currency } = row.original;
        return (
          <div className="text-right">
            {referencePrice && currency ? (
              <MoneyText amount={referencePrice} currency={currency} maxFractionDigits={4} />
            ) : (
              t.noValue
            )}
          </div>
        );
      },
    },
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
        const product = row.original;
        return (
          <div className="flex flex-wrap gap-2">
            <ProductDialog
              item={product}
              tenantCurrency={tenantCurrency}
              onDone={done}
              trigger={
                <Button
                  type="button"
                  variant="outline"
                  disabled={readOnly}
                  aria-label={`${t.actions.edit} ${product.code}`}
                >
                  {t.actions.edit}
                </Button>
              }
            />
            <SetActiveControl
              name={product.name}
              active={product.active}
              disabled={readOnly}
              setActive={(active) => setProductActiveAction({ id: product.id, active })}
              onDone={done}
            />
          </div>
        );
      },
    },
  ];

  return (
    <CatalogListView
      section="products"
      title={t.products.title}
      description={t.products.description}
      emptyTitle={t.products.emptyTitle}
      emptyDescription={t.products.emptyDescription}
      notice={notice}
      columns={columns}
      rows={items}
      total={total}
      params={params}
      actions={
        <>
          <ProductDialog
            tenantCurrency={tenantCurrency}
            onDone={done}
            trigger={
              <Button type="button" disabled={readOnly}>
                {t.products.new}
              </Button>
            }
          />
          <ImportButton />
        </>
      }
    />
  );
}
