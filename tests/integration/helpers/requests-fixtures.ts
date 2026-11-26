// Datos de requests para pruebas de integración (E3-H1): un tenant con catálogo mínimo, secuencia
// SOF y un solicitante. Se crean con getDbAdmin() (sin RLS) y `cleanup()` de identity-fixtures los
// borra (los tenants quedan registrados con fx.tenant()).
import { makeCtx } from '@tests/support/ctx';
import { FixedClock } from '@tests/support/fakes/fixed-clock';

import { getDbAdmin } from '@/db/admin';
import { withTenant } from '@/db/with-tenant';
import { costCenters, equipment, products, requests, users, warehouses } from '@/db/schema';
import {
  createListRequestsDeps,
  createRequestsDeps,
  documentSequenceSetupStep,
  listRequests,
  type ApprovalAssignments,
  type ListRequestsInput,
} from '@/modules/requests';
import type { RequestsDeps } from '@/modules/requests';
import type { RequestStatus } from '@/modules/requests';
import { eq } from 'drizzle-orm';
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

// ── Bandeja (E3-H3) ──────────────────────────────────────────────────────────────────────────

export interface Member {
  readonly userId: string;
  readonly ctx: Ctx;
}

/** Otro usuario del mismo tenant, con un nombre completo reconocible y sus permisos. */
export async function addMember(
  fx: IdentityFixtures,
  world: RequestsWorld,
  opts: { fullName: string; permissions?: Permission[]; roles?: string[] },
): Promise<Member> {
  const user = await fx.user();
  await getDbAdmin().update(users).set({ fullName: opts.fullName }).where(eq(users.id, user.id));
  await fx.membership(world.tenantId, user.id, { roles: opts.roles ?? ['requester'] });
  return {
    userId: user.id,
    ctx: makeCtx({
      tenantId: world.tenantId,
      userId: user.id,
      permissions: opts.permissions ?? REQUESTER_PERMISSIONS,
    }),
  };
}

let requestCounter = 0;

/**
 * Inserta una solicitud con SQL (sin pasar por los casos de uso), respetando los checks de la base:
 * un borrador no tiene número ni envío; lo demás sí.
 */
export async function insertRequest(
  world: RequestsWorld,
  opts: {
    requesterId?: string;
    status?: RequestStatus;
    number?: string;
    reason?: string | null;
    equipmentId?: string | null;
    costCenterId?: string | null;
    totalAmount?: string;
    updatedAt?: Date;
    approvedAt?: Date | null;
  } = {},
): Promise<string> {
  requestCounter += 1;
  const status = opts.status ?? 'in_approval';
  const draft = status === 'draft';
  const updatedAt = opts.updatedAt ?? new Date('2026-11-20T12:00:00.000Z');
  const [row] = await getDbAdmin()
    .insert(requests)
    .values({
      tenantId: world.tenantId,
      number: draft ? null : (opts.number ?? `T-${String(requestCounter).padStart(6, '0')}`),
      status,
      requesterId: opts.requesterId ?? world.userId,
      costCenterId: opts.costCenterId === undefined ? world.costCenterId : opts.costCenterId,
      warehouseId: world.warehouseId,
      equipmentId: opts.equipmentId ?? null,
      reason: opts.reason === undefined ? 'Mantenimiento' : opts.reason,
      currency: 'PEN',
      totalAmount: opts.totalAmount ?? '100.00',
      submittedAt: draft ? null : updatedAt,
      approvedAt: opts.approvedAt ?? null,
      createdAt: updatedAt,
      updatedAt,
    })
    .returning({ id: requests.id });
  if (!row) throw new Error('solicitud no creada');
  return row.id;
}

export const NO_ASSIGNMENTS: ApprovalAssignments = {
  assignedRequestIds: () => Promise.resolve([]),
  isAssigned: () => Promise.resolve(false),
  pendingRequestIds: () => Promise.resolve([]),
};

/** ApprovalAssignments falso: lo que E4-H2 aportará, con listas fijas. */
export function fakeAssignments(assigned: string[], pending: string[] = assigned) {
  return {
    assignedRequestIds: () => Promise.resolve(assigned),
    isAssigned: (_ctx: Ctx, requestId: string) => Promise.resolve(assigned.includes(requestId)),
    pendingRequestIds: () => Promise.resolve(pending),
  } satisfies ApprovalAssignments;
}

export const INBOX_DEFAULTS: ListRequestsInput = { tab: 'all', q: null, page: 1, pageSize: 25 };

/** Corre `listRequests` dentro de withTenant con las dependencias reales. */
export function runInbox(
  ctx: Ctx,
  input: Partial<ListRequestsInput> = {},
  extras: { assignments?: ApprovalAssignments; clock?: FixedClock } = {},
) {
  return withTenant(ctx, (tx) =>
    listRequests(
      ctx,
      { ...INBOX_DEFAULTS, ...input },
      createListRequestsDeps(tx, {
        client: UNKNOWN_CLIENT,
        clock: extras.clock ?? new FixedClock(new Date('2026-11-25T15:00:00.000Z')),
        ...(extras.assignments ? { assignments: extras.assignments } : {}),
      }),
    ),
  );
}
