'use client';

// Tabla genérica con TanStack Table y paginación del servidor (?page=). Las columnas son
// funciones: cada tabla concreta (por ejemplo, RequestsTable en E3-H3) es un componente de
// cliente que define sus columnas y usa este componente.
// Accesibilidad: el clic en la fila es solo un atajo de mouse. La columna principal (por ejemplo,
// el N°) debe renderizar un <Link> al mismo destino para teclado y lectores de pantalla.
// useSearchParams: si una página que la usa se prerenderiza, envuélvela en <Suspense>.
import { flexRender, getCoreRowModel, useReactTable, type ColumnDef } from '@tanstack/react-table';
import type { Route } from 'next';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { ReactNode } from 'react';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/ui/components/table';
import { cn } from '@/ui/lib/utils';
import { messages } from '@/ui/messages/es-PE';

export interface DataTableProps<T> {
  columns: ColumnDef<T, unknown>[];
  data: T[];
  /** Destino al hacer clic en una fila (atajo de mouse; ver la nota de accesibilidad). */
  getRowHref?: (row: T) => Route;
  /** Clases del contenedor (por ejemplo, para quitar el borde dentro de otra tarjeta). */
  className?: string;
  /** Lo que se muestra cuando no hay filas. */
  emptyState?: ReactNode;
  /** Página actual (1 = primera) y total de páginas, calculados en el servidor. */
  page?: number;
  pageCount?: number;
}

export function pageHref(pathname: string, params: URLSearchParams, page: number): Route {
  const next = new URLSearchParams(params);
  next.set('page', String(page));
  // La ruta es la actual (ya validada por Next); solo cambia la query.
  return `${pathname}?${next.toString()}` as Route;
}

export function DataTable<T>({
  columns,
  data,
  getRowHref,
  emptyState,
  page = 1,
  pageCount = 1,
  className,
}: DataTableProps<T>) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // TanStack Table devuelve funciones no memoizables: es el uso documentado de la librería.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    pageCount,
  });

  const rows = table.getRowModel().rows;

  return (
    <div className={cn('overflow-hidden rounded-xl border border-border bg-surface', className)}>
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((group) => (
            <TableRow key={group.id}>
              {group.headers.map((header) => (
                <TableHead key={header.id} className="text-muted-foreground">
                  {header.isPlaceholder
                    ? null
                    : flexRender(header.column.columnDef.header, header.getContext())}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={columns.length} className="p-0">
                {emptyState ?? (
                  <p className="py-10 text-center text-muted-foreground">
                    {messages.dataTable.noResults}
                  </p>
                )}
              </TableCell>
            </TableRow>
          ) : (
            rows.map((row) => {
              const href = getRowHref?.(row.original);
              return (
                <TableRow
                  key={row.id}
                  className={cn('border-row-divider', href && 'cursor-pointer')}
                  onClick={href ? () => router.push(href) : undefined}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
      {pageCount > 1 ? (
        <nav
          aria-label={messages.dataTable.pagination}
          className="flex items-center justify-between gap-2 border-t border-border px-4 py-3"
        >
          <span className="text-muted-foreground">{messages.dataTable.page(page, pageCount)}</span>
          <div className="flex gap-2">
            {page > 1 ? (
              <Link
                className="inline-flex h-11 items-center rounded-md border border-border-strong px-4"
                href={pageHref(pathname, searchParams, page - 1)}
              >
                {messages.dataTable.previous}
              </Link>
            ) : null}
            {page < pageCount ? (
              <Link
                className="inline-flex h-11 items-center rounded-md border border-border-strong px-4"
                href={pageHref(pathname, searchParams, page + 1)}
              >
                {messages.dataTable.next}
              </Link>
            ) : null}
          </div>
        </nav>
      ) : null}
    </div>
  );
}
