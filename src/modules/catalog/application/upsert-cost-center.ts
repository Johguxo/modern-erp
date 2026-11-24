// Crear o actualizar un centro de costo (catalog.manage). El código no se edita: con id se ignora.
import type { Ctx } from '@/shared/context';

import { upsertMaster } from './master-data';
import type { CostCenterDeps, CostCenterFields, CostCenterView } from './ports';

export interface UpsertCostCenterInput extends CostCenterFields {
  readonly id?: string | undefined;
  readonly code: string;
}

const fieldsOf = (c: CostCenterView): CostCenterFields => ({ name: c.name });

export function upsertCostCenter(
  ctx: Ctx,
  input: UpsertCostCenterInput,
  deps: CostCenterDeps,
): Promise<{ item: CostCenterView; created: boolean; changed: boolean }> {
  const fields: CostCenterFields = { name: input.name };
  return upsertMaster(
    ctx,
    { id: input.id, code: input.code, fields },
    { ...deps, repo: deps.costCenters, entity: 'cost_center' },
    fieldsOf,
  );
}
