// Crear o actualizar un equipo (catalog.manage). El código no se edita: con id se ignora.
import type { Ctx } from '@/shared/context';

import { upsertMaster } from './master-data';
import type { EquipmentDeps, EquipmentFields, EquipmentView } from './ports';

export interface UpsertEquipmentInput extends EquipmentFields {
  readonly id?: string | undefined;
  readonly code: string;
}

const fieldsOf = (e: EquipmentView): EquipmentFields => ({ name: e.name, type: e.type });

export function upsertEquipment(
  ctx: Ctx,
  input: UpsertEquipmentInput,
  deps: EquipmentDeps,
): Promise<{ item: EquipmentView; created: boolean; changed: boolean }> {
  const fields: EquipmentFields = { name: input.name, type: input.type };
  return upsertMaster(
    ctx,
    { id: input.id, code: input.code, fields },
    { ...deps, repo: deps.equipment, entity: 'equipment' },
    fieldsOf,
  );
}
