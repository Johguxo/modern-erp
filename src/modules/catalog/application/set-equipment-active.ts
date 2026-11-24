// Activar o desactivar un equipo (catalog.manage). No se borra.
import type { Ctx } from '@/shared/context';

import { setMasterActive } from './master-data';
import type { EquipmentDeps } from './ports';

export function setEquipmentActive(
  ctx: Ctx,
  input: { readonly id: string; readonly active: boolean },
  deps: EquipmentDeps,
): Promise<{ changed: boolean }> {
  return setMasterActive(ctx, input, { ...deps, repo: deps.equipment, entity: 'equipment' });
}
