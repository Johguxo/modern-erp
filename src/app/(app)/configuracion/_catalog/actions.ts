'use server';

// Acciones del catálogo (E2-H2): validan con los contratos de catalog y llaman al caso de uso.
// Todas exigen catalog.manage y son de escritura (no pasan en solo lectura).
import {
  createCatalogDeps,
  setCostCenterActive,
  setEquipmentActive,
  setProductActive,
  upsertCostCenter,
  upsertEquipment,
  upsertProduct,
} from '@/modules/catalog';
import {
  setCostCenterActiveContract,
  setEquipmentActiveContract,
  setProductActiveContract,
  upsertCostCenterContract,
  upsertEquipmentContract,
  upsertProductContract,
} from '@/modules/catalog/contracts';

import { action } from '../../../_lib/action';
import { catalogExtras } from '../../../_lib/catalog';

export const upsertProductAction = action(
  upsertProductContract,
  'catalog.manage',
  ({ ctx, input, tx, shared }) =>
    upsertProduct(ctx, input, createCatalogDeps(tx, catalogExtras(shared))),
  { name: 'catalog.upsertProduct' },
);

export const setProductActiveAction = action(
  setProductActiveContract,
  'catalog.manage',
  ({ ctx, input, tx, shared }) =>
    setProductActive(ctx, input, createCatalogDeps(tx, catalogExtras(shared))),
  { name: 'catalog.setProductActive' },
);

export const upsertEquipmentAction = action(
  upsertEquipmentContract,
  'catalog.manage',
  ({ ctx, input, tx, shared }) =>
    upsertEquipment(ctx, input, createCatalogDeps(tx, catalogExtras(shared))),
  { name: 'catalog.upsertEquipment' },
);

export const setEquipmentActiveAction = action(
  setEquipmentActiveContract,
  'catalog.manage',
  ({ ctx, input, tx, shared }) =>
    setEquipmentActive(ctx, input, createCatalogDeps(tx, catalogExtras(shared))),
  { name: 'catalog.setEquipmentActive' },
);

export const upsertCostCenterAction = action(
  upsertCostCenterContract,
  'catalog.manage',
  ({ ctx, input, tx, shared }) =>
    upsertCostCenter(ctx, input, createCatalogDeps(tx, catalogExtras(shared))),
  { name: 'catalog.upsertCostCenter' },
);

export const setCostCenterActiveAction = action(
  setCostCenterActiveContract,
  'catalog.manage',
  ({ ctx, input, tx, shared }) =>
    setCostCenterActive(ctx, input, createCatalogDeps(tx, catalogExtras(shared))),
  { name: 'catalog.setCostCenterActive' },
);
