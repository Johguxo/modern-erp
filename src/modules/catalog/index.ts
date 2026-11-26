// API pública del módulo catalog: productos, equipos, centros de costo y almacenes.
// Otros módulos y src/app solo importan desde aquí (ADR-001, regla 10).
export { createCatalogDeps, type CatalogExtras } from './infrastructure/deps';
export {
  createImportCreateDeps,
  createImportProcessDeps,
  createImportQueryDeps,
  createImportReadDeps,
  type ImportExtras,
} from './infrastructure/import-deps';
export { createImportJobHandler } from './infrastructure/import-job-handler';
export { defaultWarehouseSetupStep } from './infrastructure/default-warehouse-step';
export type {
  CatalogDeps,
  CostCenterDeps,
  CostCenterView,
  EquipmentDeps,
  EquipmentView,
  ProductDeps,
  ProductSearchItem,
  ProductView,
  StatusFilter,
  WarehouseDeps,
  WarehouseView,
} from './application/ports';
export { listProducts } from './application/list-products';
export { upsertProduct } from './application/upsert-product';
export { setProductActive } from './application/set-product-active';
export { searchProducts } from './application/search-products';
export { listEquipment } from './application/list-equipment';
export { upsertEquipment } from './application/upsert-equipment';
export { setEquipmentActive } from './application/set-equipment-active';
export { listCostCenters } from './application/list-cost-centers';
export { upsertCostCenter } from './application/upsert-cost-center';
export { setCostCenterActive } from './application/set-cost-center-active';
export { getDefaultWarehouse } from './application/get-default-warehouse';
export {
  getCatalogLabels,
  type CatalogLabel,
  type CatalogLabels,
  type CatalogLabelsInput,
} from './application/get-catalog-labels';
export {
  getCatalogRefs,
  type CatalogRefs,
  type CatalogRefsInput,
} from './application/get-catalog-refs';
export type {
  ImportCreateDeps,
  ImportJobStatus,
  ImportProcessDeps,
  ImportQueryDeps,
  ImportReadDeps,
} from './application/import-ports';
export { previewImport, type ImportPreview } from './application/preview-import';
export {
  readImportRows,
  type ImportFileInput,
  type ImportRowsInput,
} from './application/read-import-rows';
export { createImportJob } from './application/create-import-job';
export { getImportJob, type ImportJobView } from './application/get-import-job';
export { processImportJob, type ImportJobOutcome } from './application/process-import-job';
export {
  EQUIPMENT_COLUMNS,
  IMPORT_LIMITS,
  PRODUCT_COLUMNS,
  columnsOf,
  type ColumnSpec,
  type ImportKind,
} from './domain/import';
