// Vista previa de la ruta de aprobación (E3-H2, E4-H1): lo que verá el solicitante antes de enviar.
// Es de solo lectura y no crea nada: la instancia real con sus pasos la crea E4-H2 al enviar.
import type { Role } from '@/shared/permissions';

export const DOC_TYPES = ['SOF'] as const;
export type DocType = (typeof DOC_TYPES)[number];

export const STEP_RULES = ['any', 'all'] as const;
/** `any`: basta que apruebe uno del rol. `all`: deben aprobar todos. */
export type StepRule = (typeof STEP_RULES)[number];

export interface ApproverName {
  readonly userId: string;
  readonly name: string;
}

/**
 * Quién aprueba el paso: un rol del cliente (ADR-002) o usuarios concretos. `approvers` son los
 * nombres ya resueltos (puede estar vacío si el rol no tiene miembros activos).
 */
export type StepApprover =
  | {
      readonly approverType: 'role';
      readonly role: Role;
      readonly approvers: ApproverName[];
    }
  | { readonly approverType: 'users'; readonly approvers: ApproverName[] };

export type PreviewStep = {
  readonly order: number;
  readonly name: string;
  readonly rule: StepRule;
} & StepApprover;

export interface RoutePreview {
  readonly docType: DocType;
  readonly policyName: string;
  readonly steps: PreviewStep[];
}
