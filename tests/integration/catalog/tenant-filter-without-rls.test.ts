// E2-H1 · Primera defensa: los repositorios del catálogo filtran por tenantId por sí solos. Se crean
// con getDbAdmin() (rol dueño, sin RLS ni withTenant): si se quita un eq(tenantId) de la consulta,
// estas pruebas fallan porque ya no hay RLS que tape el error.
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { closeDatabases, getDbAdmin } from '@/db/admin';
import { costCenters, equipment, products, warehouses } from '@/db/schema';
import {
  createDrizzleCostCenterRepository,
  createDrizzleEquipmentRepository,
} from '@/modules/catalog/infrastructure/drizzle-simple-repositories';
import { createDrizzleProductRepository } from '@/modules/catalog/infrastructure/drizzle-product-repository';
import { createDrizzleWarehouseRepository } from '@/modules/catalog/infrastructure/drizzle-warehouse-repository';

import { createIdentityFixtures } from '../helpers/identity-fixtures';

const fx = createIdentityFixtures();
const PAGE = { page: 1, pageSize: 50 };
const ALL = { q: null, status: 'all' } as const;

let A: string;
let B: string;
const idsA: Record<'product' | 'equipment' | 'costCenter' | 'warehouse', string> = {
  product: '',
  equipment: '',
  costCenter: '',
  warehouse: '',
};
const idsB: typeof idsA = { ...idsA };

const db = () => getDbAdmin();
const productRepo = () => createDrizzleProductRepository(db());
const equipmentRepo = () => createDrizzleEquipmentRepository(db());
const costCenterRepo = () => createDrizzleCostCenterRepository(db());
const warehouseRepo = () => createDrizzleWarehouseRepository(db());

async function seed(tenantId: string, label: 'A' | 'B'): Promise<typeof idsA> {
  const [p] = await db()
    .insert(products)
    .values({ tenantId, code: 'SAME-1', name: `Tornillo ${label}`, unit: 'UND' })
    .returning({ id: products.id });
  const [e] = await db()
    .insert(equipment)
    .values({ tenantId, code: 'SAME-1', name: `Equipo ${label}` })
    .returning({ id: equipment.id });
  const [c] = await db()
    .insert(costCenters)
    .values({ tenantId, code: 'SAME-1', name: `Centro ${label}` })
    .returning({ id: costCenters.id });
  const [w] = await db()
    .insert(warehouses)
    .values({ tenantId, code: 'PRINCIPAL', name: `Almacén ${label}`, isDefault: true })
    .returning({ id: warehouses.id });
  if (!p || !e || !c || !w) throw new Error('seed incompleto');
  return { product: p.id, equipment: e.id, costCenter: c.id, warehouse: w.id };
}

beforeAll(async () => {
  A = (await fx.tenant()).id;
  B = (await fx.tenant()).id;
  Object.assign(idsA, await seed(A, 'A'));
  Object.assign(idsB, await seed(B, 'B'));
});

afterAll(async () => {
  await fx.cleanup();
  await closeDatabases();
});

describe('los repositorios filtran por tenantId sin RLS', () => {
  it('list solo trae filas del tenant pedido', async () => {
    for (const repo of [productRepo(), equipmentRepo(), costCenterRepo()]) {
      const result = await repo.list(A, ALL, PAGE);
      expect(result.total).toBe(1);
      expect(result.items.map((i) => i.name.endsWith(' A'))).toEqual([true]);
    }
    // También con búsqueda de texto: el OR de code/name no debe filtrar el tenant.
    const found = await productRepo().list(A, { q: 'SAME', status: 'all' }, PAGE);
    expect(found.items.map((i) => i.id)).toEqual([idsA.product]);
  });

  it('lockById no ve filas de otro tenant', async () => {
    expect(await productRepo().lockById(A, idsB.product)).toBeNull();
    expect(await equipmentRepo().lockById(A, idsB.equipment)).toBeNull();
    expect(await costCenterRepo().lockById(A, idsB.costCenter)).toBeNull();
    expect((await productRepo().lockById(A, idsA.product))?.id).toBe(idsA.product);
  });

  it('search solo trae productos del tenant (con texto y con q vacío)', async () => {
    expect((await productRepo().search(A, 'tornillo', 10)).map((i) => i.id)).toEqual([
      idsA.product,
    ]);
    expect((await productRepo().search(A, '', 10)).map((i) => i.id)).toEqual([idsA.product]);
  });

  it('findDefault devuelve el almacén del tenant pedido', async () => {
    expect((await warehouseRepo().findDefault(A))?.id).toBe(idsA.warehouse);
    expect((await warehouseRepo().findDefault(B))?.id).toBe(idsB.warehouse);
  });

  it('update con un id de otro tenant no modifica nada', async () => {
    await expect(
      productRepo().update(A, idsB.product, {
        name: 'Hackeado',
        unit: 'KG',
        category: null,
        referencePrice: null,
        currency: null,
      }),
    ).rejects.toThrow();
    await expect(
      equipmentRepo().update(A, idsB.equipment, { name: 'Hackeado', type: null }),
    ).rejects.toThrow();
    await expect(
      costCenterRepo().update(A, idsB.costCenter, { name: 'Hackeado' }),
    ).rejects.toThrow();

    const [p] = await db().select().from(products).where(eq(products.id, idsB.product));
    const [e] = await db().select().from(equipment).where(eq(equipment.id, idsB.equipment));
    const [c] = await db().select().from(costCenters).where(eq(costCenters.id, idsB.costCenter));
    expect([p?.name, p?.unit]).toEqual(['Tornillo B', 'UND']);
    expect(e?.name).toBe('Equipo B');
    expect(c?.name).toBe('Centro B');
  });

  it('setActive con un id de otro tenant no modifica nada', async () => {
    await productRepo().setActive(A, idsB.product, false);
    await equipmentRepo().setActive(A, idsB.equipment, false);
    await costCenterRepo().setActive(A, idsB.costCenter, false);

    const [p] = await db().select().from(products).where(eq(products.id, idsB.product));
    const [e] = await db().select().from(equipment).where(eq(equipment.id, idsB.equipment));
    const [c] = await db().select().from(costCenters).where(eq(costCenters.id, idsB.costCenter));
    expect([p?.active, e?.active, c?.active]).toEqual([true, true, true]);
  });

  it('crear con el mismo código en otro tenant no choca y queda en el tenant pedido', async () => {
    const created = await productRepo().create(A, {
      code: 'NEW-1',
      name: 'Nuevo',
      unit: 'UND',
      category: null,
      referencePrice: null,
      currency: null,
    });
    const [row] = await db().select().from(products).where(eq(products.id, created.id));
    expect(row?.tenantId).toBe(A);
  });
});
