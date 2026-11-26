// Vista de la política para la pantalla de configuración (E4-H1). La forma pública (con Zod) está
// en contracts/policy-view.ts.
import type { Role } from '@/shared/permissions';

import type { Policy, PolicyStepSpec } from '../domain/policy';
import { stepWarnings } from '../domain/resolve-route';
import type { DocType } from '../domain/route-preview';

import type { ApproverDirectory, DirectoryMember } from './ports';

/** Como PolicyStepSpec, pero con arreglos mutables: la pantalla los edita en un formulario. */
export interface PolicyStepView {
  readonly name: string;
  readonly approverType: PolicyStepSpec['approverType'];
  readonly role: PolicyStepSpec['role'];
  readonly userIds: string[];
  readonly rule: PolicyStepSpec['rule'];
  readonly condition: Record<string, unknown>;
  readonly warnings: ViewWarning[];
}

export type ViewWarning =
  | { readonly type: 'role_without_members' }
  | { readonly type: 'role_cannot_decide' }
  | { readonly type: 'inactive_users'; readonly userIds: string[] }
  | { readonly type: 'users_cannot_decide'; readonly userIds: string[] };

export interface PolicyView {
  readonly docType: DocType;
  readonly name: string;
  readonly version: number;
  /** La política tiene pasos que esta pantalla no puede editar: se muestra un aviso y no se guarda. */
  readonly hasReservedSteps: boolean;
  readonly steps: PolicyStepView[];
  readonly members: { userId: string; name: string; roles: Role[]; canDecide: boolean }[];
  /** Roles con `approvals.decide`, para avisar en vivo mientras se edita. */
  readonly decidingRoles: Role[];
  /** Usuarios de los pasos que ya no son miembros activos. */
  readonly inactiveUsers: { readonly userId: string; readonly name: string }[];
}

export async function toPolicyView(
  tenantId: string,
  policy: Policy,
  members: readonly DirectoryMember[],
  directory: Pick<ApproverDirectory, 'namesOf' | 'decidingRoles'>,
): Promise<PolicyView> {
  const active = new Set(members.map((member) => member.userId));
  const inactiveIds = [
    ...new Set(
      policy.steps.flatMap((step) => step.userIds.filter((userId) => !active.has(userId))),
    ),
  ];
  const names: ReadonlyMap<string, string> =
    inactiveIds.length > 0 ? await directory.namesOf(tenantId, inactiveIds) : new Map();
  return {
    docType: policy.docType,
    name: policy.name,
    version: policy.version,
    hasReservedSteps: policy.hasReservedSteps,
    steps: [...policy.steps]
      .sort((a, b) => a.order - b.order)
      .map((step) => ({
        name: step.name,
        approverType: step.approverType,
        role: step.role,
        userIds: [...step.userIds],
        rule: step.rule,
        condition: { ...step.condition },
        warnings: stepWarnings(step, members, directory.decidingRoles).map((warning) =>
          warning.type === 'inactive_users' || warning.type === 'users_cannot_decide'
            ? { type: warning.type, userIds: [...warning.userIds] }
            : warning,
        ),
      })),
    members: members.map(({ userId, name, roles, canDecide }) => ({
      userId,
      name,
      roles: [...roles],
      canDecide,
    })),
    decidingRoles: [...directory.decidingRoles],
    inactiveUsers: inactiveIds.map((userId) => ({ userId, name: names.get(userId) ?? '' })),
  };
}
