// E2-H3 · Importación del catálogo con la base real, sin Storage ni pg-boss: el trabajo se crea con
// el caso de uso (lector real sobre un CSV) y el consumidor se llama directo. Cubre upsert por
// código, inactivos, errores, idempotencia, permisos, solo lectura, aislamiento entre tenants y
// el rendimiento de 2,000 filas en un .xlsx (todo el camino).
import { makeCtx } from '@tests/support/ctx';
import { CapturingLogger } from '@tests/support/fakes/capturing-logger';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { closeDatabases, getDbAdmin } from '@/db/admin';
import { auditEvents, importJobs, memberships, products } from '@/db/schema';
import { withTenant } from '@/db/with-tenant';
import {
  createImportCreateDeps,
  createImportJob,
  createImportJobHandler,
  createImportQueryDeps,
  getImportJob,
  readImportRows,
  type ImportKind,
} from '@/modules/catalog';
import { NotFoundError } from '@/shared/errors';
import { createSpreadsheetReader } from '@/shared/adapters/spreadsheet-reader';
import { createSpreadsheetWriter } from '@/shared/adapters/spreadsheet-writer';
import { systemClock } from '@/shared/adapters/system-clock';
import { UNKNOWN_CLIENT } from '@/shared/ports/client-info';
import type { JobPayload } from '@/shared/ports/job-queue';

import { createIdentityFixtures } from '../helpers/identity-fixtures';

const fx = createIdentityFixtures();
const reader = createSpreadsheetReader();
const logger = new CapturingLogger();
const handler = createImportJobHandler({ logger });

let A: string;
let B: string;
let READONLY: string;
let ADMIN_A: string;
let ADMIN_B: string;
let ADMIN_RO: string;

const manager = (tenantId: string, userId: string) =>
  makeCtx({ tenantId, userId, roles: ['admin'], permissions: ['catalog.manage'] });

const csv = (...lines: string[]) => new TextEncoder().encode(lines.join('\n') + '\n');
const PRODUCT_HEADER = 'codigo,nombre,unidad,categoria,precio,moneda';

/**
 * Crea el trabajo como la acción de confirmar: lee el archivo fuera de la transacción y luego el
 * caso de uso corre en una (withTenant). Devuelve el id.
 */
async function createJob(
  tenantId: string,
  userId: string,
  bytes: Uint8Array,
  kind: ImportKind = 'products',
  name = 'datos.csv',
): Promise<string> {
  const queued: JobPayload[] = [];
  const ctx = manager(tenantId, userId);
  const rows = await readImportRows(ctx, { kind, name, bytes }, { reader });
  const result = await withTenant({ tenantId, userId }, (tx) =>
    createImportJob(
      ctx,
      { kind, rows },
      createImportCreateDeps(tx, {
        client: UNKNOWN_CLIENT,
        queue: {
          enqueue: (_name, payload) => {
            queued.push(payload);
            return Promise.resolve('queue-1');
          },
        },
        afterCommit: () => undefined,
      }),
    ),
  );
  return result.jobId;
}

/** Lo que el worker recibe de la cola. */
const queueJob = (tenantId: string, userId: string, jobId: string) => ({
  id: `queue-${jobId}`,
  payload: { tenantId, userId, jobId, requestId: 'req-test' } satisfies JobPayload,
});

const runJob = (tenantId: string, userId: string, jobId: string) =>
  handler(queueJob(tenantId, userId, jobId));

async function jobRow(jobId: string) {
  const [row] = await getDbAdmin().select().from(importJobs).where(eq(importJobs.id, jobId));
  return row;
}

async function productRows(tenantId: string) {
  return getDbAdmin().select().from(products).where(eq(products.tenantId, tenantId));
}

async function completedAudits(tenantId: string, jobId: string) {
  return getDbAdmin()
    .select()
    .from(auditEvents)
    .where(
      and(
        eq(auditEvents.tenantId, tenantId),
        eq(auditEvents.action, 'import_job.completed'),
        eq(auditEvents.entityId, jobId),
      ),
    );
}

beforeAll(async () => {
  A = (await fx.tenant()).id;
  B = (await fx.tenant()).id;
  READONLY = (await fx.tenant()).id;
  await fx.settings(A);
  await fx.settings(B);
  await fx.settings(READONLY);
  await fx.subscription(A, 'starter');
  await fx.subscription(B, 'starter');
  await fx.subscription(READONLY, 'starter', { status: 'suspended' });
  ADMIN_A = (await fx.user()).id;
  ADMIN_B = (await fx.user()).id;
  ADMIN_RO = (await fx.user()).id;
  await fx.membership(A, ADMIN_A, { roles: ['admin'] });
  await fx.membership(B, ADMIN_B, { roles: ['admin'] });
  await fx.membership(READONLY, ADMIN_RO, { roles: ['admin'] });
});

afterAll(async () => {
  await fx.cleanup();
  await closeDatabases();
});

describe('importación de productos', () => {
  it('crea, actualiza, cuenta los sin cambios, no reactiva inactivos, resume errores y audita una vez', async () => {
    const admin = getDbAdmin();
    await admin.insert(products).values([
      {
        tenantId: A,
        code: 'IMP-SAME',
        name: 'Igual',
        unit: 'UND',
        category: 'C',
        referencePrice: '5.0000',
        currency: 'PEN',
      },
      { tenantId: A, code: 'IMP-UPD', name: 'Viejo', unit: 'UND' },
      { tenantId: A, code: 'IMP-OLD', name: 'Inactivo', unit: 'UND', active: false },
    ]);
    const [before] = await admin
      .select({ updatedAt: products.updatedAt })
      .from(products)
      .where(and(eq(products.tenantId, A), eq(products.code, 'IMP-SAME')));

    const jobId = await createJob(
      A,
      ADMIN_A,
      csv(
        PRODUCT_HEADER,
        'imp-new,Nuevo,und,,12.5,usd',
        'IMP-UPD,Actualizado,KG,,,',
        'IMP-SAME,Igual,UND,C,5,PEN',
        'IMP-OLD,Reciclado,UND,,,',
        'IMP-BAD,,UND,,,',
        'IMP-PRICE,Mal precio,UND,,"1,5",',
        'imp-upd,Repetido,UND,,,',
      ),
    );
    expect((await jobRow(jobId))?.status).toBe('pending');
    expect((await jobRow(jobId))?.payload).not.toBeNull();

    await runJob(A, ADMIN_A, jobId);

    const job = await jobRow(jobId);
    expect(job).toMatchObject({
      status: 'completed',
      payload: null,
      summary: { total: 7, created: 1, updated: 2, unchanged: 1, failed: 3 },
    });
    expect(job?.finishedAt).not.toBeNull();
    expect(job?.errors).toEqual([
      { row: 6, code: 'IMP-BAD', field: 'name', reason: 'required', params: {} },
      { row: 7, code: 'IMP-PRICE', field: 'price', reason: 'invalid_price', params: {} },
      {
        row: 8,
        code: 'IMP-UPD',
        field: 'code',
        reason: 'duplicate_in_file',
        params: { firstRow: 3 },
      },
    ]);

    const rows = new Map((await productRows(A)).map((r) => [r.code, r]));
    expect(rows.get('IMP-NEW')).toMatchObject({
      name: 'Nuevo',
      unit: 'UND',
      referencePrice: '12.5000',
      currency: 'USD',
      active: true,
    });
    expect(rows.get('IMP-UPD')).toMatchObject({ name: 'Actualizado', unit: 'KG', active: true });
    // El inactivo se actualiza y SIGUE inactivo.
    expect(rows.get('IMP-OLD')).toMatchObject({ name: 'Reciclado', active: false });
    // El igual no se tocó (ni updated_at).
    expect(rows.get('IMP-SAME')?.updatedAt).toEqual(before?.updatedAt);
    expect(rows.has('IMP-BAD')).toBe(false);
    expect(rows.has('IMP-PRICE')).toBe(false);

    const audits = await completedAudits(A, jobId);
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      actorUserId: ADMIN_A,
      entityType: 'import_job',
      data: {
        kind: 'products',
        summary: { total: 7, created: 1, updated: 2, unchanged: 1, failed: 3 },
      },
    });
  });

  it('es idempotente: la misma importación otra vez no cambia nada, y re-entregar el mismo job se omite', async () => {
    const file = csv(PRODUCT_HEADER, 'IDEM-1,Uno,UND,,1.5,PEN', 'IDEM-2,Dos,UND,,,');
    const first = await createJob(A, ADMIN_A, file);
    await runJob(A, ADMIN_A, first);
    const snapshot = (await productRows(A)).filter((r) => r.code.startsWith('IDEM-'));

    const second = await createJob(A, ADMIN_A, file);
    await runJob(A, ADMIN_A, second);

    expect((await jobRow(second))?.summary).toEqual({
      total: 2,
      created: 0,
      updated: 0,
      unchanged: 2,
      failed: 0,
    });
    expect((await productRows(A)).filter((r) => r.code.startsWith('IDEM-'))).toEqual(snapshot);

    // Una segunda entrega del mismo mensaje (ya completed) no hace nada ni audita otra vez.
    await runJob(A, ADMIN_A, second);
    expect(await completedAudits(A, second)).toHaveLength(1);
    expect((await jobRow(second))?.status).toBe('completed');
  });

  it('un usuario sin permiso de catálogo al momento de procesar → failed/not_allowed y no toca el catálogo', async () => {
    const user = (await fx.user()).id;
    const membership = await fx.membership(A, user, { roles: ['admin'] });
    const jobId = await createJob(A, user, csv(PRODUCT_HEADER, 'NOPE-1,No debe existir,UND,,,'));
    await getDbAdmin()
      .update(memberships)
      .set({ roles: ['requester'] })
      .where(eq(memberships.id, membership.id));

    await runJob(A, user, jobId);

    expect(await jobRow(jobId)).toMatchObject({
      status: 'failed',
      payload: null,
      summary: { failureReason: 'not_allowed' },
    });
    expect((await productRows(A)).some((r) => r.code === 'NOPE-1')).toBe(false);
    expect(await completedAudits(A, jobId)).toHaveLength(0);
  });

  it('un usuario desactivado → failed/not_allowed', async () => {
    const user = (await fx.user()).id;
    const membership = await fx.membership(A, user, { roles: ['admin'] });
    const jobId = await createJob(A, user, csv(PRODUCT_HEADER, 'GONE-1,Fuera,UND,,,'));
    await getDbAdmin()
      .update(memberships)
      .set({ status: 'disabled' })
      .where(eq(memberships.id, membership.id));

    await runJob(A, user, jobId);

    expect((await jobRow(jobId))?.summary).toEqual({ failureReason: 'not_allowed' });
    expect((await productRows(A)).some((r) => r.code === 'GONE-1')).toBe(false);
  });

  it('un tenant en solo lectura al momento de procesar → failed/tenant_read_only', async () => {
    const jobId = await createJob(READONLY, ADMIN_RO, csv(PRODUCT_HEADER, 'RO-1,Bloqueado,UND,,,'));

    await runJob(READONLY, ADMIN_RO, jobId);

    expect(await jobRow(jobId)).toMatchObject({
      status: 'failed',
      summary: { failureReason: 'tenant_read_only' },
    });
    expect(await productRows(READONLY)).toEqual([]);
  });

  it('un payload dañado → failed/invalid_payload (no relanza)', async () => {
    const [job] = await getDbAdmin()
      .insert(importJobs)
      .values({ tenantId: A, kind: 'products', createdBy: ADMIN_A, payload: { rows: 'mal' } })
      .returning({ id: importJobs.id });

    await runJob(A, ADMIN_A, job?.id ?? '');

    expect((await jobRow(job?.id ?? ''))?.summary).toEqual({ failureReason: 'invalid_payload' });
  });

  it('la moneda de los precios sin moneda es la de la empresa', async () => {
    await getDbAdmin().execute(
      sql`update tenant_settings set currency = 'USD' where tenant_id = ${B}`,
    );
    const jobId = await createJob(B, ADMIN_B, csv(PRODUCT_HEADER, 'CUR-1,Con precio,UND,,10,'));

    await runJob(B, ADMIN_B, jobId);

    const row = (await productRows(B)).find((r) => r.code === 'CUR-1');
    expect(row).toMatchObject({ referencePrice: '10.0000', currency: 'USD' });
  });
});

describe('importación de equipos', () => {
  it('crea y actualiza equipos por código', async () => {
    const first = await createJob(
      A,
      ADMIN_A,
      csv('codigo,nombre,tipo', 'EQ-1,Grúa,Pesado', 'EQ-2,Camión,'),
      'equipment',
    );
    await runJob(A, ADMIN_A, first);
    expect((await jobRow(first))?.summary).toMatchObject({ created: 2, updated: 0, unchanged: 0 });

    const second = await createJob(
      A,
      ADMIN_A,
      csv('codigo,nombre,tipo', 'EQ-1,Grúa torre,Pesado', 'EQ-2,Camión,'),
      'equipment',
    );
    await runJob(A, ADMIN_A, second);
    expect((await jobRow(second))?.summary).toMatchObject({ created: 0, updated: 1, unchanged: 1 });
  });
});

describe('aislamiento entre tenants', () => {
  it('importar en A no toca los mismos códigos de B, y el trabajo de A no se ve desde B', async () => {
    await getDbAdmin()
      .insert(products)
      .values({ tenantId: B, code: 'ISO-1', name: 'De B', unit: 'UND' });
    const jobId = await createJob(A, ADMIN_A, csv(PRODUCT_HEADER, 'ISO-1,De A,UND,,,'));

    await runJob(A, ADMIN_A, jobId);

    const inA = (await productRows(A)).find((r) => r.code === 'ISO-1');
    const inB = (await productRows(B)).find((r) => r.code === 'ISO-1');
    expect(inA?.name).toBe('De A');
    expect(inB?.name).toBe('De B');

    // B no ve ni lee el trabajo de A (RLS + filtro por tenant).
    await expect(
      withTenant({ tenantId: B, userId: ADMIN_B }, (tx) =>
        getImportJob(
          manager(B, ADMIN_B),
          { id: jobId },
          createImportQueryDeps(tx, { clock: systemClock }),
        ),
      ),
    ).rejects.toThrow(NotFoundError);
    const visibleFromB = await withTenant({ tenantId: B, userId: ADMIN_B }, (tx) =>
      tx
        .select({ id: importJobs.id })
        .from(importJobs)
        .where(inArray(importJobs.id, [jobId])),
    );
    expect(visibleFromB).toEqual([]);

    // Y A sí lo lee, con su resultado.
    const view = await withTenant({ tenantId: A, userId: ADMIN_A }, (tx) =>
      getImportJob(
        manager(A, ADMIN_A),
        { id: jobId },
        createImportQueryDeps(tx, { clock: systemClock }),
      ),
    );
    expect(view).toMatchObject({ status: 'completed', summary: { created: 1, updated: 0 } });
  });

  it('un trabajo de A procesado con el tenant de B no hace nada (el job no existe en B)', async () => {
    const jobId = await createJob(A, ADMIN_A, csv(PRODUCT_HEADER, 'CROSS-1,No cruza,UND,,,'));

    await runJob(B, ADMIN_B, jobId);

    expect((await jobRow(jobId))?.status).toBe('pending');
    expect((await productRows(B)).some((r) => r.code === 'CROSS-1')).toBe(false);
  });
});

describe('rendimiento', () => {
  it('2,000 filas en un .xlsx: leer + crear el trabajo + procesarlo en menos de 30 segundos', async () => {
    const rows = Array.from({ length: 2000 }, (_, i) => [
      `PERF-${String(i).padStart(4, '0')}`,
      `Producto ${i}`,
      'UND',
      `Categoría ${i % 20}`,
      `${(i % 500) + 0.25}`,
      'PEN',
    ]);
    const xlsx = await createSpreadsheetWriter().writeWorkbook([
      {
        name: 'Productos',
        rows: [
          ['Código', 'Nombre', 'Unidad', 'Categoría', 'Precio referencial', 'Moneda'],
          ...rows,
        ],
        textColumns: [0, 1, 2, 3, 5],
      },
    ]);

    // Todo el camino: lectura del .xlsx + validación + creación del job + worker.
    const run = async () => {
      const started = performance.now();
      const jobId = await createJob(A, ADMIN_A, xlsx, 'products', 'productos.xlsx');
      await runJob(A, ADMIN_A, jobId);
      return { jobId, elapsedMs: performance.now() - started };
    };

    const first = await run();
    expect((await jobRow(first.jobId))?.summary).toEqual({
      total: 2000,
      created: 2000,
      updated: 0,
      unchanged: 0,
      failed: 0,
    });
    expect(first.elapsedMs).toBeLessThan(30_000);

    // Reimportar el mismo archivo (todo sin cambios) tampoco debe tardar.
    const again = await run();
    expect(again.elapsedMs).toBeLessThan(30_000);
    expect((await jobRow(again.jobId))?.summary).toMatchObject({ unchanged: 2000, created: 0 });
  }, 120_000);
});
