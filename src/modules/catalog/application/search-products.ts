// Búsqueda de productos para el selector del SOF: solo activos, por código o nombre. El stock no
// va aquí: E6 lo combina desde fuera.
import type { Ctx } from '@/shared/context';

import { requireCatalogRead } from './master-data';
import type { ProductDeps, ProductSearchItem } from './ports';

export const SEARCH_DEFAULT_LIMIT = 20;
export const SEARCH_MAX_LIMIT = 50;

export async function searchProducts(
  ctx: Ctx,
  input: { readonly q: string; readonly limit?: number | undefined },
  deps: Pick<ProductDeps, 'products'>,
): Promise<{ items: ProductSearchItem[] }> {
  requireCatalogRead(ctx);
  const limit = Math.min(Math.max(input.limit ?? SEARCH_DEFAULT_LIMIT, 1), SEARCH_MAX_LIMIT);
  const items = await deps.products.search(ctx.tenantId, input.q.trim(), limit);
  return { items };
}
