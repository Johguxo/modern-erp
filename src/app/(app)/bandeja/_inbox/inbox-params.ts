// Parámetros de la bandeja (?tab=&q=&page=). Se validan con el contrato del caso de uso; si no son
// válidos se usan los valores por defecto (nunca un 500 por una URL rara). Todo vive en la URL.
import type { Route } from 'next';

import {
  listRequestsContract,
  DEFAULT_INBOX_TAB,
  type InboxTab,
} from '@/modules/requests/contracts';

export const INBOX_PATH = '/bandeja';
export const INBOX_PAGE_SIZE = 25;

export interface InboxParams {
  readonly tab: InboxTab;
  readonly q: string | null;
  readonly page: number;
  readonly pageSize: number;
}

export const DEFAULT_INBOX_PARAMS: InboxParams = {
  tab: DEFAULT_INBOX_TAB,
  q: null,
  page: 1,
  pageSize: INBOX_PAGE_SIZE,
};

type RawSearchParams = Readonly<Record<string, string | string[] | undefined>>;

const first = (value: string | string[] | undefined): string | undefined =>
  Array.isArray(value) ? value[0] : value;

export function parseInboxParams(searchParams: RawSearchParams): InboxParams {
  const parsed = listRequestsContract.inputSchema.safeParse({
    tab: first(searchParams.tab),
    q: first(searchParams.q),
    page: first(searchParams.page),
    pageSize: INBOX_PAGE_SIZE,
  });
  if (!parsed.success) return DEFAULT_INBOX_PARAMS;
  return { ...parsed.data, pageSize: INBOX_PAGE_SIZE };
}

export function pageCountOf(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(total / pageSize));
}

/** Sin búsqueda y en «Todas»: si no hay solicitudes, es el vacío de la bandeja. */
export function isPristine(params: Pick<InboxParams, 'tab' | 'q'>): boolean {
  return params.tab === DEFAULT_INBOX_TAB && params.q === null;
}

/** URL de la bandeja con solo lo que se aparta del valor por defecto. */
export function inboxHref(params: { tab?: InboxTab; q?: string | null; page?: number }): Route {
  const query = new URLSearchParams();
  if (params.tab && params.tab !== DEFAULT_INBOX_TAB) query.set('tab', params.tab);
  if (params.q) query.set('q', params.q);
  if (params.page && params.page > 1) query.set('page', String(params.page));
  const search = query.toString();
  return search ? `${INBOX_PATH}?${search}` : INBOX_PATH;
}
