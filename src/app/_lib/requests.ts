// Composición de requests (E3-H1): lo que la entrega aporta a createRequestsDeps y a la consola.
import {
  createPlatformSequenceDeps,
  type PlatformSequenceDeps,
  type RequestsExtras,
} from '@/modules/requests';
import { systemClock } from '@/shared/adapters/system-clock';
import { UNKNOWN_CLIENT } from '@/shared/ports/client-info';

import type { SharedDeps } from './pipeline';

export function requestsExtras(shared: SharedDeps): RequestsExtras {
  return { client: shared.client, clock: shared.clock };
}

/** Para lecturas desde Server Components (sin cliente HTTP real que auditar). */
export function readOnlyRequestsExtras(): RequestsExtras {
  return { client: UNKNOWN_CLIENT, clock: systemClock };
}

/** Secuencia SOF de un cliente en la consola: conexión dueño acotada (ADR-007). */
export function platformSequenceDeps(shared: SharedDeps): PlatformSequenceDeps {
  return createPlatformSequenceDeps({ client: shared.client });
}

/** Lectura en una página de la consola (sin auditoría). */
export function readOnlyPlatformSequenceDeps(): PlatformSequenceDeps {
  return createPlatformSequenceDeps({ client: UNKNOWN_CLIENT });
}
