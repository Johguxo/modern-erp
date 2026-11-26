// Puertos de approvals (E4-H1). Los adaptadores Drizzle viven en infrastructure/ y siempre
// filtran por tenantId.
import type { AuditLog } from '@/modules/identity';
import type { Role } from '@/shared/permissions';
import type { ClientInfo } from '@/shared/ports/client-info';
import type { Clock } from '@/shared/ports/clock';
import type { Logger } from '@/shared/ports/logger';

import type {
  ApprovalEventType,
  AssigneeDecision,
  InstanceRecord,
  InstanceStatus,
  PolicySnapshot,
  StepRecord,
  StepStatus,
} from '../domain/approval-instance';
import type { PlannedStep } from '../domain/plan-instance';
import type { Policy, PolicyStepSpec } from '../domain/policy';
import type { DocType } from '../domain/route-preview';

export interface PolicyRepository {
  /**
   * La política activa del tipo de documento, con sus pasos en orden; null si el tenant no tiene.
   * `hasReservedSteps` indica pasos que esta versión no sabe leer (se omiten de `steps`).
   */
  findActive(tenantId: string, docType: DocType): Promise<Policy | null>;
  /** Como `findActive`, pero bloquea la fila de la política (FOR UPDATE) para editarla. */
  lockActive(tenantId: string, docType: DocType): Promise<Policy | null>;
  /**
   * Como `findActive`, pero con FOR SHARE: al enviar, nadie edita la política (FOR UPDATE) mientras
   * se copia, y varios envíos a la vez no se bloquean entre sí.
   */
  findActiveForStart(tenantId: string, docType: DocType): Promise<Policy | null>;
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
  /** Sus roles incluyen `approvals.decide`. */
  readonly canDecide: boolean;
}

export interface ApproverDirectory {
  /** Roles que incluyen `approvals.decide`: los únicos que pueden aprobar un paso. */
  readonly decidingRoles: readonly Role[];
  /** Miembros activos del tenant (membresía y usuario activos), ordenados por nombre. */
  activeMembers(tenantId: string): Promise<readonly DirectoryMember[]>;
  /** Nombres de usuarios del tenant por id (activos o no); ignora los que no son del tenant. */
  namesOf(tenantId: string, userIds: readonly string[]): Promise<ReadonlyMap<string, string>>;
}

export interface PreviewRouteDeps {
  readonly policies: Pick<PolicyRepository, 'findActive'>;
  readonly directory: Pick<ApproverDirectory, 'activeMembers'>;
  /** Para avisar de una política que falta o tiene pasos reservados; sin él no se registra. */
  readonly logger?: Logger;
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

// ── Motor de aprobaciones (E4-H2) ────────────────────────────────────────────────────────────

/** Un paso de la ronda con su fila, para los casos de uso que lo deciden. */
export interface StepWithRequest extends StepRecord {
  readonly requestId: string;
}

/**
 * Instancias, pasos y asignados de una ronda. Todas las operaciones filtran por tenantId. Las
 * actualizaciones son condicionales (`where status = …` / `where decision is null`) y devuelven
 * false si otra transacción llegó primero.
 */
export interface ApprovalInstanceRepository {
  /** La última ronda del documento con SELECT … FOR UPDATE; null si nunca se envió. */
  lockLatest(tenantId: string, requestId: string): Promise<InstanceRecord | null>;
  create(
    tenantId: string,
    input: {
      readonly requestId: string;
      readonly round: number;
      readonly policyId: string;
      readonly snapshot: PolicySnapshot;
    },
  ): Promise<InstanceRecord>;
  /** Inserta los pasos del plan con sus asignados (los omitidos no tienen). */
  insertSteps(
    tenantId: string,
    instance: InstanceRecord,
    steps: readonly PlannedStep[],
    now: Date,
  ): Promise<StepRecord[]>;
  /** Un paso con sus asignados; null si no existe en el tenant. */
  findStep(tenantId: string, stepId: string): Promise<StepWithRequest | null>;
  /** Los pasos de la ronda con sus asignados, por orden. */
  stepsOf(tenantId: string, instanceId: string): Promise<StepRecord[]>;
  recordAssigneeDecision(
    tenantId: string,
    input: {
      readonly stepId: string;
      readonly userId: string;
      readonly decision: AssigneeDecision;
      readonly comment: string | null;
      readonly at: Date;
    },
  ): Promise<boolean>;
  /** Cierra un paso pendiente (aprobado, rechazado o con cambios pedidos). */
  closeStep(
    tenantId: string,
    stepId: string,
    patch: {
      readonly status: StepStatus;
      readonly decidedBy: string;
      readonly decidedAt: Date;
      readonly comment: string | null;
    },
  ): Promise<boolean>;
  /** Pasa un paso de `waiting` a `pending`. */
  activateStep(tenantId: string, stepId: string, now: Date): Promise<boolean>;
  /** Los pasos `waiting` y `pending` de la ronda pasan a `cancelled`. Devuelve cuántos. */
  cancelOpenSteps(tenantId: string, instanceId: string, now: Date): Promise<number>;
  /** Cierra la ronda si sigue `in_progress`. */
  closeInstance(
    tenantId: string,
    instanceId: string,
    status: Exclude<InstanceStatus, 'in_progress'>,
    now: Date,
  ): Promise<boolean>;
}

export interface NewApprovalEvent {
  readonly requestId: string;
  readonly instanceId: string | null;
  readonly stepId: string | null;
  readonly type: ApprovalEventType;
  /** El usuario que actúa; null en los eventos que genera el sistema. */
  readonly actorUserId: string | null;
  readonly comment: string | null;
  readonly data: Readonly<Record<string, unknown>>;
}

/** Solo insert (CLAUDE.md regla 7). */
export interface ApprovalEventLog {
  append(tenantId: string, event: NewApprovalEvent): Promise<void>;
}

/** Consultas de la bandeja y la visibilidad; cuentan como pendientes los pasos `pending` sin decidir. */
export interface ApprovalQueries {
  /** Solicitudes donde el usuario es asignado de cualquier paso, de cualquier ronda. */
  assignedRequestIds(tenantId: string, userId: string): Promise<string[]>;
  isAssigned(tenantId: string, userId: string, requestId: string): Promise<boolean>;
  /** Solicitudes con un paso `pending` del usuario que aún no decidió. */
  pendingRequestIds(tenantId: string, userId: string): Promise<string[]>;
  /** El paso `pending` del usuario en esta solicitud, si aún no decidió. */
  pendingStepId(tenantId: string, userId: string, requestId: string): Promise<string | null>;
}

export interface ApprovalEngineDeps {
  readonly policies: Pick<PolicyRepository, 'findActiveForStart'>;
  readonly directory: Pick<ApproverDirectory, 'activeMembers'>;
  readonly instances: ApprovalInstanceRepository;
  readonly events: ApprovalEventLog;
  readonly clock: Clock;
  readonly logger: Logger;
}
