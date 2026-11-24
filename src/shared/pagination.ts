// Paginación por página para listados (E2 y E3). Contrato de entrada y tipo de salida comunes.
import { z } from 'zod';

export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 100;

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
});

export type Pagination = z.output<typeof paginationSchema>;

export interface Page<T> {
  readonly items: readonly T[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
}

/** Filas a saltar para llegar a la página (página 1 = 0). */
export function offsetOf(pagination: Pagination): number {
  return (pagination.page - 1) * pagination.pageSize;
}
