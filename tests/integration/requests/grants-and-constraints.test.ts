// E3-H1 · Grants de app_user (migración 0011), la política restrictiva de DELETE de líneas, checks,
// unicidad e índices de las tablas de requests. Las operaciones se prueban dentro de withTenant(A)
// sobre filas de A: si fallan con "permission denied" (42501), es el grant el que las niega.
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { closeDatabases, getDbAdmin } from '@/db/admin';
import { documentSequences, requestLineRevisions, requestLines, requests } from '@/db/schema';
import { withTenant } from '@/db/with-tenant';

import { capturePgError, createIdentityFixtures } from '../helpers/identity-fixtures';
import { seedRequestsWorld, type RequestsWorld } from '../helpers/requests-fixtures';

const fx = createIdentityFixtures();
let A: RequestsWorld;
let B: RequestsWorld;
let draftId: string;
let lineId: string;

const scope = () => ({ tenantId: A.tenantId, userId: A.userId });
const admin = () => getDbAdmin();

const requestValues = (world: RequestsWorld, extra: Record<string, unknown> = {}) => ({
  tenantId: world.tenantId,
  requesterId: world.userId,
  warehouseId: world.warehouseId,
  currency: 'PEN',
  ...extra,
});

const lineValues = (
  world: RequestsWorld,
  requestId: string,
  extra: Record<string, unknown> = {},
) => ({
  tenantId: world.tenantId,
  requestId,
  lineNo: 1,
  productId: world.productIds.filter,
  productCodeSnapshot: 'FIL-1',
  descriptionSnapshot: 'Filtro',
  unitSnapshot: 'UND',
  quantity: '1.000',
  unitPrice: '12.5000',
  subtotal: '12.50',
  ...extra,
});

async function insertRequest(world: RequestsWorld, extra: Record<string, unknown> = {}) {
  const [row] = await admin()
    .insert(requests)
    .values(requestValues(world, extra) as typeof requests.$inferInsert)
    .returning({ id: requests.id });
  if (!row) throw new Error('request no creada');
  return row.id;
}

async function insertLine(
  world: RequestsWorld,
  requestId: string,
  extra: Record<string, unknown> = {},
) {
  const [row] = await admin()
    .insert(requestLines)
    .values(lineValues(world, requestId, extra) as typeof requestLines.$inferInsert)
    .returning({ id: requestLines.id });
  if (!row) throw new Error('línea no creada');
  return row.id;
}

beforeAll(async () => {
  A = await seedRequestsWorld(fx);
  B = await seedRequestsWorld(fx);
  draftId = await insertRequest(A);
  lineId = await insertLine(A, draftId);
});

afterAll(async () => {
  await fx.cleanup();
  await closeDatabases();
});

async function expectDenied(fn: () => Promise<unknown>): Promise<void> {
  const error = await capturePgError(fn);
  expect(error.code).toBe('42501');
  expect(error.message).toContain('permission denied');
}

describe('grants de app_user', () => {
  it('document_sequences: sin INSERT ni DELETE; UPDATE solo de prefijo, siguiente número y último emitido', async () => {
    await expectDenied(() =>
      withTenant(scope(), (tx) =>
        tx.execute(
          sql`insert into document_sequences (tenant_id, doc_type, prefix) values (${A.tenantId}, 'SOF', 'X-')`,
        ),
      ),
    );
    await expectDenied(() =>
      withTenant(scope(), (tx) =>
        tx.execute(sql`delete from document_sequences where tenant_id = ${A.tenantId}`),
      ),
    );
    for (const statement of [
      sql`update document_sequences set padding = 6 where tenant_id = ${A.tenantId}`,
      sql`update document_sequences set doc_type = 'SOF' where tenant_id = ${A.tenantId}`,
      sql`update document_sequences set tenant_id = ${B.tenantId} where tenant_id = ${A.tenantId}`,
      sql`update document_sequences set created_at = now() where tenant_id = ${A.tenantId}`,
    ]) {
      await expectDenied(() => withTenant(scope(), (tx) => tx.execute(statement)));
    }

    await withTenant(scope(), (tx) =>
      tx
        .update(documentSequences)
        .set({ prefix: 'GR-', nextNumber: 20, lastIssuedNumber: 19 })
        .where(eq(documentSequences.tenantId, A.tenantId)),
    );
    const [row] = await admin()
      .select()
      .from(documentSequences)
      .where(eq(documentSequences.tenantId, A.tenantId));
    expect(row).toMatchObject({ prefix: 'GR-', nextNumber: 20, lastIssuedNumber: 19, padding: 4 });
  });

  it('requests: sin DELETE; UPDATE solo de las columnas del flujo', async () => {
    await expectDenied(() =>
      withTenant(scope(), (tx) => tx.execute(sql`delete from requests where id = ${draftId}`)),
    );
    for (const statement of [
      sql`update requests set requester_id = ${B.userId} where id = ${draftId}`,
      sql`update requests set currency = 'USD' where id = ${draftId}`,
      sql`update requests set doc_type = 'SOF' where id = ${draftId}`,
      sql`update requests set tenant_id = ${B.tenantId} where id = ${draftId}`,
      sql`update requests set created_at = now() where id = ${draftId}`,
    ]) {
      await expectDenied(() => withTenant(scope(), (tx) => tx.execute(statement)));
    }

    await withTenant(scope(), (tx) =>
      tx
        .update(requests)
        .set({ reason: 'ok', costCenterId: A.costCenterId, totalAmount: '5.00', version: 2 })
        .where(eq(requests.id, draftId)),
    );
    const [row] = await admin().select().from(requests).where(eq(requests.id, draftId));
    expect(row).toMatchObject({ reason: 'ok', totalAmount: '5.00', version: 2 });
  });

  it('request_lines: UPDATE solo de campos de línea', async () => {
    for (const statement of [
      sql`update request_lines set tenant_id = ${B.tenantId} where id = ${lineId}`,
      sql`update request_lines set request_id = ${draftId} where id = ${lineId}`,
      sql`update request_lines set created_at = now() where id = ${lineId}`,
    ]) {
      await expectDenied(() => withTenant(scope(), (tx) => tx.execute(statement)));
    }
    await withTenant(scope(), (tx) =>
      tx
        .update(requestLines)
        .set({ quantity: '3.000', subtotal: '37.50', revision: 2, status: 'removed' })
        .where(eq(requestLines.id, lineId)),
    );
    await withTenant(scope(), (tx) =>
      tx
        .update(requestLines)
        .set({ status: 'active', revision: 1, quantity: '1.000', subtotal: '12.50' })
        .where(eq(requestLines.id, lineId)),
    );
  });

  it('request_line_revisions: solo insert y lectura (UPDATE y DELETE → 42501)', async () => {
    const [revision] = await withTenant(scope(), (tx) =>
      tx
        .insert(requestLineRevisions)
        .values({
          tenantId: A.tenantId,
          requestId: draftId,
          requestLineId: lineId,
          revision: 1,
          snapshot: { quantity: '1.000' },
          changedBy: A.userId,
          reason: 'corrección',
        })
        .returning({ id: requestLineRevisions.id }),
    );
    expect(revision).toBeDefined();
    await expectDenied(() =>
      withTenant(scope(), (tx) =>
        tx.execute(
          sql`update request_line_revisions set reason = 'x' where id = ${revision?.id ?? ''}`,
        ),
      ),
    );
    await expectDenied(() =>
      withTenant(scope(), (tx) =>
        tx.execute(sql`delete from request_line_revisions where id = ${revision?.id ?? ''}`),
      ),
    );
  });
});

describe('DELETE de líneas solo con la solicitud en borrador (política restrictiva)', () => {
  it('con la solicitud en borrador se borran', async () => {
    const requestId = await insertRequest(A);
    await insertLine(A, requestId);
    await insertLine(A, requestId, { lineNo: 2 });

    const deleted = await withTenant(scope(), (tx) =>
      tx.execute(sql`delete from request_lines where request_id = ${requestId} returning id`),
    );

    expect(deleted).toHaveLength(2);
  });

  it.each(['in_approval', 'changes_requested', 'approved', 'delivered', 'rejected', 'cancelled'])(
    'con la solicitud en %s no se borra ninguna línea',
    async (status) => {
      const requestId = await insertRequest(A, {
        status,
        number: `T-${status}-${Math.random().toString(36).slice(2, 8)}`.toUpperCase(),
        submittedAt: new Date('2026-11-25T15:00:00.000Z'),
      });
      const keptLine = await insertLine(A, requestId);

      const deleted = await withTenant(scope(), (tx) =>
        tx.execute(sql`delete from request_lines where id = ${keptLine} returning id`),
      );

      expect(deleted).toHaveLength(0);
      const rows = await admin()
        .select({ id: requestLines.id })
        .from(requestLines)
        .where(eq(requestLines.id, keptLine));
      expect(rows).toHaveLength(1);
    },
  );
});

describe('guarda de la secuencia (trigger document_sequences_guard, migración 0012)', () => {
  const setSequence = (tenantId: string, userId: string, values: Record<string, number | null>) =>
    withTenant({ tenantId, userId }, (tx) =>
      tx
        .update(documentSequences)
        .set(values as Partial<typeof documentSequences.$inferInsert>)
        .where(eq(documentSequences.tenantId, tenantId)),
    );
  const read = async (tenantId: string) => {
    const [row] = await admin()
      .select()
      .from(documentSequences)
      .where(eq(documentSequences.tenantId, tenantId));
    return row;
  };

  it('no deja bajar ni anular el último emitido, ni dejar el siguiente en un número ya emitido', async () => {
    const world = await seedRequestsWorld(fx);
    await setSequence(world.tenantId, world.userId, { nextNumber: 11, lastIssuedNumber: 10 });
    const fails = async (values: Record<string, number | null>) =>
      expect((await capturePgError(() => setSequence(world.tenantId, world.userId, values))).code).toBe(
        '23514',
      );

    await fails({ lastIssuedNumber: null });
    await fails({ lastIssuedNumber: 9 });
    await fails({ nextNumber: 10 });
    await fails({ nextNumber: 5 });
    await fails({ nextNumber: 9, lastIssuedNumber: 9 });
    expect(await read(world.tenantId)).toMatchObject({ nextNumber: 11, lastIssuedNumber: 10 });

    await setSequence(world.tenantId, world.userId, { nextNumber: 11 });
    await setSequence(world.tenantId, world.userId, { nextNumber: 21 });
    await setSequence(world.tenantId, world.userId, { nextNumber: 31, lastIssuedNumber: 30 });
    expect(await read(world.tenantId)).toMatchObject({ nextNumber: 31, lastIssuedNumber: 30 });
  });
});

describe('checks y unicidad', () => {
  const failsWith = async (fn: () => Promise<unknown>, code = '23514') =>
    expect((await capturePgError(fn)).code).toBe(code);

  it('document_sequences: prefijo, siguiente número, relleno y último emitido', async () => {
    const tenant = await fx.tenant();
    const insert = (values: Record<string, unknown>) => () =>
      admin()
        .insert(documentSequences)
        .values({
          tenantId: tenant.id,
          docType: 'SOF',
          prefix: 'SOF-',
          ...values,
        } as typeof documentSequences.$inferInsert);

    for (const prefix of ['', 'sof-', 'SO F-', '-SOF', 'ABCDEFGHIJKLMNOPQ']) {
      await failsWith(insert({ prefix }));
    }
    await failsWith(insert({ nextNumber: 0 }));
    await failsWith(insert({ padding: 0 }));
    await failsWith(insert({ padding: 11 }));
    await failsWith(insert({ nextNumber: 5, lastIssuedNumber: 5 }));
    await failsWith(insert({ nextNumber: 5, lastIssuedNumber: 0 }));
    await failsWith(() =>
      admin()
        .insert(documentSequences)
        .values({ tenantId: tenant.id, docType: 'PR', prefix: 'PR-' }),
    );

    await insert({ prefix: 'GR/2026.A_B-', nextNumber: 500, padding: 10 })();
    await failsWith(insert({}), '23505');
  });

  it('requests: estado, moneda, total, versión y motivo', async () => {
    const insert = (extra: Record<string, unknown>) => () => insertRequest(A, extra);

    await failsWith(insert({ status: 'inventado' }));
    await failsWith(insert({ currency: 'EUR' }));
    await failsWith(insert({ totalAmount: '-0.01' }));
    await failsWith(insert({ version: 0 }));
    await failsWith(insert({ reason: 'x'.repeat(501) }));
    await failsWith(insert({ docType: 'PR' }));
    await insert({ reason: 'x'.repeat(500) })();
  });

  it('requests: el número y el envío van juntos y un borrador no tiene número', async () => {
    const at = new Date('2026-11-25T15:00:00.000Z');
    const insert = (extra: Record<string, unknown>) => () => insertRequest(A, extra);

    await failsWith(insert({ status: 'draft', number: 'SOF-9001', submittedAt: at }));
    await failsWith(insert({ status: 'in_approval' }));
    await failsWith(insert({ status: 'in_approval', number: 'SOF-9002' }));
    await failsWith(insert({ status: 'in_approval', submittedAt: at }));
    await failsWith(insert({ status: 'approved', number: null, submittedAt: null }));
    // Un borrador anulado nunca tuvo número; uno enviado y anulado lo conserva.
    await insert({ status: 'cancelled' })();
    await insert({ status: 'cancelled', number: 'SOF-9003', submittedAt: at })();
    await insert({ status: 'in_approval', number: 'SOF-9004', submittedAt: at })();
  });

  it('requests: el número es único por tenant y tipo; otro tenant puede repetirlo', async () => {
    const at = new Date('2026-11-25T15:00:00.000Z');
    const values = { status: 'in_approval', number: 'SOF-7777', submittedAt: at };

    await insertRequest(A, values);
    await failsWith(() => insertRequest(A, values), '23505');
    await insertRequest(B, values);
    // Los borradores sin número no chocan entre sí (índice parcial).
    await insertRequest(A);
    await insertRequest(A);
  });

  it('request_lines: cantidad, precio, subtotal, estado, revisión, snapshots y notas', async () => {
    const requestId = await insertRequest(A);
    const insert = (extra: Record<string, unknown>) => () => insertLine(A, requestId, extra);

    await failsWith(insert({ lineNo: 10, quantity: '0' }));
    await failsWith(insert({ lineNo: 10, quantity: '-1' }));
    await failsWith(insert({ lineNo: 10, unitPrice: '-0.0001' }));
    await failsWith(insert({ lineNo: 10, subtotal: '-1' }));
    await failsWith(insert({ lineNo: 10, status: 'inventado' }));
    await failsWith(insert({ lineNo: 10, revision: 0 }));
    await failsWith(insert({ lineNo: 0 }));
    await failsWith(insert({ lineNo: 10, productCodeSnapshot: ' ' }));
    await failsWith(insert({ lineNo: 10, descriptionSnapshot: '' }));
    await failsWith(insert({ lineNo: 10, unitSnapshot: '  ' }));
    await failsWith(insert({ lineNo: 10, notes: 'x'.repeat(501) }));
    await insert({ lineNo: 10, unitPrice: '0', notes: 'x'.repeat(500) })();
    await failsWith(insert({ lineNo: 10 }), '23505');
  });

  it('request_line_revisions: motivo no vacío y una revisión por línea', async () => {
    const requestId = await insertRequest(A);
    const line = await insertLine(A, requestId);
    const insert = (extra: Record<string, unknown>) => () =>
      admin()
        .insert(requestLineRevisions)
        .values({
          tenantId: A.tenantId,
          requestId,
          requestLineId: line,
          revision: 1,
          snapshot: {},
          changedBy: A.userId,
          reason: 'motivo',
          ...extra,
        } as typeof requestLineRevisions.$inferInsert);

    await failsWith(insert({ reason: '   ' }));
    await failsWith(insert({ revision: 0 }));
    await insert({})();
    await failsWith(insert({}), '23505');
  });
});

describe('índices', () => {
  it('existen los índices del plan en requests y el único parcial del número', async () => {
    const rows = await admin().execute<{ indexname: string; indexdef: string }>(
      sql`select indexname, indexdef from pg_indexes where tablename = 'requests'`,
    );
    const names = rows.map((r) => r.indexname);

    expect(names).toEqual(
      expect.arrayContaining([
        'requests_tenant_doc_number_key',
        'requests_tenant_status_updated_idx',
        'requests_tenant_requester_updated_idx',
        'requests_tenant_updated_idx',
      ]),
    );
    const partial = rows.find((r) => r.indexname === 'requests_tenant_doc_number_key');
    expect(partial?.indexdef).toContain('UNIQUE');
    expect(partial?.indexdef.toLowerCase()).toContain('where');
  });
});
