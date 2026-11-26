// Rótulos de equipos y centros de costo por id (activos o no) para mostrar en listados de otros
// módulos (la bandeja de requests). Solo lectura: basta cualquier permiso de solicitudes o de
// catálogo, porque quien solo lee solicitudes también debe ver a qué equipo o área pertenecen.
import { requireAnyPermission } from '@/shared/authorization';
import type { Ctx } from '@/shared/context';

import type { CostCenterDeps, EquipmentDeps } from './ports';

export interface CatalogLabelsInput {
  readonly equipmentIds: readonly string[];
  readonly costCenterIds: readonly string[];
}

export interface CatalogLabel {
  readonly id: string;
  readonly code: string;
  readonly name: string;
}

export interface CatalogLabels {
  readonly equipment: CatalogLabel[];
  readonly costCenters: CatalogLabel[];
}

const unique = (ids: readonly string[]): string[] => [...new Set(ids)];
const toLabel = ({ id, code, name }: CatalogLabel): CatalogLabel => ({ id, code, name });

export async function getCatalogLabels(
  ctx: Ctx,
  input: CatalogLabelsInput,
  deps: Pick<EquipmentDeps, 'equipment'> & Pick<CostCenterDeps, 'costCenters'>,
): Promise<CatalogLabels> {
  requireAnyPermission(ctx, [
    'catalog.manage',
    'requests.create',
    'requests.read_own',
    'requests.read_all',
  ]);
  const [equipment, costCenters] = await Promise.all([
    deps.equipment.findByIds(ctx.tenantId, unique(input.equipmentIds)),
    deps.costCenters.findByIds(ctx.tenantId, unique(input.costCenterIds)),
  ]);
  return { equipment: equipment.map(toLabel), costCenters: costCenters.map(toLabel) };
}
