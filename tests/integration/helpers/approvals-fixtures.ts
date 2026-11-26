// Datos de aprobaciones para pruebas de integración (E4-H2): un mundo de requests con dos usuarios de
// almacén y un aprobador de gerencia, atajos para enviar y decidir con las dependencias reales
// (las mismas que arma la entrega) y lecturas de lo guardado con getDbAdmin().
import { and, asc, eq } from 'drizzle-orm';

import { getDbAdmin } from '@/db/admin';
import {
  approvalEvents,
  approvalInstances,
  approvalPolicies,
  approvalPolicySteps,
  approvalStepAssignees,
  approvalSteps,
} from '@/db/schema';
import {
  createDraft,
  decideRequest,
  submitRequest,
  type DecideRequestInput,
  type RequestView,
} from '@/modules/requests';
import type { Permission } from '@/shared/permissions';

import type { IdentityFixtures } from './identity-fixtures';
import {
  addMember,
  draftInput,
  runRequests,
  seedRequestsWorld,
  type Member,
  type RequestsWorld,
} from './requests-fixtures';

export const APPROVER_PERMISSIONS: Permission[] = ['requests.read_own', 'approvals.decide'];

export interface ApprovalWorld {
  readonly world: RequestsWorld;
  /** Dos usuarios con rol de almacén (paso 1 de la política estándar). */
  readonly ana: Member;
  readonly rosa: Member;
  /** Usuario con rol de aprobador (paso 2 de la política estándar). */
  readonly luis: Member;
}

export async function seedApprovalWorld(fx: IdentityFixtures): Promise<ApprovalWorld> {
  const world = await seedRequestsWorld(fx);
  const ana = await addMember(fx, world, {
    fullName: 'Ana Almacén',
    permissions: APPROVER_PERMISSIONS,
    roles: ['warehouse'],
  });
  const rosa = await addMember(fx, world, {
    fullName: 'Rosa Almacén',
    permissions: APPROVER_PERMISSIONS,
    roles: ['warehouse'],
  });
  const luis = await addMember(fx, world, {
    fullName: 'Luis Gerencia',
    permissions: APPROVER_PERMISSIONS,
    roles: ['approver'],
  });
  return { world, ana, rosa, luis };
}

export interface PolicyStepInput {
  readonly name: string;
  readonly role?: 'warehouse' | 'approver' | 'requester';
  readonly userIds?: readonly string[];
  readonly rule?: 'any' | 'all';
  readonly condition?: Record<string, unknown>;
}

/** Reemplaza los pasos de la política activa del tenant (conexión dueño) y sube su versión. */
export async function setPolicySteps(
  tenantId: string,
  steps: readonly PolicyStepInput[],
): Promise<void> {
  const admin = getDbAdmin();
  const [policy] = await admin
    .select()
    .from(approvalPolicies)
    .where(and(eq(approvalPolicies.tenantId, tenantId), eq(approvalPolicies.active, true)));
  if (!policy) throw new Error('el tenant no tiene política activa');
  await admin.delete(approvalPolicySteps).where(eq(approvalPolicySteps.policyId, policy.id));
  await admin.insert(approvalPolicySteps).values(
    steps.map((step, index) => ({
      tenantId,
      policyId: policy.id,
      stepOrder: index + 1,
      name: step.name,
      approverType: step.userIds ? 'users' : 'role',
      approverRef: step.userIds ? [...step.userIds] : (step.role ?? 'warehouse'),
      rule: step.rule ?? 'any',
      condition: step.condition ?? {},
    })),
  );
  await admin
    .update(approvalPolicies)
    .set({ version: policy.version + 1 })
    .where(eq(approvalPolicies.id, policy.id));
}

/** Crea un borrador del solicitante del mundo y lo envía. */
export async function sendRequest(
  world: RequestsWorld,
  overrides: Record<string, unknown> = {},
): Promise<RequestView> {
  const draft = await runRequests(world.ctx, (deps) =>
    createDraft(world.ctx, draftInput(world, overrides), deps),
  );
  return runRequests(world.ctx, (deps) =>
    submitRequest(world.ctx, { id: draft.id, version: draft.version }, deps),
  );
}

export function decideAs(member: Pick<Member, 'ctx'>, input: DecideRequestInput) {
  return runRequests(member.ctx, (deps) => decideRequest(member.ctx, input, deps));
}

// ── Lo guardado (sin RLS) ────────────────────────────────────────────────────────────────────

export const storedInstances = (requestId: string) =>
  getDbAdmin()
    .select()
    .from(approvalInstances)
    .where(eq(approvalInstances.requestId, requestId))
    .orderBy(asc(approvalInstances.round));

export const storedSteps = (requestId: string) =>
  getDbAdmin()
    .select()
    .from(approvalSteps)
    .where(eq(approvalSteps.requestId, requestId))
    .orderBy(asc(approvalSteps.createdAt), asc(approvalSteps.stepOrder));

export const storedAssignees = (stepId: string) =>
  getDbAdmin()
    .select()
    .from(approvalStepAssignees)
    .where(eq(approvalStepAssignees.stepId, stepId))
    .orderBy(asc(approvalStepAssignees.createdAt));

export const storedEvents = (requestId: string) =>
  getDbAdmin()
    .select()
    .from(approvalEvents)
    .where(eq(approvalEvents.requestId, requestId))
    .orderBy(asc(approvalEvents.createdAt));
