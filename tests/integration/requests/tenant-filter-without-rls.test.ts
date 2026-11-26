// E3-H1 · Primera defensa: los repositorios de requests (y la lectura de referencias del catálogo)
// filtran por tenantId por sí solos. Se crean con getDbAdmin() (rol dueño, sin RLS ni withTenant):
// si se quita un eq(tenantId) de la consulta, estas pruebas fallan porque ya no hay RLS que tape el error.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { closeDatabases, getDbAdmin } from '@/db/admin';
import { createDrizzleProductRepository } from '@/modules/catalog/infrastructure/drizzle-product-repository';
import {
  createDrizzleCostCenterRepository,
  createDrizzleEquipmentRepository,
} from '@/modules/catalog/infrastructure/drizzle-simple-repositories';
import { createDrizzleUserNames } from '@/modules/identity/infrastructure/drizzle-user-names';
import { createDrizzleDocumentSequenceRepository } from '@/modules/requests/infrastructure/drizzle-document-sequence-repository';
import { createDrizzleRequestQueryRepository } from '@/modules/requests/infrastructure/drizzle-request-query-repository';
import { createDrizzleRequestRepository } from '@/modules/requests/infrastructure/drizzle-request-repository';

import { createIdentityFixtures } from '../helpers/identity-fixtures';
import { seedRequestsWorld, type RequestsWorld } from '../helpers/requests-fixtures';

const fx = createIdentityFixtures();
let A: RequestsWorld;
let B: RequestsWorld;
let requestA: string;
let requestB: string;

const requestRepo = () => createDrizzleRequestRepository(getDbAdmin());
const sequenceRepo = () => createDrizzleDocumentSequenceRepository(getDbAdmin());

const header = (world: RequestsWorld) => ({
  tenantId: world.tenantId,
  requesterId: world.userId,
  costCenterId: world.costCenterId,
  warehouseId: world.warehouseId,
  equipmentId: null,
  reason: 'prueba',
  currency: 'PEN' as const,
  totalAmount: '12.50',
});

const line = (world: RequestsWorld) => ({
  lineNo: 1,
  productId: world.productIds.filter,
  productCode: 'FIL-1',
  description: 'Filtro',
  unit: 'UND',
  equipmentId: null,
  quantity: '1.000',
  unitPrice: '12.5000',
  subtotal: '12.50',
  notes: null,
});

beforeAll(async () => {
  A = await seedRequestsWorld(fx, { prefix: 'AAA-' });
  B = await seedRequestsWorld(fx, { prefix: 'BBB-' });
  requestA = (await requestRepo().create(header(A), [line(A)])).request.id;
  requestB = (await requestRepo().create(header(B), [line(B)])).request.id;
});

afterAll(async () => {
  await fx.cleanup();
  await closeDatabases();
});

describe('los repositorios de requests filtran por tenantId sin RLS', () => {
  it('find y lockById no ven la solicitud de otro tenant', async () => {
    expect(await requestRepo().find(A.tenantId, requestB)).toBeNull();
    expect(await requestRepo().lockById(A.tenantId, requestB)).toBeNull();
    expect((await requestRepo().find(A.tenantId, requestA))?.lines).toHaveLength(1);
  });

  it('updateHeader no toca la solicitud de otro tenant (stale_version)', async () => {
    await expect(
      requestRepo().updateHeader(A.tenantId, requestB, 1, { reason: 'hackeado' }),
    ).rejects.toMatchObject({ code: 'CONFLICT', reason: 'stale_version' });

    const untouched = await requestRepo().find(B.tenantId, requestB);
    expect(untouched?.request).toMatchObject({ reason: 'prueba', version: 1 });
  });

  it('replaceLines no borra ni inserta en la solicitud de otro tenant', async () => {
    // Con el tenant A y el id de B no coincide ninguna fila: no se borra nada de B.
    await requestRepo()
      .replaceLines(A.tenantId, requestB, [])
      .catch(() => undefined);

    expect((await requestRepo().find(B.tenantId, requestB))?.lines).toHaveLength(1);
  });

  it('syncLines no actualiza, quita ni inserta líneas de otro tenant', async () => {
    const before = await requestRepo().find(B.tenantId, requestB);
    const line = before?.lines[0];
    if (!line) throw new Error('sin línea');

    const lines = await requestRepo().syncLines(A.tenantId, requestB, {
      updates: [
        {
          id: line.id,
          line: {
            ...line,
            productId: line.productId,
            lineNo: line.lineNo,
            productCode: 'HACK',
            description: 'x',
            unit: 'UND',
            equipmentId: null,
            quantity: '9.000',
            unitPrice: '1.0000',
            subtotal: '9.00',
            notes: null,
          },
        },
      ],
      inserts: [],
      removed: [line.id],
    });

    expect(lines).toEqual([]);
    expect((await requestRepo().find(B.tenantId, requestB))?.lines).toEqual(before?.lines);
  });

  it('la secuencia: find, lockForUpdate y update respetan el tenant', async () => {
    expect((await sequenceRepo().find(A.tenantId, 'SOF'))?.prefix).toBe('AAA-');
    expect((await sequenceRepo().find(B.tenantId, 'SOF'))?.prefix).toBe('BBB-');
    expect((await sequenceRepo().lockForUpdate(A.tenantId, 'SOF'))?.prefix).toBe('AAA-');
    expect(await sequenceRepo().find('00000000-0000-4000-8000-000000000000', 'SOF')).toBeNull();

    await sequenceRepo().update(A.tenantId, 'SOF', { prefix: 'CCC-' });

    expect((await sequenceRepo().find(A.tenantId, 'SOF'))?.prefix).toBe('CCC-');
    expect((await sequenceRepo().find(B.tenantId, 'SOF'))?.prefix).toBe('BBB-');
    await expect(
      sequenceRepo().update('00000000-0000-4000-8000-000000000000', 'SOF', { prefix: 'ZZZ-' }),
    ).rejects.toThrow();
  });
});

describe('findActiveByIds del catálogo filtra por tenantId sin RLS', () => {
  it('no devuelve productos, equipos ni centros de costo de otro tenant', async () => {
    const products = createDrizzleProductRepository(getDbAdmin());
    const equipment = createDrizzleEquipmentRepository(getDbAdmin());
    const costCenters = createDrizzleCostCenterRepository(getDbAdmin());

    expect(await products.findActiveByIds(A.tenantId, [B.productIds.filter])).toEqual([]);
    expect(await equipment.findActiveByIds(A.tenantId, [B.equipmentId])).toEqual([]);
    expect(await costCenters.findActiveByIds(A.tenantId, [B.costCenterId])).toEqual([]);

    const own = await products.findActiveByIds(A.tenantId, [
      A.productIds.filter,
      A.productIds.bolt,
      B.productIds.filter,
    ]);
    expect(own.map((p) => p.code).sort()).toEqual(['FIL-1', 'PER-2']);
    expect(await products.findActiveByIds(A.tenantId, [])).toEqual([]);
  });
});

describe('findByIds del catálogo filtra por tenantId sin RLS', () => {
  it('devuelve activos e inactivos del tenant, nunca de otro', async () => {
    const equipment = createDrizzleEquipmentRepository(getDbAdmin());
    const costCenters = createDrizzleCostCenterRepository(getDbAdmin());
    const products = createDrizzleProductRepository(getDbAdmin());
    await equipment.setActive(A.tenantId, A.equipmentId, false);

    expect((await equipment.findByIds(A.tenantId, [A.equipmentId])).map((e) => e.code)).toEqual([
      'EQ-1',
    ]);
    expect(await equipment.findByIds(A.tenantId, [B.equipmentId])).toEqual([]);
    expect(await costCenters.findByIds(A.tenantId, [B.costCenterId])).toEqual([]);
    expect(await products.findByIds(A.tenantId, [B.productIds.filter])).toEqual([]);
    expect(await equipment.findByIds(A.tenantId, [])).toEqual([]);
  });
});

describe('la bandeja y los nombres filtran por tenantId sin RLS', () => {
  it('list y summary solo ven las solicitudes del tenant, aun con read_all', async () => {
    const queries = createDrizzleRequestQueryRepository(getDbAdmin());
    const visibility = (world: RequestsWorld) => ({
      tenantId: world.tenantId,
      scope: { viewerId: world.userId, readAll: true, assignedIds: [] as string[] },
      pendingIds: [] as string[],
    });
    // Las dos solicitudes de la prueba son borradores propios de cada tenant.
    const a = await queries.list({ ...visibility(A), tab: 'all', q: null, page: 1, pageSize: 25 });
    const b = await queries.list({ ...visibility(B), tab: 'all', q: null, page: 1, pageSize: 25 });

    expect(a.items.map((item) => item.id)).toEqual([requestA]);
    expect(b.items.map((item) => item.id)).toEqual([requestB]);
    // Un usuario de A con el tenantId de B no ve nada: la solicitud de B no es suya.
    const crossed = await queries.list({
      ...visibility(A),
      tenantId: B.tenantId,
      tab: 'all',
      q: null,
      page: 1,
      pageSize: 25,
    });
    expect(crossed.items).toEqual([]);
    expect(crossed.total).toBe(0);

    const summary = await queries.summary(visibility(A), new Date('2026-11-23T05:00:00Z'));
    expect(summary).toEqual({ awaitingMe: 0, inApproval: 0, approvedThisWeek: 0 });
  });

  it('los nombres solo salen de miembros del tenant pedido', async () => {
    const names = createDrizzleUserNames(getDbAdmin());

    expect((await names(A.tenantId, [A.userId, B.userId])).has(A.userId)).toBe(true);
    expect((await names(A.tenantId, [A.userId, B.userId])).has(B.userId)).toBe(false);
    expect((await names(B.tenantId, [A.userId])).size).toBe(0);
    expect((await names(A.tenantId, [])).size).toBe(0);
  });
});
