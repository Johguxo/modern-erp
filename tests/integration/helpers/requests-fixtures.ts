// Datos de requests para pruebas de integración (E3-H1): un tenant con catálogo mínimo, secuencia
// SOF y un solicitante. Se crean con getDbAdmin() (sin RLS) y `cleanup()` de identity-fixtures los
// borra (los tenants quedan registrados con fx.tenant()).
import { makeCtx } from '@tests/support/ctx';
import { FixedClock } from '@tests/support/fakes/fixed-clock';

import { getDbAdmin } from '@/db/admin';
import { withTenant } from '@/db/with-tenant';
import { costCenters, equipment, products, warehouses } from '@/db/schema';
import { createRequestsDeps, documentSequenceSetupStep } from '@/modules/requests';
import type { RequestsDeps } from '@/modules/requests';
import type { Ctx } from '@/shared/context';
import type { Permission } from '@/shared/permissions';
import { UNKNOWN_CLIENT } from '@/shared/ports/client-info';

import type { IdentityFixtures } from './identity-fixtures';

export interface RequestsWorld {
  readonly tenantId: string;
  readonly userId: string;
  readonly ctx: Ctx;
  readonly warehouseId: string;
  readonly productIds: {
    /** FIL-1 · 12.5000 PEN */
    readonly filter: string;
    /** PER-2 · 3.3333 PEN */
    readonly bolt: string;
    /** SIN-3 · sin precio */
    readonly noPrice: string;
    /** USD-4 · 10.0000 USD */
    readonly usd: string;
  };
  readonly equipmentId: string;
  readonly costCenterId: string;
}

export const REQUESTER_PERMISSIONS: Permission[] = ['requests.create', 'requests.read_own'];

export async function seedRequestsWorld(
  fx: IdentityFixtures,
  opts: {
    prefix?: string;
    nextNumber?: number;
    permissions?: Permission[];
  } = {},
): Promise<RequestsWorld> {
  const tenant = await fx.tenant();
  await fx.settings(tenant.id);
  const user = await fx.user();
  await fx.membership(tenant.id, user.id, { roles: ['requester'] });

  const admin = getDbAdmin();
  const tenantId = tenant.id;
  const [warehouse] = await admin
    .insert(warehouses)
    .values({ tenantId, code: 'PRINCIPAL', name: 'Almacén principal', isDefault: true })
    .returning({ id: warehouses.id });
  const inserted = await admin
    .insert(products)
    .values([
      {
        tenantId,
        code: 'FIL-1',
        name: 'Filtro de aceite',
        unit: 'UND',
        referencePrice: '12.5000',
        currency: 'PEN',
      },
      {
        tenantId,
        code: 'PER-2',
        name: 'Perno',
        unit: 'UND',
        referencePrice: '3.3333',
        currency: 'PEN',
      },
      { tenantId, code: 'SIN-3', name: 'Producto sin precio', unit: 'UND' },
      {
        tenantId,
        code: 'USD-4',
        name: 'Importado',
        unit: 'UND',
        referencePrice: '10.0000',
        currency: 'USD',
      },
    ])
    .returning({ id: products.id, code: products.code });
  const byCode = new Map(inserted.map((p) => [p.code, p.id]));
  const [equipmentRow] = await admin
    .insert(equipment)
    .values({ tenantId, code: 'EQ-1', name: 'Grúa' })
    .returning({ id: equipment.id });
  const [costCenter] = await admin
    .insert(costCenters)
    .values({ tenantId, code: 'CC-1', name: 'Obra norte' })
    .returning({ id: costCenters.id });
  await documentSequenceSetupStep({
    prefix: opts.prefix ?? 'SOF-',
    nextNumber: opts.nextNumber ?? 1,
  })(admin).run({ tenantId });

  if (!warehouse || !equipmentRow || !costCenter) throw new Error('seed de requests incompleto');
  return {
    tenantId,
    userId: user.id,
    ctx: makeCtx({
      tenantId,
      userId: user.id,
      permissions: opts.permissions ?? REQUESTER_PERMISSIONS,
    }),
    warehouseId: warehouse.id,
    productIds: {
      filter: byCode.get('FIL-1') ?? '',
      bolt: byCode.get('PER-2') ?? '',
      noPrice: byCode.get('SIN-3') ?? '',
      usd: byCode.get('USD-4') ?? '',
    },
    equipmentId: equipmentRow.id,
    costCenterId: costCenter.id,
  };
}

/** Corre fn dentro de withTenant con las dependencias reales de requests. */
export function runRequests<T>(
  ctx: Ctx,
  fn: (deps: RequestsDeps) => Promise<T>,
  extras: Partial<{ clock: FixedClock; approvals: RequestsDeps['approvals'] }> = {},
): Promise<T> {
  return withTenant(ctx, (tx) =>
    fn(
      createRequestsDeps(tx, {
        client: UNKNOWN_CLIENT,
        clock: extras.clock ?? new FixedClock(new Date('2026-11-25T15:00:00.000Z')),
        ...(extras.approvals ? { approvals: extras.approvals } : {}),
      }),
    ),
  );
}

/** Borrador completo y enviable del mundo dado. */
export function draftInput(world: RequestsWorld, overrides: Record<string, unknown> = {}) {
  return {
    costCenterId: world.costCenterId,
    equipmentId: null,
    reason: 'Mantenimiento preventivo',
    lines: [
      {
        productId: world.productIds.filter,
        quantity: '2.000',
        equipmentId: world.equipmentId,
        notes: null,
      },
      { productId: world.productIds.bolt, quantity: '2.500', equipmentId: null, notes: null },
    ],
    ...overrides,
  };
}
