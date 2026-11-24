// Activar o desactivar un centro de costo (catalog.manage). No se borra.
import type { Ctx } from '@/shared/context';

import { setMasterActive } from './master-data';
import type { CostCenterDeps } from './ports';

export function setCostCenterActive(
  ctx: Ctx,
  input: { readonly id: string; readonly active: boolean },
  deps: CostCenterDeps,
): Promise<{ changed: boolean }> {
  return setMasterActive(ctx, input, { ...deps, repo: deps.costCenters, entity: 'cost_center' });
}
