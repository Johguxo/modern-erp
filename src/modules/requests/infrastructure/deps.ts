// Fábricas de dependencias de requests (ADR-005): la entrega las arma con la transacción de
// withTenant (o getDbAdmin en la consola) y se las pasa a los casos de uso.
import type { DbExecutor } from '@/db';
import { getDbAdmin } from '@/db/admin';
import type { CatalogExtras } from '@/modules/catalog';
import { createAuditLogFor, createTenantCurrencyFor } from '@/modules/identity';
import type { ClientInfo } from '@/shared/ports/client-info';
import type { Clock } from '@/shared/ports/clock';

import type {
  ApprovalAssignments,
  ApprovalCanceller,
  ApprovalDecider,
  ApprovalStarter,
  ApprovalTimeline,
  GetRequestDeps,
  GetRequestDetailDeps,
  ListRequestsDeps,
  PlatformSequenceDeps,
  RequestsDeps,
  SequenceDeps,
} from '../application/ports';

import { createCatalogLookup } from './catalog-lookup';
import { createDrizzleDocumentSequenceRepository } from './drizzle-document-sequence-repository';
import { createDrizzleRequestQueryRepository } from './drizzle-request-query-repository';
import { createDrizzleRequestRepository } from './drizzle-request-repository';
import { createDrizzleRequestsPlatformStore } from './drizzle-requests-platform-store';
import { noopApprovalAssignments } from './noop-approval-assignments';
import { noopApprovalCanceller } from './noop-approval-canceller';
import { noopApprovalStarter } from './noop-approval-starter';
import { unavailableApprovalDecider } from './unavailable-approval-decider';
import { createRequestLabels } from './request-labels';

/** Lo que la entrega aporta a requests (además de la transacción). */
export interface RequestsExtras {
  readonly client: ClientInfo;
  readonly clock: Clock;
  /**
   * El motor de aprobaciones (E4-H2) conectado por la entrega. Los valores por omisión no hacen nada
   * y solo sirven para pruebas: un envío sin `approvals` no crea instancia.
   */
  readonly approvals?: ApprovalStarter;
  readonly canceller?: ApprovalCanceller;
  readonly assignments?: ApprovalAssignments;
  readonly decider?: ApprovalDecider;
  readonly timeline?: ApprovalTimeline;
}

export function createRequestsDeps(tx: DbExecutor, extras: RequestsExtras): RequestsDeps {
  const catalogExtras: CatalogExtras = { client: extras.client };
  const currencyOf = createTenantCurrencyFor(tx);
  return {
    requests: createDrizzleRequestRepository(tx),
    sequences: createDrizzleDocumentSequenceRepository(tx),
    catalog: createCatalogLookup(tx, catalogExtras),
    currency: { currencyOf },
    approvals: extras.approvals ?? noopApprovalStarter,
    assignments: extras.assignments ?? noopApprovalAssignments,
    canceller: extras.canceller ?? noopApprovalCanceller,
    decider: extras.decider ?? unavailableApprovalDecider,
    audit: createAuditLogFor(tx),
    client: extras.client,
    clock: extras.clock,
  };
}

/** Solo la secuencia de numeración (configuración de la empresa): sin catálogo ni reloj. */
export function createSequenceDeps(
  tx: DbExecutor,
  extras: { readonly client: ClientInfo },
): SequenceDeps {
  return {
    sequences: createDrizzleDocumentSequenceRepository(tx),
    audit: createAuditLogFor(tx),
    client: extras.client,
  };
}

/** Lectura de una solicitud (sin auditoría ni reloj). */
export function createGetRequestDeps(
  tx: DbExecutor,
  extras: { readonly assignments: ApprovalAssignments },
): GetRequestDeps {
  return {
    requests: createDrizzleRequestRepository(tx),
    assignments: extras.assignments,
  };
}

/** Detalle del SOF (E3-H4): la lectura de una solicitud más los nombres resueltos en lote. */
export function createGetRequestDetailDeps(
  tx: DbExecutor,
  extras: Pick<RequestsExtras, 'client'> & {
    readonly assignments: ApprovalAssignments;
    readonly timeline: ApprovalTimeline;
  },
): GetRequestDetailDeps {
  return {
    ...createGetRequestDeps(tx, extras),
    labels: createRequestLabels(tx, { client: extras.client }),
    timeline: extras.timeline,
  };
}

/** Bandeja (E3-H3): consulta sobre `requests` y nombres resueltos en lote desde identity/catalog. */
export function createListRequestsDeps(
  tx: DbExecutor,
  extras: Pick<RequestsExtras, 'client' | 'clock'> & {
    readonly assignments: ApprovalAssignments;
  },
): ListRequestsDeps {
  return {
    queries: createDrizzleRequestQueryRepository(tx),
    assignments: extras.assignments,
    labels: createRequestLabels(tx, { client: extras.client }),
    clock: extras.clock,
  };
}

/**
 * Consola de plataforma (ADR-007): store sobre la conexión dueño. La entrega nunca recibe la
 * conexión; los casos de uso revisan SuperAdmin dentro de su transacción y auditan.
 */
export function createPlatformSequenceDeps(
  extras: { readonly client: ClientInfo },
  db: DbExecutor = getDbAdmin(),
): PlatformSequenceDeps {
  return { store: createDrizzleRequestsPlatformStore(db), client: extras.client };
}
