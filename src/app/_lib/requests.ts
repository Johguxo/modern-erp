// Composición de requests y approvals (E3-H1, E4-H2, ADR-008): lo que la entrega aporta a
// createRequestsDeps y a la consola. Es el único lugar que une los dos módulos: requests define los
// puertos y el motor de approvals los implementa por estructura (sin importarse entre sí).
import type { DbExecutor } from '@/db';
import { createApprovalEngine } from '@/modules/approvals';
import {
  createPlatformSequenceDeps,
  type PlatformSequenceDeps,
  type RequestsExtras,
} from '@/modules/requests';
import { getLogger } from '@/shared/adapters/pino-logger';
import { systemClock } from '@/shared/adapters/system-clock';
import { UNKNOWN_CLIENT } from '@/shared/ports/client-info';

import type { SharedDeps } from './pipeline';

/** Extras de requests con el motor de aprobaciones conectado a la transacción `tx`. */
export function requestsExtras(
  shared: SharedDeps,
  tx: DbExecutor,
): RequestsExtras & Required<Pick<RequestsExtras, 'assignments'>> {
  const engine = createApprovalEngine(tx, { clock: shared.clock, logger: shared.logger });
  return {
    client: shared.client,
    clock: shared.clock,
    approvals: engine.starter,
    canceller: engine.canceller,
    assignments: engine.assignments,
    decider: engine.decider,
    history: engine.history,
  };
}

/** Para lecturas desde Server Components (sin cliente HTTP real que auditar). */
export function readOnlyRequestsExtras(
  tx: DbExecutor,
): RequestsExtras & Required<Pick<RequestsExtras, 'assignments'>> {
  const engine = createApprovalEngine(tx, { clock: systemClock, logger: getLogger() });
  return {
    client: UNKNOWN_CLIENT,
    clock: systemClock,
    approvals: engine.starter,
    canceller: engine.canceller,
    assignments: engine.assignments,
    decider: engine.decider,
    history: engine.history,
  };
}

/** Secuencia SOF de un cliente en la consola: conexión dueño acotada (ADR-007). */
export function platformSequenceDeps(shared: SharedDeps): PlatformSequenceDeps {
  return createPlatformSequenceDeps({ client: shared.client });
}

/** Lectura en una página de la consola (sin auditoría). */
export function readOnlyPlatformSequenceDeps(): PlatformSequenceDeps {
  return createPlatformSequenceDeps({ client: UNKNOWN_CLIENT });
}
