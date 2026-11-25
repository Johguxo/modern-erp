// Parámetros de las listas del catálogo (?q=&status=&page=). Se validan con el contrato de lista
// del módulo; si no son válidos se usan los valores por defecto (nunca un 500 por una URL rara).
import { listProductsContract } from '@/modules/catalog/contracts';
import type { StatusFilter } from '@/modules/catalog';

export const CATALOG_PAGE_SIZE = 25;

export interface ListParams {
  readonly q: string | null;
  readonly status: StatusFilter;
  readonly page: number;
  readonly pageSize: number;
}

export const DEFAULT_LIST_PARAMS: ListParams = {
  q: null,
  status: 'all',
  page: 1,
  pageSize: CATALOG_PAGE_SIZE,
};

type RawSearchParams = Readonly<Record<string, string | string[] | undefined>>;

const first = (value: string | string[] | undefined): string | undefined =>
  Array.isArray(value) ? value[0] : value;

// Los contratos de lista de productos, equipos y centros de costo comparten el mismo esquema.
export function parseListParams(searchParams: RawSearchParams): ListParams {
  const parsed = listProductsContract.inputSchema.safeParse({
    q: first(searchParams.q),
    status: first(searchParams.status),
    page: first(searchParams.page),
    pageSize: CATALOG_PAGE_SIZE,
  });
  if (!parsed.success) return DEFAULT_LIST_PARAMS;
  return { ...parsed.data, pageSize: CATALOG_PAGE_SIZE };
}

export function pageCountOf(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(total / pageSize));
}

/** Sin búsqueda ni filtro de estado: si no hay registros, es el vacío del catálogo. */
export function isPristine(params: Pick<ListParams, 'q' | 'status'>): boolean {
  return params.q === null && params.status === 'all';
}
