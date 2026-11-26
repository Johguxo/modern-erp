// Puertos de approvals (E4-H1). Los adaptadores Drizzle viven en infrastructure/ y siempre
// filtran por tenantId.
import type { AuditLog } from '@/modules/identity';
import type { Role } from '@/shared/permissions';
import type { ClientInfo } from '@/shared/ports/client-info';

import type { Policy, PolicyStepSpec } from '../domain/policy';
import type { DocType } from '../domain/route-preview';

export interface PolicyRepository {
  /** La política activa del tipo de documento, con sus pasos en orden; null si el tenant no tiene. */
  findActive(tenantId: string, docType: DocType): Promise<Policy | null>;
  /** Como `findActive`, pero bloquea la fila de la política (FOR UPDATE) para editarla. */
  lockActive(tenantId: string, docType: DocType): Promise<Policy | null>;
  /**
   * Reemplaza todos los pasos (borra e inserta) y sube `version` en uno. Devuelve la política
   * resultante. Quien llama ya bloqueó la política y comprobó la versión.
   */
  replaceSteps(
    tenantId: string,
    policyId: string,
    steps: readonly PolicyStepSpec[],
  ): Promise<Policy>;
}

export interface DirectoryMember {
  readonly userId: string;
  readonly name: string;
  readonly roles: readonly Role[];
}

export interface ApproverDirectory {
  /** Miembros activos del tenant (membresía y usuario activos), ordenados por nombre. */
  activeMembers(tenantId: string): Promise<readonly DirectoryMember[]>;
  /** Nombres de usuarios del tenant por id (activos o no); ignora los que no son del tenant. */
  namesOf(tenantId: string, userIds: readonly string[]): Promise<ReadonlyMap<string, string>>;
}

export interface PreviewRouteDeps {
  readonly policies: Pick<PolicyRepository, 'findActive'>;
  readonly directory: Pick<ApproverDirectory, 'activeMembers'>;
}

export interface GetPolicyDeps {
  readonly policies: Pick<PolicyRepository, 'findActive'>;
  readonly directory: ApproverDirectory;
}

export interface PolicyAdminDeps {
  readonly policies: PolicyRepository;
  readonly directory: ApproverDirectory;
  readonly audit: AuditLog;
  readonly client: ClientInfo;
}
