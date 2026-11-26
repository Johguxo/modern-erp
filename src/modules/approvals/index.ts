// API pública del módulo approvals: políticas, instancias, pasos y eventos de aprobación.
// Otros módulos y src/app solo importan desde aquí (ADR-001, regla 10).
export {
  createGetPolicyDeps,
  createPolicyAdminDeps,
  createPreviewRouteDeps,
  type PolicyAdminExtras,
} from './infrastructure/deps';
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
