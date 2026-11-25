// Vista previa de la ruta de aprobación (E3-H2): lo que verá el solicitante antes de enviar. Es de
// solo lectura y no crea nada: la instancia real con sus pasos la crea E4-H2 al enviar.
import type { Role } from '@/shared/permissions';

export const DOC_TYPES = ['SOF'] as const;
export type DocType = (typeof DOC_TYPES)[number];

export const STEP_RULES = ['any', 'all'] as const;
/** `any`: basta que apruebe uno del rol. `all`: deben aprobar todos. */
export type StepRule = (typeof STEP_RULES)[number];

export interface PolicyStep {
  readonly order: number;
  readonly name: string;
  /** Rol del cliente que aprueba el paso (ADR-002). */
  readonly role: Role;
  readonly rule: StepRule;
}

export interface ApprovalPolicy {
  readonly name: string;
  readonly steps: readonly PolicyStep[];
}

export interface RoutePreview {
  readonly docType: DocType;
  readonly policyName: string;
  readonly steps: readonly PolicyStep[];
}

export function toRoutePreview(docType: DocType, policy: ApprovalPolicy): RoutePreview {
  return {
    docType,
    policyName: policy.name,
    steps: [...policy.steps].sort((a, b) => a.order - b.order),
  };
}
