// E4-H2 · Decisiones simultáneas reales: cada una corre en su propia transacción y conexión
// (Promise.allSettled). Con la regla `any`, solo cuenta la primera decisión y la segunda recibe
// `step_already_decided` (flujo §8, caso 1); con `all`, la segunda recibe `stale_version`.
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { closeDatabases, getDbAdmin } from '@/db/admin';
import { requests } from '@/db/schema';

import {
  decideAs,
  seedApprovalWorld,
  sendRequest,
  setPolicySteps,
  storedAssignees,
  storedEvents,
  storedInstances,
  storedSteps,
  type ApprovalWorld,
} from '../helpers/approvals-fixtures';
import { createIdentityFixtures } from '../helpers/identity-fixtures';

const fx = createIdentityFixtures();
let W: ApprovalWorld;
const ROUNDS = 5;

beforeAll(async () => {
  W = await seedApprovalWorld(fx);
});

afterAll(async () => {
  await fx.cleanup();
  await closeDatabases();
});

type Settled = PromiseSettledResult<unknown>;
const ok = (results: Settled[]) => results.filter((r) => r.status === 'fulfilled');
const failures = (results: Settled[]) =>
  results.flatMap((r) =>
    r.status === 'rejected' ? [r.reason as { code?: string; reason?: string }] : [],
  );

async function decideTogether(requestId: string, version: number, stepId: string) {
  const input = { id: requestId, version, stepId, decision: 'approve' as const, comment: null };
  return Promise.allSettled([decideAs(W.ana, input), decideAs(W.rosa, input)]);
}

describe('dos aprobadores de un paso any deciden a la vez', () => {
  it.each([
    [
      'con un paso siguiente',
      [{ name: 'Almacén' }, { name: 'Gerencia', role: 'approver' as const }],
    ],
    ['siendo el último paso', [{ name: 'Almacén' }]],
  ])(
    '%s: exactamente 1 ok y 1 step_already_decided, una sola decisión y un solo evento',
    async (_label, steps) => {
      await setPolicySteps(W.world.tenantId, steps);
      for (let round = 1; round <= ROUNDS; round += 1) {
        const sent = await sendRequest(W.world);
        const stepId = (await storedSteps(sent.id))[0]?.id ?? '';

        const results = await decideTogether(sent.id, sent.version, stepId);

        expect(ok(results)).toHaveLength(1);
        const [failed] = failures(results);
        expect(failures(results)).toHaveLength(1);
        expect(failed).toMatchObject({ code: 'CONFLICT', reason: 'step_already_decided' });

        const assignees = await storedAssignees(stepId);
        expect(assignees.filter((a) => a.decision !== null)).toHaveLength(1);
        expect((await storedSteps(sent.id))[0]?.status).toBe('approved');
        const events = await storedEvents(sent.id);
        expect(events.filter((e) => e.type === 'step_approved')).toHaveLength(1);
        expect(events.filter((e) => e.type === 'step_pending')).toHaveLength(
          steps.length > 1 ? 2 : 1,
        );
        const [row] = await getDbAdmin().select().from(requests).where(eq(requests.id, sent.id));
        expect(row?.version).toBe(sent.version + 1);
        expect((await storedInstances(sent.id))[0]?.status).toBe(
          steps.length > 1 ? 'in_progress' : 'approved',
        );
      }
    },
    60_000,
  );
});

describe('dos aprobadores de un paso all deciden a la vez', () => {
  it('1 ok y 1 stale_version: no se guarda la segunda decisión', async () => {
    await setPolicySteps(W.world.tenantId, [{ name: 'Almacén', rule: 'all' }]);
    for (let round = 1; round <= ROUNDS; round += 1) {
      const sent = await sendRequest(W.world);
      const stepId = (await storedSteps(sent.id))[0]?.id ?? '';

      const results = await decideTogether(sent.id, sent.version, stepId);

      expect(ok(results)).toHaveLength(1);
      expect(failures(results)).toEqual([expect.objectContaining({ code: 'CONFLICT' })]);
      expect(failures(results)[0]?.reason).toBe('stale_version');

      const assignees = await storedAssignees(stepId);
      expect(assignees.filter((a) => a.decision !== null)).toHaveLength(1);
      expect((await storedSteps(sent.id))[0]?.status).toBe('pending');
      expect((await storedEvents(sent.id)).filter((e) => e.type === 'step_approved')).toHaveLength(
        1,
      );
    }
  }, 60_000);
});
