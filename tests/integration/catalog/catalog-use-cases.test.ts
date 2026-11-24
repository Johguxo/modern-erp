// E2-H1 · Casos de uso del catálogo con la base real: unicidad por tenant (code_taken), la
// transacción sigue usable tras el conflicto, auditoría, listados, búsqueda y aislamiento A/B.
import { makeCtx } from '@tests/support/ctx';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { closeDatabases, getDbAdmin } from '@/db/admin';
import { auditEvents, costCenters, equipment, products } from '@/db/schema';
import { withTenant } from '@/db/with-tenant';
import {
  createCatalogDeps,
  listCostCenters,
  listEquipment,
  listProducts,
  searchProducts,
  setProductActive,
  upsertCostCenter,
  upsertEquipment,
  upsertProduct,
  type CatalogDeps,
} from '@/modules/catalog';
import { upsertProductContract } from '@/modules/catalog/contracts';
import { ConflictError, ForbiddenError, NotFoundError } from '@/shared/errors';
import { UNKNOWN_CLIENT } from '@/shared/ports/client-info';

import { createIdentityFixtures } from '../helpers/identity-fixtures';

const fx = createIdentityFixtures();
let A: string;
let B: string;
let U: string;

const manager = (tenantId: string) =>
  makeCtx({
    tenantId,
    userId: U,
    roles: ['admin'],
    permissions: ['catalog.manage', 'requests.create'],
  });
const requester = (tenantId: string) =>
  makeCtx({ tenantId, userId: U, permissions: ['requests.create'] });

/** Una transacción de withTenant por llamada, como hace la entrega. */
function run<T>(tenantId: string, fn: (deps: CatalogDeps) => Promise<T>): Promise<T> {
  return withTenant({ tenantId, userId: U }, (tx) =>
    fn(createCatalogDeps(tx, { client: UNKNOWN_CLIENT })),
  );
}

/** Pasa el texto por el contrato (normaliza código y precio) como hace src/app. */
const product = (input: Record<string, unknown>) =>
  upsertProductContract.inputSchema.parse({ unit: 'UND', ...input });
const productContractInput = (code: string, name: string, extra: Record<string, unknown> = {}) =>
  product({ code, name, ...extra });

beforeAll(async () => {
  A = (await fx.tenant()).id;
  B = (await fx.tenant()).id;
  U = (await fx.user()).id;
  await fx.membership(A, U, { roles: ['admin'] });
  await fx.membership(B, U, { roles: ['admin'] });
});

afterAll(async () => {
  await fx.cleanup();
  await closeDatabases();
});

describe('unicidad por tenant', () => {
  it('el mismo código en A y en B es válido', async () => {
    await run(A, (d) => upsertProduct(manager(A), productContractInput('uni-1', 'En A'), d));
    await run(B, (d) => upsertProduct(manager(B), productContractInput('UNI-1', 'En B'), d));

    const rows = await getDbAdmin().select().from(products).where(eq(products.code, 'UNI-1'));
    expect(rows.map((r) => r.tenantId).sort()).toEqual([A, B].sort());
  });

  it('repetido en A (sin importar mayúsculas) → ConflictError code_taken, y la transacción sigue usable', async () => {
    await run(A, (d) => upsertProduct(manager(A), productContractInput('dup-1', 'Primero'), d));

    await run(A, async (d) => {
      const error = await upsertProduct(
        manager(A),
        productContractInput(' Dup-1 ', 'Segundo'),
        d,
      ).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(ConflictError);
      expect(error).toMatchObject({ reason: 'code_taken', params: { code: 'DUP-1' } });

      // Misma transacción: el savepoint dejó la conexión utilizable.
      const ok = await upsertProduct(manager(A), productContractInput('dup-2', 'Tercero'), d);
      expect(ok.created).toBe(true);
    });

    const rows = await getDbAdmin()
      .select()
      .from(products)
      .where(and(eq(products.tenantId, A), eq(products.code, 'DUP-1')));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.name).toBe('Primero');
  });

  it('equipos y centros de costo también devuelven code_taken', async () => {
    await run(A, async (d) => {
      await upsertEquipment(manager(A), { code: 'EQ-1', name: 'Grúa', type: null }, d);
      await upsertCostCenter(manager(A), { code: 'CC-1', name: 'Obra' }, d);
      await expect(
        upsertEquipment(manager(A), { code: 'EQ-1', name: 'Otra', type: null }, d),
      ).rejects.toMatchObject({ reason: 'code_taken' });
      await expect(
        upsertCostCenter(manager(A), { code: 'CC-1', name: 'Otra' }, d),
      ).rejects.toMatchObject({ reason: 'code_taken' });
    });
  });
});

describe('crear, actualizar y desactivar con auditoría', () => {
  it('crea con precio como string, actualiza solo lo cambiado y audita', async () => {
    const created = await run(A, (d) =>
      upsertProduct(
        manager(A),
        productContractInput('aud-1', 'Cable', { referencePrice: '12.5', currency: 'USD' }),
        d,
      ),
    );
    expect(created.item).toMatchObject({
      code: 'AUD-1',
      unit: 'UND',
      referencePrice: '12.5000',
      currency: 'USD',
      active: true,
    });
    expect(typeof created.item.referencePrice).toBe('string');

    const updated = await run(A, (d) =>
      upsertProduct(
        manager(A),
        {
          ...productContractInput('otro-codigo', 'Cable 2x1', {
            referencePrice: '12.5',
            currency: 'USD',
          }),
          id: created.item.id,
        },
        d,
      ),
    );
    expect(updated).toMatchObject({ created: false, changed: true });
    expect(updated.item.code).toBe('AUD-1');

    const unchanged = await run(A, (d) =>
      upsertProduct(
        manager(A),
        {
          ...productContractInput('aud-1', 'Cable 2x1', {
            referencePrice: '12.50',
            currency: 'USD',
          }),
          id: created.item.id,
        },
        d,
      ),
    );
    expect(unchanged.changed).toBe(false);

    await run(A, (d) => setProductActive(manager(A), { id: created.item.id, active: false }, d));
    await run(A, (d) => setProductActive(manager(A), { id: created.item.id, active: false }, d));
    await run(A, (d) => setProductActive(manager(A), { id: created.item.id, active: true }, d));

    const events = await getDbAdmin()
      .select({
        action: auditEvents.action,
        data: auditEvents.data,
        actor: auditEvents.actorUserId,
      })
      .from(auditEvents)
      .where(and(eq(auditEvents.tenantId, A), eq(auditEvents.entityId, created.item.id)))
      .orderBy(auditEvents.createdAt);
    expect(events.map((e) => e.action)).toEqual([
      'product.created',
      'product.updated',
      'product.deactivated',
      'product.reactivated',
    ]);
    expect(events[1]?.data).toMatchObject({
      changes: { name: { from: 'Cable', to: 'Cable 2x1' } },
    });
    expect(events.every((e) => e.actor === U)).toBe(true);
  });

  it('un id de B no se puede tocar desde A (NotFoundError)', async () => {
    const [inB] = await getDbAdmin()
      .select({ id: products.id })
      .from(products)
      .where(and(eq(products.tenantId, B), eq(products.code, 'UNI-1')));

    await expect(
      run(A, (d) =>
        upsertProduct(manager(A), { ...productContractInput('uni-1', 'Robado'), id: inB?.id }, d),
      ),
    ).rejects.toThrow(NotFoundError);
    await expect(
      run(A, (d) => setProductActive(manager(A), { id: inB?.id ?? '', active: false }, d)),
    ).rejects.toThrow(NotFoundError);

    const [row] = await getDbAdmin()
      .select()
      .from(products)
      .where(eq(products.id, inB?.id ?? ''));
    expect(row).toMatchObject({ name: 'En B', active: true });
  });

  it('quien solo crea SOF no puede escribir', async () => {
    await expect(
      run(A, (d) => upsertProduct(requester(A), productContractInput('nope-1', 'x'), d)),
    ).rejects.toThrow(ForbiddenError);
    await expect(
      run(A, (d) => upsertEquipment(requester(A), { code: 'NOPE', name: 'x', type: null }, d)),
    ).rejects.toThrow(ForbiddenError);
  });
});

describe('listados', () => {
  it('filtra por texto y estado, pagina y no mezcla tenants', async () => {
    await run(A, async (d) => {
      for (const n of [1, 2, 3]) {
        await upsertEquipment(
          manager(A),
          { code: `LST-${n}`, name: `Equipo lista ${n}`, type: 'Pesado' },
          d,
        );
      }
      const eq2 = await listEquipment(
        manager(A),
        { q: 'lst-2', status: 'all', page: 1, pageSize: 25 },
        d,
      );
      await setEquipmentInactive(d, eq2.items[0]?.id ?? '');
    });
    await run(B, (d) =>
      upsertEquipment(manager(B), { code: 'LST-9', name: 'Equipo lista de B', type: null }, d),
    );

    const page1 = await run(A, (d) =>
      listEquipment(manager(A), { q: 'lista', status: 'all', page: 1, pageSize: 2 }, d),
    );
    expect(page1).toMatchObject({ total: 3, page: 1, pageSize: 2 });
    expect(page1.items.map((i) => i.code)).toEqual(['LST-1', 'LST-2']);

    const inactive = await run(A, (d) =>
      listEquipment(manager(A), { q: 'lista', status: 'inactive', page: 1, pageSize: 25 }, d),
    );
    expect(inactive.items.map((i) => i.code)).toEqual(['LST-2']);

    // Solo crea SOF: ve únicamente activos aunque pida inactivos.
    const asRequester = await run(A, (d) =>
      listEquipment(requester(A), { q: 'lista', status: 'inactive', page: 1, pageSize: 25 }, d),
    );
    expect(asRequester.items.map((i) => i.code)).toEqual(['LST-1', 'LST-3']);
  });

  it('centros de costo y productos se listan por tenant', async () => {
    const costCentersA = await run(A, (d) =>
      listCostCenters(manager(A), { q: null, status: 'all', page: 1, pageSize: 25 }, d),
    );
    expect(costCentersA.items.map((i) => i.code)).toEqual(['CC-1']);
    const productsB = await run(B, (d) =>
      listProducts(manager(B), { q: null, status: 'all', page: 1, pageSize: 25 }, d),
    );
    expect(productsB.items.every((i) => i.name === 'En B')).toBe(true);
  });
});

async function setEquipmentInactive(d: CatalogDeps, id: string) {
  await d.equipment.setActive(A, id, false);
}

describe('searchProducts', () => {
  beforeAll(async () => {
    const seed = [
      ['TOR-100', 'Tornillo hexagonal'],
      ['TOR', 'Tor genérico'],
      ['ABR-1', 'Abrazadera tornillo'],
      ['VAL-1', 'Válvula de bola 100%'],
      ['VAL-2', 'Valvula de 100 psi'],
      ['PAD_1', 'Candado_grande'],
      ['PADX1', 'Candado xgrande'],
      ['OLD-1', 'Tornillo inactivo'],
    ] as const;
    await run(A, async (d) => {
      for (const [code, name] of seed) {
        await upsertProduct(manager(A), productContractInput(code, name), d);
      }
      const old = await d.products.list(A, { q: 'OLD-1', status: 'all' }, { page: 1, pageSize: 5 });
      await d.products.setActive(A, old.items[0]?.id ?? '', false);
    });
    await run(B, (d) =>
      upsertProduct(manager(B), productContractInput('TOR-B1', 'Tornillo de B'), d),
    );
  });

  const search = (q: string, limit?: number, tenant = A) =>
    run(tenant, (d) => searchProducts(requester(tenant), { q, limit }, d)).then((r) =>
      r.items.map((i) => i.code),
    );

  it('ordena código exacto, luego los que empiezan con q, luego por nombre', async () => {
    expect(await search('tor')).toEqual(['TOR', 'TOR-100', 'ABR-1']);
  });

  it('cada palabra debe aparecer en el código o el nombre', async () => {
    expect(await search('tornillo hexagonal')).toEqual(['TOR-100']);
    expect(await search('abr tornillo')).toEqual(['ABR-1']);
    expect(await search('tornillo zzz')).toEqual([]);
  });

  it('excluye inactivos y productos de otro tenant', async () => {
    const codes = await search('tornillo');
    expect(codes).not.toContain('OLD-1');
    expect(codes).not.toContain('TOR-B1');
    expect(await search('tornillo', undefined, B)).toEqual(['TOR-B1']);
  });

  it('% y _ se buscan como texto literal', async () => {
    expect(await search('100%')).toEqual(['VAL-1']);
    expect(await search('%')).toEqual(['VAL-1']);
    expect(await search('_')).toEqual(['PAD_1']);
    expect(await search('pad_1')).toEqual(['PAD_1']);
  });

  it('con q vacío devuelve los primeros activos del propio tenant, hasta el límite', async () => {
    const all = await search('', 50);
    expect(all).not.toContain('OLD-1');
    expect(all).not.toContain('TOR-B1');
    expect(all).toEqual(expect.arrayContaining(['TOR-100', 'TOR', 'ABR-1']));
    expect(await search('', 2)).toHaveLength(2);
    const ofB = await search('', 50, B);
    expect(ofB).toContain('TOR-B1');
    expect(ofB).not.toContain('TOR-100');
  });

  it('respeta el límite y devuelve el precio como string', async () => {
    expect(await search('', 3)).toHaveLength(3);
    const withPrice = await run(A, async (d) => {
      await upsertProduct(
        manager(A),
        productContractInput('PRC-1', 'Con precio', { referencePrice: '3', currency: 'PEN' }),
        d,
      );
      return searchProducts(requester(A), { q: 'PRC-1' }, d);
    });
    expect(withPrice.items[0]).toMatchObject({ referencePrice: '3.0000', currency: 'PEN' });
  });

  it('exige catalog.manage o requests.create', async () => {
    await expect(
      run(A, (d) => searchProducts(makeCtx({ tenantId: A, permissions: [] }), { q: 'a' }, d)),
    ).rejects.toThrow(ForbiddenError);
  });
});

describe('no quedan filas fuera del tenant', () => {
  it('lo creado por A no aparece en las tablas de B', async () => {
    const [eqRows, ccRows] = await Promise.all([
      getDbAdmin().select().from(equipment).where(eq(equipment.tenantId, B)),
      getDbAdmin().select().from(costCenters).where(eq(costCenters.tenantId, B)),
    ]);
    expect(eqRows.map((r) => r.code)).toEqual(['LST-9']);
    expect(ccRows).toEqual([]);
  });
});
