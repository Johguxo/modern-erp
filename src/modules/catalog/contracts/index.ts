// Contratos públicos de catalog: entrada segura para el cliente (solo Zod, sin base de datos).
// Se importa como @/modules/catalog/contracts (ADR-001 §10).
export * as listProductsContract from './list-products';
export * as upsertProductContract from './upsert-product';
export * as setProductActiveContract from './set-product-active';
export * as listEquipmentContract from './list-equipment';
export * as upsertEquipmentContract from './upsert-equipment';
export * as setEquipmentActiveContract from './set-equipment-active';
export * as listCostCentersContract from './list-cost-centers';
export * as upsertCostCenterContract from './upsert-cost-center';
export * as setCostCenterActiveContract from './set-cost-center-active';
export * as searchProductsContract from './search-products';
export * as getDefaultWarehouseContract from './get-default-warehouse';
export * as previewImportContract from './preview-import';
export * as confirmImportContract from './confirm-import';
export * as getImportJobContract from './get-import-job';
export {
  IMPORT_STATUSES,
  importKindSchema,
  rowErrorSchema,
  importSummarySchema,
  type ImportSummary,
  type RowError,
} from './import';
export { IMPORT_KINDS, type ImportKind } from '../domain/import';
export { STATUS_FILTERS } from './shared';
export { CODE_MAX } from '../domain/codes';
export { CURRENCIES } from '../domain/money';
