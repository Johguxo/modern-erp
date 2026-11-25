// Composición del catálogo (E2-H2): lo que la entrega aporta a createCatalogDeps.
import type { CatalogExtras, ImportExtras } from '@/modules/catalog';
import { UNKNOWN_CLIENT } from '@/shared/ports/client-info';

import { getJobQueue } from './job-queue';
import type { SharedDeps } from './pipeline';
import { getSpreadsheetReader } from './spreadsheet';

export function catalogExtras(shared: SharedDeps): CatalogExtras {
  return { client: shared.client };
}

/** Para lecturas desde Server Components (sin cliente HTTP real que auditar). */
export function readOnlyCatalogExtras(): CatalogExtras {
  return { client: UNKNOWN_CLIENT };
}

/** Importación desde Excel/CSV (E2-H3): lector de archivos, cola de jobs y tareas tras el commit. */
export function importExtras(shared: SharedDeps): ImportExtras {
  return {
    client: shared.client,
    reader: getSpreadsheetReader(),
    queue: getJobQueue(),
    afterCommit: shared.afterCommit,
  };
}
