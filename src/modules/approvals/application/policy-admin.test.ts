import { makeCtx } from '@tests/support/ctx';
import { describe, expect, it } from 'vitest';

import type { AuditLog } from '@/modules/identity';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '@/shared/errors';
import { UNKNOWN_CLIENT } from '@/shared/ports/client-info';

import type { Policy, PolicyStepSpec } from '../domain/policy';

import { getPolicy } from './get-policy';
import type { DirectoryMember, PolicyAdminDeps } from './ports';
import { updatePolicySteps } from './update-policy-steps';

const ANA = '11111111-1111-4111-8111-111111111111';
const LUIS = '22222222-2222-4222-8222-222222222222';
const GONE = '33333333-3333-4333-8333-333333333333';
const OTHER_TENANT_USER = '44444444-4444-4444-8444-444444444444';

type AuditEntry = Parameters<AuditLog['record']>[0];

const members: DirectoryMember[] = [
  { userId: ANA, name: 'Ana Pérez', roles: ['warehouse'] },
  { userId: LUIS, name: 'Luis Rojas', roles: ['approver'] },
];

const initial: Policy = {
  id: 'p1',
  docType: 'SOF',
  name: 'SOF estándar',
  version: 1,
  steps: [
    {
      order: 1,
      name: 'Almacén',
      approverType: 'role',
      role: 'warehouse',
      userIds: [],
      rule: 'any',
      condition: { min_amount: '100.00', cost_center_ids: ['x'] },
    },
    {
      order: 2,
      name: 'Gerencia',
      approverType: 'users',
      role: null,
      userIds: [GONE],
      rule: 'any',
      condition: {},
    },
  ],
};

function setup(policy: Policy | null = initial) {
  let stored = policy;
  const audits: AuditEntry[] = [];
  const replaced: PolicyStepSpec[][] = [];
  const deps: PolicyAdminDeps = {
    policies: {
      findActive: () => Promise.resolve(stored),
      lockActive: () => Promise.resolve(stored),
      replaceSteps: (_tenantId, _policyId, steps) => {
        replaced.push([...steps]);
        stored = {
          ...initial,
          version: (stored?.version ?? 0) + 1,
          steps: steps.map((step, index) => ({ ...step, order: index + 1 })),
        };
        return Promise.resolve(stored);
      },
    },
    directory: {
      activeMembers: () => Promise.resolve(members),
      namesOf: (_tenantId, ids) =>
        Promise.resolve(new Map(ids.map((id) => [id, id === GONE ? 'Gabi Vega' : 'Otro']))),
    },
    audit: {
      record: (entry) => {
        audits.push(entry);
        return Promise.resolve();
      },
    },
    client: UNKNOWN_CLIENT,
  };
  return { deps, audits, replaced };
}

const admin = () => makeCtx({ permissions: ['approval_policies.manage'], userId: ANA });

const validSteps: PolicyStepSpec[] = [
  {
    name: 'Gerencia',
    approverType: 'users',
    role: null,
    userIds: [LUIS],
    rule: 'all',
    condition: { min_amount: '5000.00' },
  },
];

describe('getPolicy', () => {
  it('devuelve la política con advertencias y los usuarios desactivados', async () => {
    const view = await getPolicy(admin(), { docType: 'SOF' }, setup().deps);
    expect(view).toMatchObject({ name: 'SOF estándar', version: 1 });
    expect(view.members.map((member) => member.userId)).toEqual([ANA, LUIS]);
    expect(view.steps[0]?.warnings).toEqual([]);
    expect(view.steps[1]?.warnings).toEqual([{ type: 'inactive_users', userIds: [GONE] }]);
    expect(view.inactiveUsers).toEqual([{ userId: GONE, name: 'Gabi Vega' }]);
  });

  it('avisa de un rol sin miembros activos', async () => {
    const policy: Policy = {
      ...initial,
      steps: [{ ...initial.steps[0]!, role: 'purchasing' }],
    };
    const view = await getPolicy(admin(), { docType: 'SOF' }, setup(policy).deps);
    expect(view.steps[0]?.warnings).toEqual([{ type: 'role_without_members' }]);
  });

  it('exige approval_policies.manage', async () => {
    const ctx = makeCtx({ permissions: ['requests.create'] });
    await expect(getPolicy(ctx, { docType: 'SOF' }, setup().deps)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });

  it('sin política lanza NotFoundError', async () => {
    await expect(getPolicy(admin(), { docType: 'SOF' }, setup(null).deps)).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });
});

describe('updatePolicySteps', () => {
  it('reemplaza los pasos, sube la versión y audita antes y después', async () => {
    const { deps, audits, replaced } = setup();
    const view = await updatePolicySteps(
      admin(),
      { docType: 'SOF', version: 1, steps: validSteps },
      deps,
    );
    expect(replaced).toEqual([validSteps]);
    expect(view.version).toBe(2);
    expect(view.steps).toHaveLength(1);
    expect(view.steps[0]?.condition).toEqual({ min_amount: '5000.00' });
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      action: 'approval_policy.updated',
      entityType: 'approval_policy',
      entityId: 'p1',
      actorUserId: ANA,
      data: { docType: 'SOF', fromVersion: 1, toVersion: 2 },
    });
    const data = audits[0]?.data as { before: unknown[]; after: unknown[] };
    expect(data.before).toHaveLength(2);
    expect(data.after).toHaveLength(1);
  });

  it('con una versión vieja lanza stale_version y no escribe', async () => {
    const { deps, replaced, audits } = setup();
    const error = await updatePolicySteps(
      admin(),
      { docType: 'SOF', version: 7, steps: validSteps },
      deps,
    ).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ConflictError);
    expect((error as ConflictError).reason).toBe('stale_version');
    expect(replaced).toEqual([]);
    expect(audits).toEqual([]);
  });

  it('un usuario que no es miembro activo falla con approver_not_member y no escribe', async () => {
    const { deps, replaced } = setup();
    const error = await updatePolicySteps(
      admin(),
      {
        docType: 'SOF',
        version: 1,
        steps: [{ ...validSteps[0]!, userIds: [OTHER_TENANT_USER] }],
      },
      deps,
    ).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ValidationError);
    expect((error as ValidationError).reason).toBe('approver_not_member');
    expect(replaced).toEqual([]);
  });

  it('sin pasos falla con policy_without_steps', async () => {
    const error = await updatePolicySteps(
      admin(),
      { docType: 'SOF', version: 1, steps: [] },
      setup().deps,
    ).catch((e: unknown) => e);
    expect((error as ValidationError).reason).toBe('policy_without_steps');
  });

  it('exige approval_policies.manage', async () => {
    const ctx = makeCtx({ permissions: ['requests.create'] });
    await expect(
      updatePolicySteps(ctx, { docType: 'SOF', version: 1, steps: validSteps }, setup().deps),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});
