// API pública del módulo approvals: políticas, instancias, pasos y eventos de aprobación.
// Otros módulos y src/app solo importan desde aquí (ADR-001, regla 10).
export { createPreviewRouteDeps } from './infrastructure/deps';
export type { PolicySource, PreviewRouteDeps } from './application/ports';
export { previewRoute } from './application/preview-route';
export { STANDARD_SOF_POLICY } from './domain/standard-policy';
export type { ApprovalPolicy, DocType, PolicyStep, RoutePreview } from './domain/route-preview';
