// Puertos del catálogo (E2-H1). Las implementaciones Drizzle (infrastructure/) usan la transacción
// de withTenant (RLS) y además filtran SIEMPRE por tenantId (primera defensa).
import type { AuditLog } from '@/modules/identity';
import type { ClientInfo } from '@/shared/ports/client-info';

import type { Currency } from '../domain/money';

export type StatusFilter = 'active' | 'inactive' | 'all';

export interface ListFilter {
  /** Texto en código o nombre; null = sin filtro. */
  readonly q: string | null;
  readonly status: StatusFilter;
}

export interface PageRequest {
  readonly page: number;
  readonly pageSize: number;
}

/** Lo común a productos, equipos y centros de costo. */
export interface MasterView {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly active: boolean;
}

/** Repositorio de un dato maestro. `F` son los campos editables (sin código ni estado). */
export interface MasterRepository<V extends MasterView, F extends object> {
  list(
    tenantId: string,
    filter: ListFilter,
    page: PageRequest,
  ): Promise<{ items: V[]; total: number }>;
  /** SELECT … FOR UPDATE: lee el "antes" sin carreras. */
  lockById(tenantId: string, id: string): Promise<V | null>;
  /** ConflictError code_taken si el código ya existe en el tenant (sin importar mayúsculas). */
  create(tenantId: string, input: F & { readonly code: string }): Promise<V>;
  update(tenantId: string, id: string, fields: F): Promise<V>;
  setActive(tenantId: string, id: string, active: boolean): Promise<void>;
}

export interface ProductFields {
  readonly name: string;
  readonly unit: string;
  readonly category: string | null;
  /** Texto con 4 decimales; null junto con currency. */
  readonly referencePrice: string | null;
  readonly currency: Currency | null;
}

export interface ProductView extends MasterView, ProductFields {}

export interface EquipmentFields {
  readonly name: string;
  readonly type: string | null;
}

export interface EquipmentView extends MasterView, EquipmentFields {}

export interface CostCenterFields {
  readonly name: string;
}

export interface CostCenterView extends MasterView, CostCenterFields {}

export interface ProductSearchItem {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly unit: string;
  readonly category: string | null;
  readonly referencePrice: string | null;
  readonly currency: Currency | null;
}

export interface ProductRepository extends MasterRepository<ProductView, ProductFields> {
  /** Solo activos; ordena código exacto, prefijo y nombre. Con `q` vacío devuelve los primeros activos. */
  search(tenantId: string, q: string, limit: number): Promise<ProductSearchItem[]>;
}

export interface WarehouseView {
  readonly id: string;
  readonly code: string;
  readonly name: string;
}

export interface WarehouseRepository {
  findDefault(tenantId: string): Promise<WarehouseView | null>;
}

interface AuditDeps {
  readonly audit: AuditLog;
  readonly client: ClientInfo;
}

export interface ProductDeps extends AuditDeps {
  readonly products: ProductRepository;
}
export interface EquipmentDeps extends AuditDeps {
  readonly equipment: MasterRepository<EquipmentView, EquipmentFields>;
}
export interface CostCenterDeps extends AuditDeps {
  readonly costCenters: MasterRepository<CostCenterView, CostCenterFields>;
}
export interface WarehouseDeps {
  readonly warehouses: WarehouseRepository;
}

/** Todo lo que arma la entrega para el catálogo, sobre la transacción de withTenant. */
export type CatalogDeps = ProductDeps & EquipmentDeps & CostCenterDeps & WarehouseDeps;
