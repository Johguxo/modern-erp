// E2-H1 · Grants de app_user (migración 0006), checks, unicidad por tenant e índices del catálogo.
// Las operaciones se prueban dentro de withTenant(A) sobre filas de A: si fallan con
// "permission denied" (42501), es el grant el que las niega.
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { closeDatabases, getDbAdmin } from '@/db/admin';
import { costCenters, equipment, importJobs, products, warehouses } from '@/db/schema';
import { withTenant } from '@/db/with-tenant';

import { capturePgError, createIdentityFixtures } from '../helpers/identity-fixtures';

const fx = createIdentityFixtures();
let A: string;
let B: string;
let U: string;
let productId: string;
let equipmentId: string;
let costCenterId: string;
let warehouseId: string;
let jobId: string;

const scope = () => ({ tenantId: A, userId: U });

beforeAll(async () => {
  A = (await fx.tenant()).id;
  B = (await fx.tenant()).id;
  U = (await fx.user()).id;
  await fx.membership(A, U, { roles: ['admin'] });
  const admin = getDbAdmin();
  warehouseId =
    (
      await admin
        .insert(warehouses)
        .values({ tenantId: A, code: 'PRINCIPAL', name: 'Almacén principal', isDefault: true })
        .returning({ id: warehouses.id })
    )[0]?.id ?? '';
  productId =
    (
      await admin
        .insert(products)
        .values({ tenantId: A, code: 'PR-001', name: 'Tornillo', unit: 'UND' })
        .returning({ id: products.id })
    )[0]?.id ?? '';
  equipmentId =
    (
      await admin
        .insert(equipment)
        .values({ tenantId: A, code: 'EQ-001', name: 'Grúa' })
        .returning({ id: equipment.id })
    )[0]?.id ?? '';
  costCenterId =
    (
      await admin
        .insert(costCenters)
        .values({ tenantId: A, code: 'CC-001', name: 'Obra' })
        .returning({ id: costCenters.id })
    )[0]?.id ?? '';
  jobId =
    (
      await admin
        .insert(importJobs)
        .values({ tenantId: A, kind: 'products' })
        .returning({ id: importJobs.id })
    )[0]?.id ?? '';
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
  it.each([
    ['warehouses', () => sql`delete from warehouses where id = ${warehouseId}`],
    ['products', () => sql`delete from products where id = ${productId}`],
    ['equipment', () => sql`delete from equipment where id = ${equipmentId}`],
    ['cost_centers', () => sql`delete from cost_centers where id = ${costCenterId}`],
    ['import_jobs', () => sql`delete from import_jobs where id = ${jobId}`],
  ])('%s: DELETE → 42501', async (_name, statement) => {
    await expectDenied(() => withTenant(scope(), (tx) => tx.execute(statement())));
  });

  it.each([
    ['products', () => sql`update products set code = 'OTRO' where id = ${productId}`],
    ['equipment', () => sql`update equipment set code = 'OTRO' where id = ${equipmentId}`],
    ['cost_centers', () => sql`update cost_centers set code = 'OTRO' where id = ${costCenterId}`],
    [
      'products (tenant_id)',
      () => sql`update products set tenant_id = ${B} where id = ${productId}`,
    ],
    [
      'products (created_at)',
      () => sql`update products set created_at = now() where id = ${productId}`,
    ],
  ])('%s: UPDATE de una columna fija → 42501', async (_name, statement) => {
    await expectDenied(() => withTenant(scope(), (tx) => tx.execute(statement())));
  });

  it('warehouses: solo lectura (INSERT y UPDATE → 42501)', async () => {
    await expectDenied(() =>
      withTenant(scope(), (tx) =>
        tx.insert(warehouses).values({ tenantId: A, code: 'SEGUNDO', name: 'Otro' }),
      ),
    );
    await expectDenied(() =>
      withTenant(scope(), (tx) =>
        tx.update(warehouses).set({ name: 'x' }).where(eq(warehouses.id, warehouseId)),
      ),
    );
    expect(await withTenant(scope(), (tx) => tx.select().from(warehouses))).toHaveLength(1);
  });

  it('import_jobs: se crea y se lee, pero no se actualiza desde la web', async () => {
    await withTenant(scope(), (tx) =>
      tx.insert(importJobs).values({ tenantId: A, kind: 'equipment', createdBy: U }),
    );
    await expectDenied(() =>
      withTenant(scope(), (tx) =>
        tx.update(importJobs).set({ status: 'completed' }).where(eq(importJobs.id, jobId)),
      ),
    );
  });

  it('productos, equipos y centros de costo: INSERT y UPDATE de las columnas editables funcionan', async () => {
    await withTenant(scope(), async (tx) => {
      await tx
        .insert(products)
        .values({ tenantId: A, code: 'PR-002', name: 'Tuerca', unit: 'UND' });
      await tx
        .update(products)
        .set({ name: 'Tornillo M6', unit: 'KG', referencePrice: '1.5000', currency: 'PEN' })
        .where(eq(products.id, productId));
      await tx
        .update(equipment)
        .set({ name: 'Grúa 20t', active: false })
        .where(eq(equipment.id, equipmentId));
      await tx.update(costCenters).set({ active: false }).where(eq(costCenters.id, costCenterId));
    });

    const [row] = await getDbAdmin().select().from(products).where(eq(products.id, productId));
    expect(row).toMatchObject({ name: 'Tornillo M6', referencePrice: '1.5000' });
  });
});

describe('checks y unicidad', () => {
  it('el código se guarda normalizado: minúsculas o espacios → 23514', async () => {
    for (const code of ['pr-9', ' PR-9', 'PR-9 ', '']) {
      const error = await capturePgError(() =>
        getDbAdmin().insert(products).values({ tenantId: A, code, name: 'x', unit: 'UND' }),
      );
      expect(error.code).toBe('23514');
    }
  });

  it('precio y moneda van juntos, y el precio no es negativo', async () => {
    const insert = (values: { referencePrice?: string; currency?: string }) =>
      getDbAdmin()
        .insert(products)
        .values({ tenantId: A, code: 'PR-CHK', name: 'x', unit: 'UND', ...values });

    expect((await capturePgError(() => insert({ referencePrice: '1.0000' }))).code).toBe('23514');
    expect((await capturePgError(() => insert({ currency: 'PEN' }))).code).toBe('23514');
    expect(
      (await capturePgError(() => insert({ referencePrice: '-1.0000', currency: 'PEN' }))).code,
    ).toBe('23514');
    expect(
      (await capturePgError(() => insert({ referencePrice: '1.0000', currency: 'EUR' }))).code,
    ).toBe('23514');
  });

  it('import_jobs: kind y status válidos', async () => {
    const admin = getDbAdmin();
    expect(
      (await capturePgError(() => admin.insert(importJobs).values({ tenantId: A, kind: 'otro' })))
        .code,
    ).toBe('23514');
    expect(
      (
        await capturePgError(() =>
          admin.insert(importJobs).values({ tenantId: A, kind: 'stock', status: 'raro' }),
        )
      ).code,
    ).toBe('23514');
  });

  it('el mismo código vive en dos tenants, pero no dos veces en uno', async () => {
    const admin = getDbAdmin();
    await admin
      .insert(products)
      .values({ tenantId: B, code: 'PR-001', name: 'Tornillo de B', unit: 'UND' });

    const error = await capturePgError(() =>
      admin.insert(products).values({ tenantId: A, code: 'PR-001', name: 'Repetido', unit: 'UND' }),
    );
    expect(error.code).toBe('23505');
    expect(error.message).toContain('products_tenant_code_key');
  });

  it('un solo almacén por defecto por tenant', async () => {
    const error = await capturePgError(() =>
      getDbAdmin()
        .insert(warehouses)
        .values({ tenantId: A, code: 'SEGUNDO', name: 'Otro', isDefault: true }),
    );

    expect(error.code).toBe('23505');
    expect(error.message).toContain('warehouses_one_default_per_tenant');
    // Un almacén no predeterminado sí puede convivir.
    await getDbAdmin()
      .insert(warehouses)
      .values({ tenantId: A, code: 'SEGUNDO', name: 'Otro', isDefault: false });
  });
});

describe('índices', () => {
  it('products tiene índices GIN pg_trgm en code y name', async () => {
    const rows = await getDbAdmin().execute<{ indexname: string; indexdef: string }>(sql`
      select indexname, indexdef from pg_indexes
      where schemaname = 'public' and tablename = 'products'`);

    const gin = rows.filter((r) => r.indexdef.includes('USING gin'));
    expect(gin.map((r) => r.indexname).sort()).toEqual([
      'products_code_trgm_idx',
      'products_name_trgm_idx',
    ]);
    expect(gin.every((r) => r.indexdef.includes('gin_trgm_ops'))).toBe(true);
    expect(rows.map((r) => r.indexname)).toEqual(
      expect.arrayContaining(['products_tenant_code_key', 'products_tenant_name_idx']),
    );
  });
});
