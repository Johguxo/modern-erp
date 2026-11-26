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
  ApprovalStarter,
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
import { noopApprovalStarter } from './noop-approval-starter';
import { createRequestLabels } from './request-labels';

/** Lo que la entrega aporta a requests (además de la transacción). */
export interface RequestsExtras {
  readonly client: ClientInfo;
  readonly clock: Clock;
  /** E4-H2 pasa aquí el motor de aprobaciones; por defecto no hace nada. */
  readonly approvals?: ApprovalStarter;
  /** E4-H2 pasa aquí las asignaciones del motor; por defecto nadie tiene nada asignado. */
  readonly assignments?: ApprovalAssignments;
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
  extras: Pick<RequestsExtras, 'assignments'> = {},
): GetRequestDeps {
  return {
    requests: createDrizzleRequestRepository(tx),
    assignments: extras.assignments ?? noopApprovalAssignments,
  };
}

/** Detalle del SOF (E3-H4): la lectura de una solicitud más los nombres resueltos en lote. */
export function createGetRequestDetailDeps(
  tx: DbExecutor,
  extras: Pick<RequestsExtras, 'client' | 'assignments'>,
): GetRequestDetailDeps {
  return {
    ...createGetRequestDeps(tx, extras),
    labels: createRequestLabels(tx, { client: extras.client }),
  };
}

/** Bandeja (E3-H3): consulta sobre `requests` y nombres resueltos en lote desde identity/catalog. */
export function createListRequestsDeps(
  tx: DbExecutor,
  extras: Pick<RequestsExtras, 'client' | 'clock' | 'assignments'>,
): ListRequestsDeps {
  return {
    queries: createDrizzleRequestQueryRepository(tx),
    assignments: extras.assignments ?? noopApprovalAssignments,
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
