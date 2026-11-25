// Composición del catálogo (E2-H2): lo que la entrega aporta a createCatalogDeps.
import type { CatalogExtras } from '@/modules/catalog';
import { UNKNOWN_CLIENT } from '@/shared/ports/client-info';

import type { SharedDeps } from './pipeline';

export function catalogExtras(shared: SharedDeps): CatalogExtras {
  return { client: shared.client };
}

/** Para lecturas desde Server Components (sin cliente HTTP real que auditar). */
export function readOnlyCatalogExtras(): CatalogExtras {
  return { client: UNKNOWN_CLIENT };
}
