// Listar equipos con búsqueda, estado y paginación.
import type { Ctx } from '@/shared/context';
import type { Page } from '@/shared/pagination';

import { listMaster } from './master-data';
import type { EquipmentDeps, EquipmentView, StatusFilter } from './ports';

export interface ListEquipmentInput {
  readonly q: string | null;
  readonly status: StatusFilter;
  readonly page: number;
  readonly pageSize: number;
}

export function listEquipment(
  ctx: Ctx,
  input: ListEquipmentInput,
  deps: Pick<EquipmentDeps, 'equipment'>,
): Promise<Page<EquipmentView>> {
  return listMaster(ctx, input, deps.equipment);
}
