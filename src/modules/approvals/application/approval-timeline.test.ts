import { describe, expect, it, vi } from 'vitest';

import type { Ctx } from '@/shared/context';

import { createApprovalTimeline } from './approval-timeline';

const ctx = { tenantId: 't1', userId: 'u1', permissions: new Set() } as unknown as Ctx;

describe('createApprovalTimeline', () => {
  it('sin instancia devuelve null', async () => {
    const timelineSource = vi.fn(() => Promise.resolve(null));
    expect(await createApprovalTimeline({ timelineSource }).getTimeline(ctx, 'r1')).toBeNull();
    expect(timelineSource).toHaveBeenCalledWith('t1', 'r1');
  });

  it('arma los ítems con la fuente del tenant del ctx', async () => {
    const view = createApprovalTimeline({
      timelineSource: () =>
        Promise.resolve({
          instanceStatus: 'approved' as const,
          events: [
            {
              id: 'e1',
              type: 'approved',
              actorUserId: null,
              comment: null,
              createdAt: new Date('2026-11-25T14:00:00.000Z'),
              stepName: null,
              stepRule: null,
            },
          ],
          openSteps: [],
        }),
    });
    const entries = await view.getTimeline(ctx, 'r1');
    expect(entries?.map((entry) => entry.kind)).toEqual(['approved']);
  });
});
