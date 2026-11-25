// E2-H1 · Casos de uso del catálogo con repositorios en memoria (la base se prueba en integración).
import { makeCtx } from '@tests/support/ctx';
import { describe, expect, it } from 'vitest';

import { ConflictError, ForbiddenError, NotFoundError } from '@/shared/errors';
import { UNKNOWN_CLIENT } from '@/shared/ports/client-info';

import { getCatalogRefs } from './get-catalog-refs';
import { getDefaultWarehouse } from './get-default-warehouse';
import { listProducts } from './list-products';
import type {
  CostCenterFields,
  CostCenterView,
  ListFilter,
  MasterRepository,
  MasterView,
  ProductDeps,
  ProductFields,
  ProductRepository,
  ProductView,
} from './ports';
import { searchProducts } from './search-products';
import { setCostCenterActive } from './set-cost-center-active';
import { setProductActive } from './set-product-active';
import { upsertCostCenter } from './upsert-cost-center';
import { upsertProduct } from './upsert-product';

const MANAGER = makeCtx({ roles: ['admin'], permissions: ['catalog.manage', 'requests.create'] });
const REQUESTER = makeCtx({ permissions: ['requests.create'] });
const NOBODY = makeCtx({ permissions: ['approvals.decide'] });

function memoryRepo<V extends MasterView, F extends object>(): MasterRepository<V, F> & {
  rows: V[];
  lastFilter: ListFilter | null;
} {
  let counter = 0;
  const repo = {
    rows: [] as V[],
    lastFilter: null as ListFilter | null,
    list(_tenantId: string, filter: ListFilter) {
      repo.lastFilter = filter;
      const items = repo.rows.filter(
        (r) => filter.status === 'all' || r.active === (filter.status === 'active'),
      );
      return Promise.resolve({ items, total: items.length });
    },
    lockById(_tenantId: string, id: string) {
      return Promise.resolve(repo.rows.find((r) => r.id === id) ?? null);
    },
    create(_tenantId: string, input: F & { readonly code: string }) {
      if (repo.rows.some((r) => r.code === input.code)) {
        return Promise.reject(
          new ConflictError({ reason: 'code_taken', params: { code: input.code } }),
        );
      }
      counter += 1;
      const row = { id: `id-${counter}`, active: true, name: '', ...input } as unknown as V;
      repo.rows.push(row);
      return Promise.resolve(row);
    },
    update(_tenantId: string, id: string, fields: F) {
      const index = repo.rows.findIndex((r) => r.id === id);
      const next = { ...repo.rows[index], ...fields } as unknown as V;
      repo.rows[index] = next;
      return Promise.resolve(next);
    },
    findActiveByIds(_tenantId: string, ids: readonly string[]) {
      return Promise.resolve(repo.rows.filter((r) => r.active && ids.includes(r.id)));
    },
    setActive(_tenantId: string, id: string, active: boolean) {
      const index = repo.rows.findIndex((r) => r.id === id);
      repo.rows[index] = { ...repo.rows[index], active } as unknown as V;
      return Promise.resolve();
    },
  };
  return repo;
}

function setup() {
  const audit: { action: string; entityId: string | null; data: Record<string, unknown> }[] = [];
  const products = Object.assign(memoryRepo<ProductView, ProductFields>(), {
    search: () => Promise.resolve([]),
  }) as ProductRepository & ReturnType<typeof memoryRepo<ProductView, ProductFields>>;
  const costCenters = memoryRepo<CostCenterView, CostCenterFields>();
  const log = {
    record: (entry: { action: string; entityId: string | null; data: Record<string, unknown> }) => {
      audit.push(entry);
      return Promise.resolve();
    },
  };
  const base = { audit: log, client: UNKNOWN_CLIENT };
  const productDeps: ProductDeps = { ...base, products };
  return { audit, products, costCenters, productDeps, costDeps: { ...base, costCenters } };
}

const PRODUCT = {
  code: 'PR-001',
  name: 'Tornillo',
  unit: 'UND',
  category: null,
  referencePrice: '1.5000',
  currency: 'PEN' as const,
};

describe('upsertProduct', () => {
  it('crea y audita product.created', async () => {
    const s = setup();

    const result = await upsertProduct(MANAGER, PRODUCT, s.productDeps);

    expect(result).toMatchObject({ created: true, changed: true });
    expect(s.audit.map((a) => a.action)).toEqual(['product.created']);
  });

  it('exige catalog.manage', async () => {
    const s = setup();

    await expect(upsertProduct(REQUESTER, PRODUCT, s.productDeps)).rejects.toThrow(ForbiddenError);
    expect(s.products.rows).toHaveLength(0);
  });

  it('código repetido: ConflictError code_taken y no audita', async () => {
    const s = setup();
    await upsertProduct(MANAGER, PRODUCT, s.productDeps);

    const error = await upsertProduct(MANAGER, PRODUCT, s.productDeps).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ConflictError);
    expect((error as ConflictError).reason).toBe('code_taken');
    expect(s.audit).toHaveLength(1);
  });

  it('actualiza solo lo que cambió, sin tocar el código, y audita el diff', async () => {
    const s = setup();
    const { item } = await upsertProduct(MANAGER, PRODUCT, s.productDeps);

    const result = await upsertProduct(
      MANAGER,
      { ...PRODUCT, id: item.id, code: 'OTRO', name: 'Tornillo 1/4', referencePrice: '2.0000' },
      s.productDeps,
    );

    expect(result).toMatchObject({ created: false, changed: true });
    expect(result.item.code).toBe('PR-001');
    expect(s.audit.at(-1)).toMatchObject({
      action: 'product.updated',
      data: {
        changes: {
          name: { from: 'Tornillo', to: 'Tornillo 1/4' },
          referencePrice: { from: '1.5000', to: '2.0000' },
        },
      },
    });
  });

  it('sin cambios no escribe ni audita', async () => {
    const s = setup();
    const { item } = await upsertProduct(MANAGER, PRODUCT, s.productDeps);

    const result = await upsertProduct(MANAGER, { ...PRODUCT, id: item.id }, s.productDeps);

    expect(result.changed).toBe(false);
    expect(s.audit).toHaveLength(1);
  });

  it('id inexistente: NotFoundError', async () => {
    const s = setup();

    await expect(upsertProduct(MANAGER, { ...PRODUCT, id: 'nope' }, s.productDeps)).rejects.toThrow(
      NotFoundError,
    );
  });
});

describe('setProductActive / setCostCenterActive', () => {
  it('desactiva y reactiva con su evento, y no repite si ya está así', async () => {
    const s = setup();
    const { item } = await upsertProduct(MANAGER, PRODUCT, s.productDeps);

    expect(await setProductActive(MANAGER, { id: item.id, active: false }, s.productDeps)).toEqual({
      changed: true,
    });
    expect(await setProductActive(MANAGER, { id: item.id, active: false }, s.productDeps)).toEqual({
      changed: false,
    });
    await setProductActive(MANAGER, { id: item.id, active: true }, s.productDeps);

    expect(s.audit.map((a) => a.action)).toEqual([
      'product.created',
      'product.deactivated',
      'product.reactivated',
    ]);
  });

  it('exige catalog.manage y falla con id ajeno', async () => {
    const s = setup();
    const { item } = await upsertCostCenter(MANAGER, { code: 'CC-1', name: 'Obra' }, s.costDeps);

    await expect(
      setCostCenterActive(REQUESTER, { id: item.id, active: false }, s.costDeps),
    ).rejects.toThrow(ForbiddenError);
    await expect(
      setCostCenterActive(MANAGER, { id: 'otro', active: false }, s.costDeps),
    ).rejects.toThrow(NotFoundError);
  });
});

describe('lecturas', () => {
  it('catalog.manage ve el filtro de estado; quien solo crea SOF ve solo activos', async () => {
    const s = setup();
    const query = { q: null, status: 'inactive' as const, page: 1, pageSize: 25 };

    await listProducts(MANAGER, query, s.productDeps);
    expect(s.products.lastFilter?.status).toBe('inactive');

    await listProducts(REQUESTER, query, s.productDeps);
    expect(s.products.lastFilter?.status).toBe('active');
  });

  it('sin permiso de lectura: ForbiddenError', async () => {
    const s = setup();

    await expect(
      listProducts(NOBODY, { q: null, status: 'all', page: 1, pageSize: 25 }, s.productDeps),
    ).rejects.toThrow(ForbiddenError);
    await expect(searchProducts(NOBODY, { q: 'a' }, s.productDeps)).rejects.toThrow(ForbiddenError);
    await expect(
      getDefaultWarehouse(NOBODY, { warehouses: { findDefault: () => Promise.resolve(null) } }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('searchProducts acota el límite a 50', async () => {
    let received = 0;
    const deps = {
      products: {
        search: (_t: string, _q: string, limit: number) => {
          received = limit;
          return Promise.resolve([]);
        },
      },
    } as unknown as Pick<ProductDeps, 'products'>;

    await searchProducts(REQUESTER, { q: ' tor ', limit: 500 }, deps);

    expect(received).toBe(50);
  });

  it('getDefaultWarehouse: NotFoundError si no hay', async () => {
    await expect(
      getDefaultWarehouse(REQUESTER, { warehouses: { findDefault: () => Promise.resolve(null) } }),
    ).rejects.toThrow(NotFoundError);
  });
});

describe('getCatalogRefs', () => {
  it('devuelve solo los activos pedidos, sin repetir ids', async () => {
    const s = setup();
    await upsertProduct(MANAGER, PRODUCT, s.productDeps);
    await upsertCostCenter(MANAGER, { code: 'CC-1', name: 'Centro' }, s.costDeps);
    const productId = s.products.rows[0]?.id ?? '';
    const costCenterId = s.costCenters.rows[0]?.id ?? '';
    const equipment = memoryRepo<never, never>();

    const refs = await getCatalogRefs(
      REQUESTER,
      { productIds: [productId, productId], equipmentIds: [], costCenterIds: [costCenterId] },
      { products: s.products, costCenters: s.costCenters, equipment },
    );

    expect(refs.products.map((p) => p.id)).toEqual([productId]);
    expect(refs.costCenters.map((c) => c.id)).toEqual([costCenterId]);
    expect(refs.equipment).toEqual([]);
  });

  it('no devuelve los inactivos y exige permiso de lectura', async () => {
    const s = setup();
    await upsertProduct(MANAGER, PRODUCT, s.productDeps);
    const productId = s.products.rows[0]?.id ?? '';
    await setProductActive(MANAGER, { id: productId, active: false }, s.productDeps);
    const deps = {
      products: s.products,
      costCenters: s.costCenters,
      equipment: memoryRepo<never, never>(),
    };
    const input = { productIds: [productId], equipmentIds: [], costCenterIds: [] };

    expect((await getCatalogRefs(REQUESTER, input, deps)).products).toEqual([]);
    await expect(getCatalogRefs(NOBODY, input, deps)).rejects.toThrow(ForbiddenError);
  });
});
