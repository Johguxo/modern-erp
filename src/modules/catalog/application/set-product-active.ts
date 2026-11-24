// Activar o desactivar un producto (catalog.manage). No se borra.
import type { Ctx } from '@/shared/context';

import { setMasterActive } from './master-data';
import type { ProductDeps } from './ports';

export function setProductActive(
  ctx: Ctx,
  input: { readonly id: string; readonly active: boolean },
  deps: ProductDeps,
): Promise<{ changed: boolean }> {
  return setMasterActive(ctx, input, { ...deps, repo: deps.products, entity: 'product' });
}
