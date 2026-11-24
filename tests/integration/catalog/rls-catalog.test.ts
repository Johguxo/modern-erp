// E2-H1 · RLS de las 5 tablas del catálogo con dos tenants (A y B): sin contexto no se ve nada,
// dentro de A solo se ven y tocan filas de A, y no se puede insertar ni mover filas hacia B.
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { closeDatabases, getDbAdmin } from '@/db/admin';
import { getDb } from '@/db/client';
import { costCenters, equipment, importJobs, products, warehouses } from '@/db/schema';
import { withTenant } from '@/db/with-tenant';

import { capturePgError, createIdentityFixtures } from '../helpers/identity-fixtures';

const fx = createIdentityFixtures();
let A: string;
let B: string;
let U: string;
const ids = {
  A: {} as Record<string, string>,
  B: {} as Record<string, string>,
};

const scopeA = () => ({ tenantId: A, userId: U });

const TABLES = [
  { name: 'warehouses', table: warehouses, tenant: warehouses.tenantId, id: warehouses.id },
  { name: 'products', table: products, tenant: products.tenantId, id: products.id },
  { name: 'equipment', table: equipment, tenant: equipment.tenantId, id: equipment.id },
  { name: 'cost_centers', table: costCenters, tenant: costCenters.tenantId, id: costCenters.id },
  { name: 'import_jobs', table: importJobs, tenant: importJobs.tenantId, id: importJobs.id },
] as const;

beforeAll(async () => {
  A = (await fx.tenant()).id;
  B = (await fx.tenant()).id;
  U = (await fx.user()).id;
  await fx.membership(A, U, { roles: ['admin'] });
  const admin = getDbAdmin();
  for (const [key, tenantId] of [
    ['A', A],
    ['B', B],
  ] as const) {
    const [w] = await admin
      .insert(warehouses)
      .values({ tenantId, code: 'PRINCIPAL', name: 'Almacén principal', isDefault: true })
      .returning({ id: warehouses.id });
    const [p] = await admin
      .insert(products)
      .values({ tenantId, code: 'PR-001', name: `Producto ${key}`, unit: 'UND' })
      .returning({ id: products.id });
    const [e] = await admin
      .insert(equipment)
      .values({ tenantId, code: 'EQ-001', name: `Equipo ${key}` })
      .returning({ id: equipment.id });
    const [c] = await admin
      .insert(costCenters)
      .values({ tenantId, code: 'CC-001', name: `Centro ${key}` })
      .returning({ id: costCenters.id });
    const [j] = await admin
      .insert(importJobs)
      .values({ tenantId, kind: 'products' })
      .returning({ id: importJobs.id });
    ids[key] = {
      warehouses: w?.id ?? '',
      products: p?.id ?? '',
      equipment: e?.id ?? '',
      cost_centers: c?.id ?? '',
      import_jobs: j?.id ?? '',
    };
  }
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
    expect(rows.every((r) => r.tenantId === A)).toBe(true);
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
  it.each([
    ['products', async () => insertProduct(B)],
    ['equipment', async () => insertEquipment(B)],
    ['cost_centers', async () => insertCostCenter(B)],
    ['import_jobs', async () => insertJob(B)],
  ])('%s: insertar con tenant_id de B desde A lo niega RLS', async (_name, run) => {
    const error = await capturePgError(run);

    expect(error.code).toBe('42501');
    expect(error.message).toContain('row-level security');
  });

  it.each(['products', 'equipment', 'cost_centers'] as const)(
    '%s: actualizar la fila de B desde A no cambia nada',
    async (name) => {
      const table = sql.identifier(name);
      const idB = ids.B[name] ?? '';
      const updated = await withTenant(scopeA(), (tx) =>
        tx.execute(sql`update ${table} set name = 'hackeado' where id = ${idB} returning id`),
      );

      expect(updated).toHaveLength(0);
      const rows = await getDbAdmin().execute<{ name: string }>(
        sql`select name from ${table} where id = ${idB}`,
      );
      expect(rows[0]?.name).not.toBe('hackeado');
    },
  );

  it('products: no se puede mover una fila propia al tenant B', async () => {
    const error = await capturePgError(() =>
      withTenant(scopeA(), (tx) =>
        tx
          .update(products)
          .set({ tenantId: B })
          .where(eq(products.id, ids.A.products ?? '')),
      ),
    );

    expect(error.code).toBe('42501');
  });
});

function insertProduct(tenantId: string) {
  return withTenant(scopeA(), (tx) =>
    tx.insert(products).values({ tenantId, code: 'X-1', name: 'x', unit: 'UND' }),
  );
}
function insertEquipment(tenantId: string) {
  return withTenant(scopeA(), (tx) =>
    tx.insert(equipment).values({ tenantId, code: 'X-1', name: 'x' }),
  );
}
function insertCostCenter(tenantId: string) {
  return withTenant(scopeA(), (tx) =>
    tx.insert(costCenters).values({ tenantId, code: 'X-1', name: 'x' }),
  );
}
function insertJob(tenantId: string) {
  return withTenant(scopeA(), (tx) => tx.insert(importJobs).values({ tenantId, kind: 'products' }));
}
