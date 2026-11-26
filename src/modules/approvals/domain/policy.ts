// Política de aprobación (E4-H1): los pasos que configura el administrador. La instancia de un
// documento (con sus copias de los pasos) la crea E4-H2.
import type { Role } from '@/shared/permissions';

import type { DocType, StepRule } from './route-preview';

export const MAX_POLICY_STEPS = 10;
export const MAX_USERS_PER_STEP = 50;
export const MAX_STEP_NAME_LENGTH = 80;

export const STEP_APPROVER_TYPES = ['role', 'users'] as const;
/** Tipos de aprobador del MVP; `requester_manager` y `external_email` están reservados. */
export type StepApproverType = (typeof STEP_APPROVER_TYPES)[number];

/** Condición del paso (jsonb). El MVP solo evalúa `min_amount`; el resto se conserva tal cual. */
export type StepConditionData = Readonly<Record<string, unknown>>;

/** Un paso tal como lo edita el administrador (sin número de orden: lo da la posición). */
export interface PolicyStepSpec {
  readonly name: string;
  readonly approverType: StepApproverType;
  /** Solo con `approverType = 'role'`. */
  readonly role: Role | null;
  /** Solo con `approverType = 'users'`. */
  readonly userIds: readonly string[];
  readonly rule: StepRule;
  readonly condition: StepConditionData;
}

export type PolicyStep = PolicyStepSpec & { readonly order: number };

export interface Policy {
  readonly id: string;
  readonly docType: DocType;
  readonly name: string;
  /** Bloqueo optimista: sube con cada guardado de los pasos. */
  readonly version: number;
  readonly steps: readonly PolicyStep[];
}
