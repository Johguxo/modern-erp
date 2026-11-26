// Vista de la política para la pantalla de configuración (E4-H1). La forma pública (con Zod) está
// en contracts/policy-view.ts.
import type { Policy, PolicyStepSpec } from '../domain/policy';
import { stepWarnings, type StepWarning } from '../domain/resolve-route';
import type { DocType } from '../domain/route-preview';

import type { ApproverDirectory, DirectoryMember } from './ports';

export interface PolicyStepView extends PolicyStepSpec {
  readonly warnings: StepWarning[];
}

export interface PolicyView {
  readonly docType: DocType;
  readonly name: string;
  readonly version: number;
  readonly steps: PolicyStepView[];
  readonly members: DirectoryMember[];
  /** Usuarios de los pasos que ya no son miembros activos. */
  readonly inactiveUsers: { readonly userId: string; readonly name: string }[];
}

export async function toPolicyView(
  tenantId: string,
  policy: Policy,
  members: readonly DirectoryMember[],
  directory: Pick<ApproverDirectory, 'namesOf'>,
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
    steps: [...policy.steps]
      .sort((a, b) => a.order - b.order)
      .map((step) => ({
        name: step.name,
        approverType: step.approverType,
        role: step.role,
        userIds: [...step.userIds],
        rule: step.rule,
        condition: step.condition,
        warnings: stepWarnings(step, members),
      })),
    members: members.map(({ userId, name, roles }) => ({ userId, name, roles: [...roles] })),
    inactiveUsers: inactiveIds.map((userId) => ({ userId, name: names.get(userId) ?? '' })),
  };
}
