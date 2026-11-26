import { describe, expect, it, vi } from 'vitest';

import type { Ctx } from '@/shared/context';

import { createApprovalAssignments } from './approval-queries';
import type { ApprovalQueries } from './ports';

function ctxWith(permissions: Ctx['permissions']): Ctx {
  return { tenantId: 't1', userId: 'u1', permissions } as unknown as Ctx;
}

const assigned = vi.fn(() => Promise.resolve(['r1']));
const pending = vi.fn(() => Promise.resolve(['r1']));

function queries(): ApprovalQueries {
  return {
    assignedRequestIds: assigned,
    isAssigned: () => Promise.resolve(true),
    pendingRequestIds: pending,
    pendingStepId: () => Promise.resolve('s1'),
    timelineSource: () => Promise.resolve(null),
  };
}

describe('createApprovalAssignments', () => {
  it('sin approvals.decide no hay asignaciones ni pendientes (sin consultar)', async () => {
    const view = createApprovalAssignments(queries());
    const ctx = ctxWith(new Set(['requests.read_own']));
    expect(await view.assignedRequestIds(ctx)).toEqual([]);
    expect(await view.isAssigned(ctx, 'r1')).toBe(false);
    expect(await view.pendingRequestIds(ctx)).toEqual([]);
    expect(await view.pendingStepId(ctx, 'r1')).toBeNull();
    expect(assigned).not.toHaveBeenCalled();
    expect(pending).not.toHaveBeenCalled();
  });

  it('con approvals.decide consulta al repositorio', async () => {
    const view = createApprovalAssignments(queries());
    const ctx = ctxWith(new Set(['approvals.decide']));
    expect(await view.assignedRequestIds(ctx)).toEqual(['r1']);
    expect(await view.isAssigned(ctx, 'r1')).toBe(true);
    expect(await view.pendingRequestIds(ctx)).toEqual(['r1']);
    expect(await view.pendingStepId(ctx, 'r1')).toBe('s1');
  });
});
