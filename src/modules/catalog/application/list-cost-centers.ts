// Listar centros de costo con búsqueda, estado y paginación.
import type { Ctx } from '@/shared/context';
import type { Page } from '@/shared/pagination';

import { listMaster } from './master-data';
import type { CostCenterDeps, CostCenterView, StatusFilter } from './ports';

export interface ListCostCentersInput {
  readonly q: string | null;
  readonly status: StatusFilter;
  readonly page: number;
  readonly pageSize: number;
}

export function listCostCenters(
  ctx: Ctx,
  input: ListCostCentersInput,
  deps: Pick<CostCenterDeps, 'costCenters'>,
): Promise<Page<CostCenterView>> {
  return listMaster(ctx, input, deps.costCenters);
}
