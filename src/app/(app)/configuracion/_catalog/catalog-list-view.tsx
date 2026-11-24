'use client';

// Vista común de las tres listas del catálogo: encabezado, pestañas, aviso, filtros y tabla.
// El vacío (sin registros y sin filtros) muestra el EmptyState con las acciones; si hay filtros
// o registros, se muestran los filtros y la tabla con «Sin resultados».
import type { ColumnDef } from '@tanstack/react-table';
import type { ReactNode } from 'react';

import { DataTable } from '@/ui/base/data-table';
import { EmptyState } from '@/ui/base/empty-state';
import { PageHeader } from '@/ui/base/page-header';
import { FormError } from '@/ui/forms/form-error';
import { messages } from '@/ui/messages/es-PE';

import { CatalogFilters } from './catalog-filters';
import { CatalogTabs, type CatalogSection } from './catalog-tabs';
import { isPristine, pageCountOf, type ListParams } from './list-params';

export type Notice = { readonly tone: 'success' | 'warning'; readonly text: string };

export function NoticeBanner({ notice }: { notice: Notice | undefined }) {
  if (!notice) return null;
  if (notice.tone === 'warning') return <FormError className="mb-4" message={notice.text} />;
  return (
    <p
      role="status"
      className="mb-4 rounded-md border border-border bg-surface px-3 py-2 text-foreground"
    >
      {notice.text}
    </p>
  );
}

export function CatalogListView<T>({
  section,
  title,
  description,
  emptyTitle,
  emptyDescription,
  actions,
  notice,
  columns,
  rows,
  total,
  params,
}: {
  section: CatalogSection;
  title: string;
  description: string;
  emptyTitle: string;
  emptyDescription: string;
  /** Crear (y, si aplica, importar): van en el encabezado, o en el vacío cuando no hay datos. */
  actions: ReactNode;
  notice: Notice | undefined;
  columns: ColumnDef<T, unknown>[];
  rows: T[];
  total: number;
  params: ListParams;
}) {
  const showEmpty = total === 0 && isPristine(params);
  return (
    <>
      <PageHeader title={title} description={description} actions={showEmpty ? null : actions} />
      <CatalogTabs active={section} />
      <NoticeBanner notice={notice} />
      {showEmpty ? (
        <EmptyState
          title={emptyTitle}
          description={emptyDescription}
          action={<div className="flex flex-wrap items-center justify-center gap-3">{actions}</div>}
        />
      ) : (
        <>
          <CatalogFilters params={params} />
          <DataTable
            columns={columns}
            data={rows}
            page={params.page}
            pageCount={pageCountOf(total, params.pageSize)}
            emptyState={
              <EmptyState
                className="rounded-none border-0"
                title={messages.catalog.noResultsTitle}
                description={messages.catalog.noResultsDescription}
              />
            }
          />
        </>
      )}
    </>
  );
}
