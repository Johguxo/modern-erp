import { makeCtx } from '@tests/support/ctx';
import { describe, expect, it } from 'vitest';

import { ForbiddenError } from '@/shared/errors';

import { toRoutePreview, type ApprovalPolicy } from '../domain/route-preview';
import { STANDARD_SOF_POLICY } from '../domain/standard-policy';
import { standardPolicySource } from '../infrastructure/standard-policy-source';

import { previewRoute } from './preview-route';

const deps = { policies: standardPolicySource };

describe('previewRoute', () => {
  it('quien crea solicitudes ve la política SOF estándar con sus pasos en orden', async () => {
    const ctx = makeCtx({ permissions: ['requests.create'] });
    await expect(previewRoute(ctx, { docType: 'SOF', total: '1250.00' }, deps)).resolves.toEqual({
      docType: 'SOF',
      policyName: 'SOF estándar',
      steps: [
        {
          order: 1,
          name: 'Almacén',
          approverType: 'role',
          role: 'warehouse',
          approvers: [],
          rule: 'any',
        },
        {
          order: 2,
          name: 'Gerencia local',
          approverType: 'role',
          role: 'approver',
          approvers: [],
          rule: 'any',
        },
      ],
    });
  });

  it('quien administra políticas también la ve', async () => {
    const ctx = makeCtx({ permissions: ['approval_policies.manage'] });
    await expect(
      previewRoute(ctx, { docType: 'SOF', total: '1250.00' }, deps),
    ).resolves.toMatchObject({
      policyName: STANDARD_SOF_POLICY.name,
    });
  });

  it('pasa el tipo y el total a la fuente de políticas', async () => {
    const seen: unknown[] = [];
    const spy = {
      policies: {
        activeFor: (_ctx: unknown, query: unknown) => {
          seen.push(query);
          return Promise.resolve(STANDARD_SOF_POLICY);
        },
      },
    };
    const ctx = makeCtx({ permissions: ['requests.create'] });
    await previewRoute(ctx, { docType: 'SOF', total: null }, spy);
    expect(seen).toEqual([{ docType: 'SOF', total: null }]);
  });

  it('sin permiso lanza ForbiddenError y no consulta la política', async () => {
    let called = false;
    const spy = {
      policies: {
        activeFor: () => {
          called = true;
          return Promise.resolve(STANDARD_SOF_POLICY);
        },
      },
    };
    const ctx = makeCtx({ permissions: ['requests.read_own'] });
    await expect(
      previewRoute(ctx, { docType: 'SOF', total: '1250.00' }, spy),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(called).toBe(false);
  });
});

describe('toRoutePreview', () => {
  it('ordena los pasos por su número', () => {
    const policy: ApprovalPolicy = {
      name: 'Prueba',
      steps: [
        { order: 2, name: 'B', approverType: 'role', role: 'approver', approvers: [], rule: 'all' },
        {
          order: 1,
          name: 'A',
          approverType: 'users',
          approvers: [{ userId: 'u1', name: 'Ana Pérez' }],
          rule: 'any',
        },
      ],
    };
    const preview = toRoutePreview('SOF', policy, '10.00');
    expect(preview.steps.map((s) => s.name)).toEqual(['A', 'B']);
    expect(preview.steps[0]).toMatchObject({ approverType: 'users' });
  });
});
