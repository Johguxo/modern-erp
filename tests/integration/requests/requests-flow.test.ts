// E3-H1 · Casos de uso contra la base real: borrador → edición → envío, bloqueo optimista,
// visibilidad y aislamiento entre dos tenants (A y B).
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { closeDatabases, getDbAdmin } from '@/db/admin';
import { auditEvents, requestLines } from '@/db/schema';
import {
  createDraft,
  getRequest,
  submitRequest,
  updateDraft,
  type RequestView,
} from '@/modules/requests';
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
  A = await seedRequestsWorld(fx, { nextNumber: 143 });
  B = await seedRequestsWorld(fx, { prefix: 'GR-', nextNumber: 1 });
});

afterAll(async () => {
  await fx.cleanup();
  await closeDatabases();
});

const create = (world: RequestsWorld, overrides: Record<string, unknown> = {}) =>
  runRequests(world.ctx, (deps) => createDraft(world.ctx, draftInput(world, overrides), deps));

const edit = (world: RequestsWorld, draft: RequestView, overrides: Record<string, unknown> = {}) =>
  runRequests(world.ctx, (deps) =>
    updateDraft(
      world.ctx,
      { ...draftInput(world, overrides), id: draft.id, version: draft.version },
      deps,
    ),
  );

describe('borrador', () => {
  it('se crea con precios del catálogo, total del servidor y sin número', async () => {
    const draft = await create(A);

    // 2 × 12.5 = 25.00; 2.5 × 3.3333 = 8.33325 → 8.33.
    expect(draft).toMatchObject({
      status: 'draft',
      number: null,
      version: 1,
      currency: 'PEN',
      warehouseId: A.warehouseId,
      requesterId: A.userId,
      totalAmount: '33.33',
    });
    expect(
      draft.lines.map((l) => [l.lineNo, l.productCode, l.quantity, l.unitPrice, l.subtotal]),
    ).toEqual([
      [1, 'FIL-1', '2.000', '12.5000', '25.00'],
      [2, 'PER-2', '2.500', '3.3333', '8.33'],
    ]);
    const actions = await getDbAdmin()
      .select({ action: auditEvents.action })
      .from(auditEvents)
      .where(eq(auditEvents.entityId, draft.id));
    expect(actions.map((a) => a.action)).toEqual(['request.created']);
  });

  it('un producto sin precio entra con precio 0; en otra moneda se rechaza', async () => {
    const free = await create(A, {
      lines: [{ productId: A.productIds.noPrice, quantity: '3', equipmentId: null, notes: null }],
    });
    expect(free.lines[0]).toMatchObject({ unitPrice: '0.0000', subtotal: '0.00' });
    expect(free.totalAmount).toBe('0.00');

    await expect(
      create(A, {
        lines: [{ productId: A.productIds.usd, quantity: '1', equipmentId: null, notes: null }],
      }),
    ).rejects.toMatchObject({
      code: 'VALIDATION',
      fieldErrors: { 'lines.0.productId': ['product_currency_mismatch'] },
    });
  });

  it('se edita reemplazando líneas (line_no 1..n) y sube la versión', async () => {
    const draft = await create(A);

    const updated = await edit(A, draft, {
      reason: 'Otro motivo',
      lines: [{ productId: A.productIds.bolt, quantity: '4', equipmentId: null, notes: 'nota' }],
    });

    expect(updated).toMatchObject({ version: 2, reason: 'Otro motivo', totalAmount: '13.33' });
    expect(updated.lines).toHaveLength(1);
    expect(updated.lines[0]).toMatchObject({ lineNo: 1, quantity: '4.000', notes: 'nota' });
    const rows = await getDbAdmin()
      .select()
      .from(requestLines)
      .where(eq(requestLines.requestId, draft.id));
    expect(rows).toHaveLength(1);
  });
});

describe('bloqueo optimista (version)', () => {
  it('una versión obsoleta → ConflictError stale_version', async () => {
    const draft = await create(A);
    await edit(A, draft);

    await expect(edit(A, draft)).rejects.toMatchObject({
      code: 'CONFLICT',
      reason: 'stale_version',
    });
    await expect(
      runRequests(A.ctx, (deps) =>
        submitRequest(A.ctx, { id: draft.id, version: draft.version }, deps),
      ),
    ).rejects.toMatchObject({ reason: 'stale_version' });
  });

  it('dos ediciones simultáneas con la misma versión: una se aplica y la otra falla', async () => {
    const draft = await create(A);

    const results = await Promise.allSettled([
      edit(A, draft, { reason: 'Edición 1' }),
      edit(A, draft, { reason: 'Edición 2' }),
    ]);

    const ok = results.filter((r) => r.status === 'fulfilled');
    const failed = results.filter((r) => r.status === 'rejected');
    expect(ok).toHaveLength(1);
    expect(failed).toHaveLength(1);
    expect(failed[0]?.status === 'rejected' ? failed[0].reason : null).toMatchObject({
      reason: 'stale_version',
    });
    const current = await runRequests(A.ctx, (deps) => getRequest(A.ctx, { id: draft.id }, deps));
    expect(current.version).toBe(2);
  }, 30_000);
});

describe('envío', () => {
  it('asigna número desde la secuencia, congela y deja in_approval', async () => {
    const draft = await create(A);

    const sent = await runRequests(A.ctx, (deps) =>
      submitRequest(A.ctx, { id: draft.id, version: draft.version }, deps),
    );

    expect(sent).toMatchObject({
      status: 'in_approval',
      version: 2,
      submittedAt: '2026-11-25T15:00:00.000Z',
      totalAmount: '33.33',
    });
    expect(sent.number).toMatch(/^SOF-\d{4}$/);
    const again = await runRequests(A.ctx, (deps) => getRequest(A.ctx, { id: draft.id }, deps));
    expect(again.number).toBe(sent.number);
  });

  it('un SOF enviado ya no se edita ni se vuelve a enviar', async () => {
    const draft = await create(A);
    const sent = await runRequests(A.ctx, (deps) =>
      submitRequest(A.ctx, { id: draft.id, version: draft.version }, deps),
    );

    await expect(edit(A, sent)).rejects.toMatchObject({
      code: 'INVALID_TRANSITION',
      from: 'in_approval',
      event: 'edit',
    });
    await expect(
      runRequests(A.ctx, (deps) =>
        submitRequest(A.ctx, { id: draft.id, version: sent.version }, deps),
      ),
    ).rejects.toMatchObject({ code: 'INVALID_TRANSITION', from: 'in_approval', event: 'submit' });
  });

  it('los números de cada tenant son independientes', async () => {
    const draftB = await create(B);

    const sentB = await runRequests(B.ctx, (deps) =>
      submitRequest(B.ctx, { id: draftB.id, version: draftB.version }, deps),
    );

    expect(sentB.number).toBe('GR-0001');
  });
});

describe('visibilidad y aislamiento entre tenants', () => {
  it('el borrador solo lo ve su solicitante; otro con requests.read_all del mismo tenant no', async () => {
    const draft = await create(A);
    const reader = makeCtx({
      tenantId: A.tenantId,
      userId: (await fx.user()).id,
      permissions: ['requests.read_all'],
    });

    await expect(
      runRequests(reader, (deps) => getRequest(reader, { id: draft.id }, deps)),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect((await runRequests(A.ctx, (deps) => getRequest(A.ctx, { id: draft.id }, deps))).id).toBe(
      draft.id,
    );
  });

  it('un SOF enviado lo ve quien tiene requests.read_all', async () => {
    const draft = await create(A);
    await runRequests(A.ctx, (deps) =>
      submitRequest(A.ctx, { id: draft.id, version: draft.version }, deps),
    );
    const reader = makeCtx({
      tenantId: A.tenantId,
      userId: (await fx.user()).id,
      permissions: ['requests.read_all'],
    });

    const seen = await runRequests(reader, (deps) => getRequest(reader, { id: draft.id }, deps));

    expect(seen.status).toBe('in_approval');
  });

  it('el tenant B no ve, edita ni envía solicitudes del tenant A (404, no 403)', async () => {
    const draft = await create(A);
    const sent = await create(A).then((d) =>
      runRequests(A.ctx, (deps) => submitRequest(A.ctx, { id: d.id, version: d.version }, deps)),
    );
    // Un usuario de B con todos los permisos de lectura y escritura.
    const intruder = makeCtx({
      tenantId: B.tenantId,
      userId: B.userId,
      permissions: ['requests.create', 'requests.read_own', 'requests.read_all'],
    });

    for (const id of [draft.id, sent.id]) {
      await expect(
        runRequests(intruder, (deps) => getRequest(intruder, { id }, deps)),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
      await expect(
        runRequests(intruder, (deps) =>
          updateDraft(intruder, { ...draftInput(B), id, version: 1 }, deps),
        ),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
      await expect(
        runRequests(intruder, (deps) => submitRequest(intruder, { id, version: 1 }, deps)),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    }
  });

  it('no se pueden usar productos, equipos ni centros de costo de otro tenant', async () => {
    await expect(
      create(A, {
        lines: [{ productId: B.productIds.filter, quantity: '1', equipmentId: null, notes: null }],
      }),
    ).rejects.toMatchObject({
      fieldErrors: { 'lines.0.productId': ['product_not_available'] },
    });
    await expect(create(A, { costCenterId: B.costCenterId })).rejects.toMatchObject({
      fieldErrors: { costCenterId: ['cost_center_not_available'] },
    });
    await expect(
      create(A, {
        lines: [
          {
            productId: A.productIds.filter,
            quantity: '1',
            equipmentId: B.equipmentId,
            notes: null,
          },
        ],
      }),
    ).rejects.toMatchObject({
      fieldErrors: { 'lines.0.equipmentId': ['equipment_not_available'] },
    });
  });

  it('sin requests.create no se crea nada', async () => {
    const readOnly = makeCtx({
      tenantId: A.tenantId,
      userId: A.userId,
      permissions: ['requests.read_own'],
    });

    await expect(
      runRequests(readOnly, (deps) => createDraft(readOnly, draftInput(A), deps)),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});
