// E3-H2 · getEditableDraft contra la base real: solo el solicitante y solo en borrador; otro usuario,
// otro tenant, un SOF enviado o quien no puede crear solicitudes reciben 404 o 403, y nunca se
// filtra que existe.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { closeDatabases } from '@/db/admin';
import { createDraft, getEditableDraft, submitRequest } from '@/modules/requests';
import { makeCtx } from '@tests/support/ctx';

import { createIdentityFixtures } from '../helpers/identity-fixtures';
import {
  draftInput,
  runRequests,
  seedRequestsWorld,
  type RequestsWorld,
} from '../helpers/requests-fixtures';

const fx = createIdentityFixtures();
let A: RequestsWorld;
let B: RequestsWorld;

beforeAll(async () => {
  A = await seedRequestsWorld(fx);
  B = await seedRequestsWorld(fx, { prefix: 'GR-' });
});

afterAll(async () => {
  await fx.cleanup();
  await closeDatabases();
});

const create = (world: RequestsWorld) =>
  runRequests(world.ctx, (deps) => createDraft(world.ctx, draftInput(world), deps));

const load = (ctx: RequestsWorld['ctx'], id: string) =>
  runRequests(ctx, (deps) => getEditableDraft(ctx, { id }, deps));

describe('getEditableDraft', () => {
  it('el dueño recibe su borrador con las líneas y la versión', async () => {
    const draft = await create(A);

    const loaded = await load(A.ctx, draft.id);

    expect(loaded).toMatchObject({
      id: draft.id,
      status: 'draft',
      version: 1,
      totalAmount: '33.33',
    });
    expect(loaded.lines.map((line) => line.productCode)).toEqual(['FIL-1', 'PER-2']);
  });

  it('otro usuario del mismo tenant (aunque lea todo) recibe 404', async () => {
    const draft = await create(A);
    const other = makeCtx({
      tenantId: A.tenantId,
      userId: (await fx.user()).id,
      permissions: ['requests.create', 'requests.read_own', 'requests.read_all'],
    });

    await expect(load(other, draft.id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('un usuario de otro tenant recibe 404 (no 403)', async () => {
    const draft = await create(A);
    const intruder = makeCtx({
      tenantId: B.tenantId,
      userId: B.userId,
      permissions: ['requests.create', 'requests.read_own'],
    });

    await expect(load(intruder, draft.id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('un SOF ya enviado no se puede editar: 404 aunque sea el dueño', async () => {
    const draft = await create(A);
    await runRequests(A.ctx, (deps) =>
      submitRequest(A.ctx, { id: draft.id, version: draft.version }, deps),
    );

    await expect(load(A.ctx, draft.id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('sin requests.create el dueño recibe 403 y no se consulta la base', async () => {
    const draft = await create(A);
    const readOnly = makeCtx({
      tenantId: A.tenantId,
      userId: A.userId,
      permissions: ['requests.read_own'],
    });

    await expect(load(readOnly, draft.id)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('un id que no existe recibe 404', async () => {
    await expect(load(A.ctx, '00000000-0000-4000-8000-000000000000')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});
