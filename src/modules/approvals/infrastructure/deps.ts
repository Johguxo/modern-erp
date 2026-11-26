// Fábricas de dependencias de approvals (ADR-005): la entrega las arma con la transacción de
// withTenant y se las pasa a los casos de uso.
import type { DbExecutor } from '@/db';
import { createAuditLogFor } from '@/modules/identity';
import type { ClientInfo } from '@/shared/ports/client-info';

import type { GetPolicyDeps, PolicyAdminDeps, PreviewRouteDeps } from '../application/ports';

import { createApproverDirectory } from './approver-directory';
import { createDrizzlePolicyRepository } from './drizzle-policy-repository';

export function createPreviewRouteDeps(tx: DbExecutor): PreviewRouteDeps {
  return { policies: createDrizzlePolicyRepository(tx), directory: createApproverDirectory(tx) };
}

export function createGetPolicyDeps(tx: DbExecutor): GetPolicyDeps {
  return { policies: createDrizzlePolicyRepository(tx), directory: createApproverDirectory(tx) };
}

/** Lo que la entrega aporta a la administración de políticas (además de la transacción). */
export interface PolicyAdminExtras {
  readonly client: ClientInfo;
}

export function createPolicyAdminDeps(tx: DbExecutor, extras: PolicyAdminExtras): PolicyAdminDeps {
  return {
    policies: createDrizzlePolicyRepository(tx),
    directory: createApproverDirectory(tx),
    audit: createAuditLogFor(tx),
    client: extras.client,
  };
}
