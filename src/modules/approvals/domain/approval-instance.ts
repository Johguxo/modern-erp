// Instancia de aprobación (E4-H2, flujo-sof-aprobaciones.md §3): tipos del estado que el motor
// guarda por ronda. Sin base de datos.
import type { StepRule } from './route-preview';

export const INSTANCE_STATUSES = [
  'in_progress',
  'approved',
  'rejected',
  'changes_requested',
  'cancelled',
] as const;
export type InstanceStatus = (typeof INSTANCE_STATUSES)[number];

export const STEP_STATUSES = [
  'waiting',
  'pending',
  'approved',
  'rejected',
  'changes_requested',
  'skipped',
  'cancelled',
] as const;
export type StepStatus = (typeof STEP_STATUSES)[number];

/** Lo que decide un aprobador (también es el estado en que cierra el paso). */
export type AssigneeDecision = 'approved' | 'rejected' | 'changes_requested';

/** Lo que pide el usuario al decidir. */
export const DECISION_KINDS = ['approve', 'reject', 'request_changes'] as const;
export type DecisionKind = (typeof DECISION_KINDS)[number];

/**
 * Efecto de una decisión sobre la ronda:
 * - `partial`: aprobó uno de varios (regla `all`); el paso sigue pendiente.
 * - `advanced`: el paso se cerró y pasó a pendiente el siguiente.
 * - `approved`: se cerró el último paso; la ronda y el documento quedan aprobados.
 * - `rejected` / `changes_requested`: cierran el paso y la ronda.
 */
export const DECISION_OUTCOMES = [
  'partial',
  'advanced',
  'approved',
  'rejected',
  'changes_requested',
] as const;
export type DecisionOutcome = (typeof DECISION_OUTCOMES)[number];

export const APPROVAL_EVENT_TYPES = [
  'submitted',
  'resubmitted',
  'step_pending',
  'step_approved',
  'step_rejected',
  'changes_requested',
  'approved',
  'cancelled',
  'line_corrected',
  'reconfirmation_requested',
] as const;
export type ApprovalEventType = (typeof APPROVAL_EVENT_TYPES)[number];

/** Copia de la política que se guarda en la instancia (jsonb): el documento en curso no cambia. */
export interface PolicySnapshot {
  readonly policyId: string;
  readonly name: string;
  readonly version: number;
  /** Total del documento con el que se evaluaron las condiciones (texto decimal). */
  readonly total: string | null;
  readonly steps: readonly {
    readonly order: number;
    readonly name: string;
    readonly approverType: 'role' | 'users';
    readonly role: string | null;
    readonly userIds: readonly string[];
    readonly rule: StepRule;
    readonly condition: Readonly<Record<string, unknown>>;
  }[];
}

export interface InstanceRecord {
  readonly id: string;
  readonly requestId: string;
  readonly round: number;
  readonly status: InstanceStatus;
}

export interface AssigneeRecord {
  readonly id: string;
  readonly userId: string | null;
  readonly decision: AssigneeDecision | null;
}

export interface StepRecord {
  readonly id: string;
  readonly instanceId: string;
  readonly order: number;
  readonly name: string;
  readonly rule: StepRule;
  readonly status: StepStatus;
  readonly assignees: readonly AssigneeRecord[];
}
