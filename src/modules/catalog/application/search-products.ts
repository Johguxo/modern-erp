// Búsqueda de productos para el selector del SOF: solo activos, por código o nombre. El stock no
// va aquí: E6 lo combina desde fuera.
// Con `q` vacío no es un error: devuelve los primeros productos activos del tenant (por nombre y
// código), hasta el límite. Sirve para abrir el combobox (E2-H2, E3-H2) antes de que se escriba.
import type { Ctx } from '@/shared/context';

import { SEARCH_DEFAULT_LIMIT, SEARCH_MAX_LIMIT } from '../domain/search';

import { requireCatalogRead } from './master-data';
import type { ProductDeps, ProductSearchItem } from './ports';

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
