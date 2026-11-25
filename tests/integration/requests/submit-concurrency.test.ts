// E3-H1 · Numeración al enviar con bloqueo de fila: 20 envíos simultáneos reales (cada uno en su
// propia transacción y conexión) reciben 20 números distintos y consecutivos. Un envío que falla
// (por ejemplo, porque el arranque de la aprobación lanza) no consume número.
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { closeDatabases, getDbAdmin } from '@/db/admin';
import { documentSequences, requests } from '@/db/schema';
import { createDraft, submitRequest } from '@/modules/requests';

import { createIdentityFixtures } from '../helpers/identity-fixtures';
import {
  draftInput,
  runRequests,
  seedRequestsWorld,
  type RequestsWorld,
} from '../helpers/requests-fixtures';

const fx = createIdentityFixtures();
const TOTAL = 20;
let world: RequestsWorld;

beforeAll(async () => {
  world = await seedRequestsWorld(fx, { prefix: 'SOF-', nextNumber: 144 });
});

afterAll(async () => {
  await fx.cleanup();
  await closeDatabases();
});

const sequenceRow = async () => {
  const [row] = await getDbAdmin()
    .select()
    .from(documentSequences)
    .where(
      and(eq(documentSequences.tenantId, world.tenantId), eq(documentSequences.docType, 'SOF')),
    );
  return row;
};

describe('numeración concurrente', () => {
  it('20 envíos simultáneos → SOF-0144 … SOF-0163, sin repetir ni saltar', async () => {
    const drafts = await Promise.all(
      Array.from({ length: TOTAL }, () =>
        runRequests(world.ctx, (deps) => createDraft(world.ctx, draftInput(world), deps)),
      ),
    );
    expect(drafts.every((d) => d.number === null && d.status === 'draft')).toBe(true);
    // Los borradores no consumen número.
    expect((await sequenceRow())?.nextNumber).toBe(144);

    const started = performance.now();
    const sent = await Promise.all(
      drafts.map((draft) =>
        runRequests(world.ctx, (deps) =>
          submitRequest(world.ctx, { id: draft.id, version: draft.version }, deps),
        ),
      ),
    );
    const elapsedMs = Math.round(performance.now() - started);

    const numbers = sent.map((r) => r.number ?? '').sort();
    const expected = Array.from(
      { length: TOTAL },
      (_, i) => `SOF-${String(144 + i).padStart(4, '0')}`,
    );
    // Quedan visibles en el log de la prueba para el reporte de la historia.
    process.stdout.write(
      `[E3-H1] ${TOTAL} envíos concurrentes en ${elapsedMs} ms: ${numbers[0]} … ${numbers.at(-1)}\n`,
    );
    expect(numbers).toEqual(expected);
    expect(new Set(numbers).size).toBe(TOTAL);
    expect(sent.every((r) => r.status === 'in_approval' && r.version === 2)).toBe(true);

    const row = await sequenceRow();
    expect(row).toMatchObject({ nextNumber: 144 + TOTAL, lastIssuedNumber: 143 + TOTAL });
  }, 60_000);

  it('un envío cuyo ApprovalStarter lanza se revierte completo y no consume número', async () => {
    const before = await sequenceRow();
    const draft = await runRequests(world.ctx, (deps) =>
      createDraft(world.ctx, draftInput(world), deps),
    );

    await expect(
      runRequests(
        world.ctx,
        (deps) => submitRequest(world.ctx, { id: draft.id, version: draft.version }, deps),
        { approvals: { start: () => Promise.reject(new Error('approvals down')) } },
      ),
    ).rejects.toThrow('approvals down');

    const after = await sequenceRow();
    expect(after).toMatchObject({
      nextNumber: before?.nextNumber,
      lastIssuedNumber: before?.lastIssuedNumber,
    });
    const [row] = await getDbAdmin().select().from(requests).where(eq(requests.id, draft.id));
    expect(row).toMatchObject({ status: 'draft', number: null, submittedAt: null, version: 1 });

    // El siguiente envío sano recibe exactamente el número que no se consumió.
    const retry = await runRequests(world.ctx, (deps) =>
      submitRequest(world.ctx, { id: draft.id, version: draft.version }, deps),
    );
    expect(retry.number).toBe(`SOF-${String(before?.nextNumber ?? 0).padStart(4, '0')}`);
  }, 30_000);

  it('un envío incompleto (sin motivo) tampoco consume número', async () => {
    const before = await sequenceRow();
    const draft = await runRequests(world.ctx, (deps) =>
      createDraft(world.ctx, draftInput(world, { reason: null }), deps),
    );

    await expect(
      runRequests(world.ctx, (deps) =>
        submitRequest(world.ctx, { id: draft.id, version: draft.version }, deps),
      ),
    ).rejects.toMatchObject({ code: 'VALIDATION', reason: 'request_incomplete' });

    expect((await sequenceRow())?.nextNumber).toBe(before?.nextNumber);
  });

  it('dos envíos simultáneos del mismo borrador: uno gana y el otro falla sin consumir número', async () => {
    const before = await sequenceRow();
    const draft = await runRequests(world.ctx, (deps) =>
      createDraft(world.ctx, draftInput(world), deps),
    );
    const submit = () =>
      runRequests(world.ctx, (deps) =>
        submitRequest(world.ctx, { id: draft.id, version: draft.version }, deps),
      );

    const results = await Promise.allSettled([submit(), submit()]);

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const failed = results.find((r) => r.status === 'rejected');
    expect(failed?.status === 'rejected' ? (failed.reason as { code: string }).code : '').toMatch(
      /CONFLICT|INVALID_TRANSITION/,
    );
    expect((await sequenceRow())?.nextNumber).toBe((before?.nextNumber ?? 0) + 1);
  }, 30_000);
});
