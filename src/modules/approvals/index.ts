// API pública del módulo approvals: políticas, instancias, pasos y eventos de aprobación.
// Otros módulos y src/app solo importan desde aquí (ADR-001, regla 10).
export {
  createGetPolicyDeps,
  createPolicyAdminDeps,
  createPreviewRouteDeps,
  type PolicyAdminExtras,
} from './infrastructure/deps';
export {
  createApprovalEngine,
  type ApprovalEngine,
  type ApprovalEngineExtras,
} from './infrastructure/engine';
export type { ApprovalAssignmentsView } from './application/approval-queries';
export type { ApprovalTimelineView } from './application/approval-timeline';
export type { ApprovalTimelineEntry, TimelineEntryKind } from './domain/timeline';
export type { DecideApprovalInput, DecideApprovalOutput } from './application/decide-approval-step';
export type { StartApprovalInput } from './application/start-approval';
export type { CancelApprovalInput } from './application/cancel-approval';
export type { RecordCorrectionInput, RecordCorrectionOutput } from './application/correct-approval';
export type {
  ApprovalEventType,
  DecisionKind,
  DecisionOutcome,
  InstanceStatus,
  StepStatus,
} from './domain/approval-instance';
export { standardPolicySetupStep } from './infrastructure/standard-policy-step';
export type {
  ApproverDirectory,
  DirectoryMember,
  GetPolicyDeps,
  PolicyAdminDeps,
  PolicyRepository,
  PreviewRouteDeps,
} from './application/ports';
export { previewRoute } from './application/preview-route';
export { getPolicy } from './application/get-policy';
export { updatePolicySteps, type UpdatePolicyStepsInput } from './application/update-policy-steps';
export type { PolicyStepView, PolicyView } from './application/policy-view';
export { STANDARD_SOF_POLICY } from './domain/standard-policy';
export type { Policy, PolicyStep, PolicyStepSpec } from './domain/policy';
export type { DocType, PreviewStep, RoutePreview } from './domain/route-preview';
