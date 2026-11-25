// Fábricas de dependencias de la importación (E2-H3), sobre la transacción de withTenant.
import type { DbExecutor } from '@/db';
import { createAuditLogFor, createTenantCurrencyFor } from '@/modules/identity';
import type { AfterCommit } from '@/shared/ports/after-commit';
import type { ClientInfo } from '@/shared/ports/client-info';
import type { Clock } from '@/shared/ports/clock';
import type { JobQueue } from '@/shared/ports/job-queue';
import type { SpreadsheetReader } from '@/shared/ports/spreadsheet';

import type {
  ImportCreateDeps,
  ImportProcessDeps,
  ImportQueryDeps,
  ImportReadDeps,
} from '../application/import-ports';

import {
  createDrizzleEquipmentBulkUpsert,
  createDrizzleProductBulkUpsert,
} from './drizzle-bulk-upsert';
import { createDrizzleImportJobRepository } from './drizzle-import-job-repository';

/** Lo que la entrega aporta a la importación de la web (además de la transacción). */
export interface ImportExtras {
  readonly client: ClientInfo;
  readonly reader: SpreadsheetReader;
  readonly queue: JobQueue;
  readonly afterCommit: AfterCommit;
}

/** Vista previa: solo leer el archivo y la moneda de la empresa. */
export function createImportReadDeps(
  tx: DbExecutor,
  extras: Pick<ImportExtras, 'reader'>,
): ImportReadDeps {
  return { reader: extras.reader, tenantCurrency: createTenantCurrencyFor(tx) };
}

/** Confirmar: leer, guardar el trabajo, encolar después del commit. */
export function createImportCreateDeps(tx: DbExecutor, extras: ImportExtras): ImportCreateDeps {
  return {
    ...createImportReadDeps(tx, extras),
    importJobs: createDrizzleImportJobRepository(tx),
    audit: createAuditLogFor(tx),
    client: extras.client,
    queue: extras.queue,
    afterCommit: extras.afterCommit,
  };
}

/** Estado de un trabajo. */
export function createImportQueryDeps(tx: DbExecutor, extras: { clock: Clock }): ImportQueryDeps {
  return { importJobs: createDrizzleImportJobRepository(tx), clock: extras.clock };
}

/** Worker: upsert y cierre del trabajo en la misma transacción. */
export function createImportProcessDeps(
  tx: DbExecutor,
  extras: { client: ClientInfo },
): ImportProcessDeps {
  return {
    importJobs: createDrizzleImportJobRepository(tx),
    products: createDrizzleProductBulkUpsert(tx),
    equipment: createDrizzleEquipmentBulkUpsert(tx),
    audit: createAuditLogFor(tx),
    client: extras.client,
  };
}
