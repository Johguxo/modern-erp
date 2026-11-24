// Fábrica de dependencias del catálogo (ADR-005): la entrega la arma con la transacción de
// withTenant y se la pasa a los casos de uso.
import type { DbExecutor } from '@/db';
import { createAuditLogFor } from '@/modules/identity';
import type { ClientInfo } from '@/shared/ports/client-info';

import type { CatalogDeps } from '../application/ports';

import { createDrizzleProductRepository } from './drizzle-product-repository';
import {
  createDrizzleCostCenterRepository,
  createDrizzleEquipmentRepository,
} from './drizzle-simple-repositories';
import { createDrizzleWarehouseRepository } from './drizzle-warehouse-repository';

/** Lo que la entrega aporta al catálogo (además de la transacción). */
export interface CatalogExtras {
  readonly client: ClientInfo;
}

export function createCatalogDeps(tx: DbExecutor, extras: CatalogExtras): CatalogDeps {
  return {
    products: createDrizzleProductRepository(tx),
    equipment: createDrizzleEquipmentRepository(tx),
    costCenters: createDrizzleCostCenterRepository(tx),
    warehouses: createDrizzleWarehouseRepository(tx),
    audit: createAuditLogFor(tx),
    client: extras.client,
  };
}
