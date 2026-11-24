// Listar productos con búsqueda, estado y paginación.
import type { Ctx } from '@/shared/context';
import type { Page } from '@/shared/pagination';

import { listMaster } from './master-data';
import type { ProductDeps, ProductView, StatusFilter } from './ports';

export interface ListProductsInput {
  readonly q: string | null;
  readonly status: StatusFilter;
  readonly page: number;
  readonly pageSize: number;
}

export function listProducts(
  ctx: Ctx,
  input: ListProductsInput,
  deps: Pick<ProductDeps, 'products'>,
): Promise<Page<ProductView>> {
  return listMaster(ctx, input, deps.products);
}
