import { makeCtx } from '@tests/support/ctx';
import { describe, expect, it } from 'vitest';

import { ForbiddenError } from '@/shared/errors';
import { CapturingLogger } from '@tests/support/fakes/capturing-logger';

import type { Policy } from '../domain/policy';

import type { DirectoryMember, PreviewRouteDeps } from './ports';
import { previewRoute } from './preview-route';

const ANA = '11111111-1111-4111-8111-111111111111';
const LUIS = '22222222-2222-4222-8222-222222222222';

const members: DirectoryMember[] = [
  { userId: ANA, name: 'Ana Pérez', roles: ['warehouse'], canDecide: true },
  { userId: LUIS, name: 'Luis Rojas', roles: ['approver'], canDecide: true },
];

const policy: Policy = {
  id: 'p1',
  docType: 'SOF',
  name: 'SOF estándar',
  version: 3,
  hasReservedSteps: false,
  steps: [
    {
      order: 1,
      name: 'Almacén',
      approverType: 'role',
      role: 'warehouse',
      userIds: [],
      rule: 'any',
      condition: {},
    },
    {
      order: 2,
      name: 'Gerencia local',
      approverType: 'users',
      role: null,
      userIds: [LUIS],
      rule: 'all',
      condition: { min_amount: '5000.00' },
    },
  ],
};

function makeDeps(found: Policy | null = policy) {
  const calls: unknown[] = [];
  const logger = new CapturingLogger();
  const deps: PreviewRouteDeps = {
    logger,
    policies: {
      findActive: (tenantId, docType) => {
        calls.push({ tenantId, docType });
        return Promise.resolve(found);
      },
    },
    directory: { activeMembers: () => Promise.resolve(members) },
  };
  return { deps, calls, logger };
}

describe('previewRoute', () => {
  it('quien crea solicitudes ve la ruta con los aprobadores resueltos', async () => {
    const ctx = makeCtx({ permissions: ['requests.create'] });
    const { deps, calls } = makeDeps();
    await expect(previewRoute(ctx, { docType: 'SOF', total: '6000.00' }, deps)).resolves.toEqual({
      docType: 'SOF',
      policyName: 'SOF estándar',
      steps: [
        {
          order: 1,
          name: 'Almacén',
          approverType: 'role',
          role: 'warehouse',
          approvers: [{ userId: ANA, name: 'Ana Pérez' }],
          rule: 'any',
        },
        {
          order: 2,
          name: 'Gerencia local',
          approverType: 'users',
          approvers: [{ userId: LUIS, name: 'Luis Rojas' }],
          rule: 'all',
        },
      ],
    });
    expect(calls).toEqual([{ tenantId: ctx.tenantId, docType: 'SOF' }]);
  });

  it('omite el paso con monto mínimo cuando el total no lo alcanza', async () => {
    const ctx = makeCtx({ permissions: ['requests.create'] });
    const route = await previewRoute(ctx, { docType: 'SOF', total: '4999.99' }, makeDeps().deps);
    expect(route.steps.map((step) => step.name)).toEqual(['Almacén']);
  });

  it('quien administra políticas también la ve', async () => {
    const ctx = makeCtx({ permissions: ['approval_policies.manage'] });
    await expect(
      previewRoute(ctx, { docType: 'SOF', total: null }, makeDeps().deps),
    ).resolves.toMatchObject({ policyName: 'SOF estándar' });
  });

  it('sin política activa devuelve una ruta vacía y lo registra', async () => {
    const ctx = makeCtx({ permissions: ['requests.create'] });
    const { deps, logger } = makeDeps(null);
    await expect(previewRoute(ctx, { docType: 'SOF', total: null }, deps)).resolves.toEqual({
      docType: 'SOF',
      policyName: '',
      steps: [],
    });
    expect(logger.entries.map((entry) => entry.level)).toEqual(['warn']);
  });

  it('con pasos reservados devuelve lo que entiende y lo registra', async () => {
    const ctx = makeCtx({ permissions: ['requests.create'] });
    const { deps, logger } = makeDeps({ ...policy, hasReservedSteps: true });
    const route = await previewRoute(ctx, { docType: 'SOF', total: '6000.00' }, deps);
    expect(route.steps).toHaveLength(2);
    expect(logger.entries.map((entry) => entry.level)).toEqual(['warn']);
  });

  it('sin permiso lanza ForbiddenError y no consulta la política', async () => {
    const ctx = makeCtx({ permissions: ['requests.read_own'] });
    const { deps, calls } = makeDeps();
    await expect(
      previewRoute(ctx, { docType: 'SOF', total: '1250.00' }, deps),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(calls).toEqual([]);
  });
});
