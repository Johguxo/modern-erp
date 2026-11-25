// E3-H1 · RLS de las 4 tablas de requests con dos tenants (A y B): sin contexto no se ve nada, dentro
// de A solo se ven y tocan filas de A, y no se puede insertar ni mover filas hacia B.
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { closeDatabases, getDbAdmin } from '@/db/admin';
import { getDb } from '@/db/client';
import { documentSequences, requestLineRevisions, requestLines, requests } from '@/db/schema';
import { withTenant } from '@/db/with-tenant';

import { capturePgError, createIdentityFixtures } from '../helpers/identity-fixtures';
import { seedRequestsWorld, type RequestsWorld } from '../helpers/requests-fixtures';

const fx = createIdentityFixtures();
let A: RequestsWorld;
let B: RequestsWorld;
const ids = {
  A: {} as Record<string, string>,
  B: {} as Record<string, string>,
};

const scopeA = () => ({ tenantId: A.tenantId, userId: A.userId });

const TABLES = [
  {
    name: 'document_sequences',
    table: documentSequences,
    tenant: documentSequences.tenantId,
    id: documentSequences.tenantId,
  },
  { name: 'requests', table: requests, tenant: requests.tenantId, id: requests.id },
  {
    name: 'request_lines',
    table: requestLines,
    tenant: requestLines.tenantId,
    id: requestLines.id,
  },
  {
    name: 'request_line_revisions',
    table: requestLineRevisions,
    tenant: requestLineRevisions.tenantId,
    id: requestLineRevisions.id,
  },
] as const;

async function seedDocuments(world: RequestsWorld): Promise<Record<string, string>> {
  const admin = getDbAdmin();
  const [request] = await admin
    .insert(requests)
    .values({
      tenantId: world.tenantId,
      requesterId: world.userId,
      warehouseId: world.warehouseId,
      currency: 'PEN',
    })
    .returning({ id: requests.id });
  if (!request) throw new Error('request no creada');
  const [line] = await admin
    .insert(requestLines)
    .values({
      tenantId: world.tenantId,
      requestId: request.id,
      lineNo: 1,
      productId: world.productIds.filter,
      productCodeSnapshot: 'FIL-1',
      descriptionSnapshot: 'Filtro',
      unitSnapshot: 'UND',
      quantity: '1.000',
      unitPrice: '12.5000',
      subtotal: '12.50',
    })
    .returning({ id: requestLines.id });
  if (!line) throw new Error('línea no creada');
  const [revision] = await admin
    .insert(requestLineRevisions)
    .values({
      tenantId: world.tenantId,
      requestId: request.id,
      requestLineId: line.id,
      revision: 1,
      snapshot: { quantity: '1.000' },
      changedBy: world.userId,
      reason: 'prueba',
    })
    .returning({ id: requestLineRevisions.id });
  if (!revision) throw new Error('revisión no creada');
  return {
    document_sequences: world.tenantId,
    requests: request.id,
    request_lines: line.id,
    request_line_revisions: revision.id,
  };
}

beforeAll(async () => {
  A = await seedRequestsWorld(fx);
  B = await seedRequestsWorld(fx);
  ids.A = await seedDocuments(A);
  ids.B = await seedDocuments(B);
});

afterAll(async () => {
  await fx.cleanup();
  await closeDatabases();
});

describe.each(TABLES)('$name', ({ name, table, tenant, id }) => {
  it('sin withTenant no se ve ninguna fila', async () => {
    expect(await getDb().select({ id }).from(table)).toHaveLength(0);
  });

  it('dentro de A solo se ven filas de A', async () => {
    const rows = await withTenant(scopeA(), (tx) =>
      tx.select({ id, tenantId: tenant }).from(table),
    );

    expect(rows.map((r) => r.id)).toEqual([ids.A[name]]);
    expect(rows.every((r) => r.tenantId === A.tenantId)).toBe(true);
  });

  it('dentro de A no se encuentra la fila de B por id', async () => {
    const rows = await withTenant(scopeA(), (tx) =>
      tx
        .select({ id })
        .from(table)
        .where(eq(id, ids.B[name] ?? '')),
    );

    expect(rows).toEqual([]);
  });
});

describe('no se escribe en otro tenant', () => {
  it('requests: insertar con tenant_id de B desde A lo niega RLS', async () => {
    const error = await capturePgError(() =>
      withTenant(scopeA(), (tx) =>
        tx.insert(requests).values({
          tenantId: B.tenantId,
          requesterId: A.userId,
          warehouseId: B.warehouseId,
          currency: 'PEN',
        }),
      ),
    );

    expect(error.code).toBe('42501');
    expect(error.message).toContain('row-level security');
  });

  it('request_lines: insertar con tenant_id de B desde A lo niega RLS', async () => {
    const error = await capturePgError(() =>
      withTenant(scopeA(), (tx) =>
        tx.insert(requestLines).values({
          tenantId: B.tenantId,
          requestId: ids.B.requests ?? '',
          lineNo: 2,
          productId: B.productIds.filter,
          productCodeSnapshot: 'X',
          descriptionSnapshot: 'X',
          unitSnapshot: 'UND',
          quantity: '1',
          unitPrice: '1',
          subtotal: '1',
        }),
      ),
    );

    expect(error.code).toBe('42501');
  });

  it('request_line_revisions: insertar con tenant_id de B desde A lo niega RLS', async () => {
    const error = await capturePgError(() =>
      withTenant(scopeA(), (tx) =>
        tx.insert(requestLineRevisions).values({
          tenantId: B.tenantId,
          requestId: ids.B.requests ?? '',
          requestLineId: ids.B.request_lines ?? '',
          revision: 2,
          snapshot: {},
          changedBy: A.userId,
          reason: 'x',
        }),
      ),
    );

    expect(error.code).toBe('42501');
  });

  it('document_sequences: actualizar la secuencia de B desde A no cambia nada', async () => {
    const updated = await withTenant(scopeA(), (tx) =>
      tx.execute(
        sql`update document_sequences set prefix = 'HACK-' where tenant_id = ${B.tenantId} returning tenant_id`,
      ),
    );

    expect(updated).toHaveLength(0);
    const [row] = await getDbAdmin()
      .select({ prefix: documentSequences.prefix })
      .from(documentSequences)
      .where(eq(documentSequences.tenantId, B.tenantId));
    expect(row?.prefix).toBe('SOF-');
  });

  it('requests: actualizar la solicitud de B desde A no cambia nada', async () => {
    const updated = await withTenant(scopeA(), (tx) =>
      tx.execute(
        sql`update requests set reason = 'hackeado' where id = ${ids.B.requests ?? ''} returning id`,
      ),
    );

    expect(updated).toHaveLength(0);
    const [row] = await getDbAdmin()
      .select({ reason: requests.reason })
      .from(requests)
      .where(eq(requests.id, ids.B.requests ?? ''));
    expect(row?.reason).toBeNull();
  });

  it('request_lines: borrar la línea de B desde A no borra nada', async () => {
    const deleted = await withTenant(scopeA(), (tx) =>
      tx.execute(
        sql`delete from request_lines where id = ${ids.B.request_lines ?? ''} returning id`,
      ),
    );

    expect(deleted).toHaveLength(0);
    const rows = await getDbAdmin()
      .select({ id: requestLines.id })
      .from(requestLines)
      .where(eq(requestLines.id, ids.B.request_lines ?? ''));
    expect(rows).toHaveLength(1);
  });

  it('requests: no se puede mover una fila propia al tenant B', async () => {
    const error = await capturePgError(() =>
      withTenant(scopeA(), (tx) =>
        tx
          .update(requests)
          .set({ tenantId: B.tenantId })
          .where(eq(requests.id, ids.A.requests ?? '')),
      ),
    );

    expect(error.code).toBe('42501');
  });
});
