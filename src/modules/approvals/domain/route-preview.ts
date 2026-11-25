// Vista previa de la ruta de aprobación (E3-H2): lo que verá el solicitante antes de enviar. Es de
// solo lectura y no crea nada: la instancia real con sus pasos la crea E4-H2 al enviar.
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
 * nombres ya resueltos (puede estar vacío cuando aún no se resuelven).
 */
export type StepApprover =
  | {
      readonly approverType: 'role';
      readonly role: Role;
      readonly approvers: ApproverName[];
    }
  | { readonly approverType: 'users'; readonly approvers: ApproverName[] };

export type PolicyStep = {
  readonly order: number;
  readonly name: string;
  readonly rule: StepRule;
} & StepApprover;

export interface ApprovalPolicy {
  readonly name: string;
  readonly steps: readonly PolicyStep[];
}

export interface RoutePreview {
  readonly docType: DocType;
  readonly policyName: string;
  readonly steps: PolicyStep[];
}

/**
 * `total` (texto decimal de dinero, o null si aún no hay monto) lo usará E4-H1 para elegir la
 * política según `min_amount`; la política estándar no lo mira.
 */
export function toRoutePreview(
  docType: DocType,
  policy: ApprovalPolicy,
  total: string | null,
): RoutePreview {
  void total;
  return {
    docType,
    policyName: policy.name,
    steps: [...policy.steps].sort((a, b) => a.order - b.order),
  };
}
