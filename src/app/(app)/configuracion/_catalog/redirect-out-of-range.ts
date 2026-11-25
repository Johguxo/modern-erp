// Página fuera de rango (p. ej. ?page=9 con 2 páginas): lleva a la última conservando q/status.
// Solo redirige si la página pedida es mayor que la última, así que no puede entrar en bucle.
import type { Route } from 'next';
import { redirect } from 'next/navigation';

import { pageCountOf, type ListParams } from './list-params';

export function redirectIfOutOfRange(path: string, params: ListParams, total: number): void {
  const last = pageCountOf(total, params.pageSize);
  if (total === 0 || params.page <= last) return;
  const query = new URLSearchParams();
  if (params.q) query.set('q', params.q);
  if (params.status !== 'all') query.set('status', params.status);
  if (last > 1) query.set('page', String(last));
  const search = query.toString();
  redirect((search ? `${path}?${search}` : path) as Route);
}
