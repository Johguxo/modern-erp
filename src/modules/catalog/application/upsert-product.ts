// Crear o actualizar un producto (catalog.manage). El código no se edita: con id se ignora.
import type { Ctx } from '@/shared/context';

import { upsertMaster } from './master-data';
import type { ProductDeps, ProductFields, ProductView } from './ports';

export interface UpsertProductInput extends ProductFields {
  readonly id?: string | undefined;
  readonly code: string;
}

const fieldsOf = (p: ProductView): ProductFields => ({
  name: p.name,
  unit: p.unit,
  category: p.category,
  referencePrice: p.referencePrice,
  currency: p.currency,
});

export function upsertProduct(
  ctx: Ctx,
  input: UpsertProductInput,
  deps: ProductDeps,
): Promise<{ item: ProductView; created: boolean; changed: boolean }> {
  const fields: ProductFields = {
    name: input.name,
    unit: input.unit,
    category: input.category,
    referencePrice: input.referencePrice,
    currency: input.currency,
  };
  return upsertMaster(
    ctx,
    { id: input.id, code: input.code, fields },
    { ...deps, repo: deps.products, entity: 'product' },
    fieldsOf,
  );
}
