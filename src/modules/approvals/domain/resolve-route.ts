// Resolución de la ruta (E4-H1): de los pasos de la política y los miembros activos del tenant a lo
// que ve el solicitante, y las advertencias que ve el administrador al configurarla. Puro y sin
// base de datos: el cliente reutiliza `stepWarnings` para avisar en vivo.
import type { Role } from '@/shared/permissions';

import type { Policy, PolicyStepSpec } from './policy';
import type { ApproverName, DocType, PreviewStep, RoutePreview } from './route-preview';
import { stepApplies } from './step-condition';

/** Un miembro activo del tenant (membresía y usuario activos). */
export interface ActiveApprover {
  readonly userId: string;
  readonly name: string;
  readonly roles: readonly Role[];
}

export type StepWarning =
  | { readonly type: 'role_without_members' }
  | { readonly type: 'inactive_users'; readonly userIds: readonly string[] };

/** Usuarios activos del paso, en el orden en que se eligieron (los desactivados se omiten). */
function approversOf(
  step: Pick<PolicyStepSpec, 'approverType' | 'role' | 'userIds'>,
  members: readonly ActiveApprover[],
): ApproverName[] {
  if (step.approverType === 'role') {
    return members
      .filter((member) => step.role !== null && member.roles.includes(step.role))
      .map(({ userId, name }) => ({ userId, name }));
  }
  const byId = new Map(members.map((member) => [member.userId, member]));
  return step.userIds.flatMap((userId) => {
    const member = byId.get(userId);
    return member ? [{ userId, name: member.name }] : [];
  });
}

/** Avisos que no bloquean el guardado: nadie podría aprobar el paso, o hay usuarios desactivados. */
export function stepWarnings(
  step: Pick<PolicyStepSpec, 'approverType' | 'role' | 'userIds'>,
  members: readonly ActiveApprover[],
): StepWarning[] {
  if (step.approverType === 'role') {
    return step.role !== null && approversOf(step, members).length === 0
      ? [{ type: 'role_without_members' }]
      : [];
  }
  const active = new Set(members.map((member) => member.userId));
  const inactive = step.userIds.filter((userId) => !active.has(userId));
  return inactive.length > 0 ? [{ type: 'inactive_users', userIds: inactive }] : [];
}

/**
 * Los pasos que aplican a un documento con este total, con sus aprobadores resueltos. La regla
 * «nadie aprueba su propia solicitud» no se aplica aquí: la aplica E4-H2 al enviar.
 */
export function resolveRoute(
  docType: DocType,
  policy: Pick<Policy, 'name' | 'steps'>,
  total: string | null,
  members: readonly ActiveApprover[],
): RoutePreview {
  const steps: PreviewStep[] = [...policy.steps]
    .sort((a, b) => a.order - b.order)
    .filter((step) => stepApplies(step.condition, total))
    .flatMap((step): PreviewStep[] => {
      const approvers = approversOf(step, members);
      if (step.approverType === 'role') {
        return step.role === null
          ? []
          : [
              {
                order: step.order,
                name: step.name,
                rule: step.rule,
                approverType: 'role',
                role: step.role,
                approvers,
              },
            ];
      }
      return [
        { order: step.order, name: step.name, rule: step.rule, approverType: 'users', approvers },
      ];
    });
  return { docType, policyName: policy.name, steps };
}
