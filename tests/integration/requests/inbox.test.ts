// E3-H3 · Bandeja contra la base real: visibilidad entre dos tenants (A y B), «Esperan mi
// aprobación» con un ApprovalAssignments falso, búsqueda, orden, paginación y conteos.
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { closeDatabases, getDbAdmin } from '@/db/admin';
import { users } from '@/db/schema';
import { FixedClock } from '@tests/support/fakes/fixed-clock';

import { createIdentityFixtures } from '../helpers/identity-fixtures';
import {
  addMember,
  fakeAssignments,
  insertRequest,
  runInbox,
  seedRequestsWorld,
  type Member,
  type RequestsWorld,
} from '../helpers/requests-fixtures';

const fx = createIdentityFixtures();
let A: RequestsWorld;
let B: RequestsWorld;
let ana: Member;
let reader: Member;
let approver: Member;

// A
let ownDraft: string;
let ownSent: string;
let anaDraft: string;
let anaSent: string;
let anaApproved: string;
// B
let bSent: string;

const ids = (out: { items: { id: string }[] }) => out.items.map((item) => item.id);

beforeAll(async () => {
  A = await seedRequestsWorld(fx);
  B = await seedRequestsWorld(fx);
  await getDbAdmin().update(users).set({ fullName: 'Ruby Pérez' }).where(eq(users.id, A.userId));
  ana = await addMember(fx, A, { fullName: 'Ana Torres' });
  reader = await addMember(fx, A, {
    fullName: 'Lector Total',
    permissions: ['requests.read_own', 'requests.read_all'],
    roles: ['approver'],
  });
  approver = await addMember(fx, A, {
    fullName: 'Aprobador Asignado',
    permissions: ['requests.read_own', 'approvals.decide'],
    roles: ['approver'],
  });

  const t = (iso: string) => new Date(iso);
  ownDraft = await insertRequest(A, { status: 'draft', updatedAt: t('2026-11-20T10:00:00Z') });
  ownSent = await insertRequest(A, {
    number: 'SOF-0001',
    equipmentId: A.equipmentId,
    updatedAt: t('2026-11-20T11:00:00Z'),
  });
  anaDraft = await insertRequest(A, {
    requesterId: ana.userId,
    status: 'draft',
    updatedAt: t('2026-11-20T12:00:00Z'),
  });
  anaSent = await insertRequest(A, {
    requesterId: ana.userId,
    number: 'SOF-0002',
    updatedAt: t('2026-11-20T13:00:00Z'),
  });
  anaApproved = await insertRequest(A, {
    requesterId: ana.userId,
    status: 'approved',
    number: 'SOF-0003',
    approvedAt: t('2026-11-24T10:00:00Z'),
    updatedAt: t('2026-11-24T10:00:00Z'),
  });
  bSent = await insertRequest(B, { number: 'SOF-0001', updatedAt: t('2026-11-21T10:00:00Z') });
});

afterAll(async () => {
  await fx.cleanup();
  await closeDatabases();
});

describe('visibilidad', () => {
  it('el solicitante ve solo lo suyo (borrador incluido), nunca lo de otros ni lo de B', async () => {
    const out = await runInbox(A.ctx);

    expect(new Set(ids(out))).toEqual(new Set([ownDraft, ownSent]));
    expect(out.total).toBe(2);
    expect(ids(out)).not.toContain(bSent);
  });

  it('el otro solicitante ve su borrador y su enviada, no los de A', async () => {
    const out = await runInbox(ana.ctx);

    expect(new Set(ids(out))).toEqual(new Set([anaDraft, anaSent, anaApproved]));
  });

  it('con requests.read_all ve todo lo enviado, no los borradores ajenos, y nada de B', async () => {
    const out = await runInbox(reader.ctx);

    expect(new Set(ids(out))).toEqual(new Set([ownSent, anaSent, anaApproved]));
    expect(ids(out)).not.toContain(ownDraft);
    expect(ids(out)).not.toContain(anaDraft);
    expect(ids(out)).not.toContain(bSent);
  });

  it('el usuario de B con read_all solo ve lo de B', async () => {
    const bReader = await addMember(fx, B, {
      fullName: 'Lector B',
      permissions: ['requests.read_own', 'requests.read_all'],
    });

    expect(ids(await runInbox(bReader.ctx))).toEqual([bSent]);
  });

  it('el aprobador asignado ve las asignadas enviadas, pero no un borrador aunque figure asignado', async () => {
    const assignments = fakeAssignments([anaSent, anaDraft, bSent]);

    const out = await runInbox(approver.ctx, {}, { assignments });

    expect(ids(out)).toEqual([anaSent]);
  });

  it('sin asignaciones (noop) el aprobador sin read_all no ve nada ajeno', async () => {
    expect(ids(await runInbox(approver.ctx))).toEqual([]);
  });

  it('un id de B en las asignaciones de A no muestra nada de B', async () => {
    const out = await runInbox(approver.ctx, {}, { assignments: fakeAssignments([bSent]) });
    expect(out.items).toEqual([]);
  });
});

describe('«Esperan mi aprobación»', () => {
  it('pestaña y tarjeta: paso pendiente mío, en aprobación y de otro solicitante', async () => {
    // Un SOF propio del aprobador, también «pendiente»: no cuenta.
    const mine = await insertRequest(A, {
      requesterId: approver.userId,
      number: 'SOF-0099',
      updatedAt: new Date('2026-11-20T14:00:00Z'),
    });
    const assignments = fakeAssignments([anaSent, mine, anaApproved], [anaSent, mine, anaApproved]);

    const tab = await runInbox(approver.ctx, { tab: 'awaiting_me' }, { assignments });
    const all = await runInbox(approver.ctx, {}, { assignments });

    expect(ids(tab)).toEqual([anaSent]);
    expect(tab.total).toBe(1);
    expect(tab.summary.awaitingMe).toBe(1);
    const shown = Object.fromEntries(all.items.map((item) => [item.id, item.displayStatus]));
    expect(shown[anaSent]).toBe('awaiting_my_approval');
    expect(shown[mine]).toBe('in_approval');
    expect(shown[anaApproved]).toBe('approved');
  });

  it('sin pasos pendientes la pestaña queda vacía y la tarjeta en 0', async () => {
    const out = await runInbox(reader.ctx, { tab: 'awaiting_me' });
    expect(out.items).toEqual([]);
    expect(out.summary.awaitingMe).toBe(0);
  });
});

describe('pestañas por estado', () => {
  it('cada pestaña filtra por su estado sobre lo visible', async () => {
    expect(ids(await runInbox(reader.ctx, { tab: 'in_approval' }))).toEqual(
      expect.arrayContaining([ownSent, anaSent]),
    );
    expect(ids(await runInbox(reader.ctx, { tab: 'approved' }))).toEqual([anaApproved]);
    expect(ids(await runInbox(A.ctx, { tab: 'draft' }))).toEqual([ownDraft]);
    expect(ids(await runInbox(reader.ctx, { tab: 'draft' }))).toEqual([]);
    expect(ids(await runInbox(A.ctx, { tab: 'rejected' }))).toEqual([]);
  });

  it('«Aprobadas» no incluye entregadas, con cambios ni anuladas', async () => {
    const world = await seedRequestsWorld(fx);
    const mine = (status: 'delivered' | 'changes_requested' | 'cancelled' | 'approved') =>
      insertRequest(world, { status });
    const delivered = await mine('delivered');
    const changes = await mine('changes_requested');
    const approved = await mine('approved');
    const cancelled = await mine('cancelled');

    expect(ids(await runInbox(world.ctx, { tab: 'approved' }))).toEqual([approved]);
    expect(new Set(ids(await runInbox(world.ctx)))).toEqual(
      new Set([delivered, changes, approved, cancelled]),
    );
  });
});

describe('búsqueda', () => {
  let world: RequestsWorld;

  beforeAll(async () => {
    world = await seedRequestsWorld(fx);
    await insertRequest(world, { number: 'SOF-0142', reason: 'Cambio de filtro de aceite' });
    await insertRequest(world, { number: 'SOF-0143', reason: 'Descuento del 50% en repuestos' });
    await insertRequest(world, { number: 'SOF-0144', reason: 'Descuento del 500 en repuestos' });
    await insertRequest(world, { number: 'SOF-0145', reason: 'Pieza_nueva del motor' });
    await insertRequest(world, { number: 'SOF-0146', reason: 'Piezaxnueva del motor' });
    await insertRequest(world, { status: 'draft', reason: 'Borrador de aceite' });
  });

  const numbers = async (q: string) =>
    (await runInbox(world.ctx, { q })).items.map((item) => item.number).sort();

  it('por número completo o parcial, sin distinguir mayúsculas', async () => {
    expect(await numbers('SOF-0142')).toEqual(['SOF-0142']);
    expect(await numbers('142')).toEqual(['SOF-0142']);
    expect(await numbers('sof-014')).toEqual([
      'SOF-0142',
      'SOF-0143',
      'SOF-0144',
      'SOF-0145',
      'SOF-0146',
    ]);
  });

  it('por motivo, incluidos los borradores sin número', async () => {
    expect(await numbers('aceite')).toEqual(['SOF-0142', null]);
  });

  it('varias palabras se combinan con AND, en cualquier orden', async () => {
    expect(await numbers('aceite filtro')).toEqual(['SOF-0142']);
    expect(await numbers('filtro aceite')).toEqual(['SOF-0142']);
    expect(await numbers('filtro motor')).toEqual([]);
  });

  it('% y _ se buscan como texto literal', async () => {
    expect(await numbers('50%')).toEqual(['SOF-0143']);
    expect(await numbers('%')).toEqual(['SOF-0143']);
    expect(await numbers('Pieza_nueva')).toEqual(['SOF-0145']);
    expect(await numbers('_')).toEqual(['SOF-0145']);
    expect(await numbers('\\')).toEqual([]);
  });

  it('el total y las páginas respetan la búsqueda; los conteos no', async () => {
    const out = await runInbox(world.ctx, { q: 'aceite' });
    expect(out.total).toBe(2);
    expect(out.summary.inApproval).toBe(5);
  });
});

describe('orden, paginación y conteos', () => {
  let world: RequestsWorld;
  let created: string[];

  beforeAll(async () => {
    world = await seedRequestsWorld(fx);
    created = [];
    // 30 solicitudes: la 1 es la más antigua. Las dos últimas comparten `updated_at`.
    for (let n = 1; n <= 30; n += 1) {
      const minutes = Math.min(n, 29);
      created.push(
        await insertRequest(world, {
          number: `ORD-${String(n).padStart(3, '0')}`,
          updatedAt: new Date(Date.UTC(2026, 10, 10, 8, minutes)),
        }),
      );
    }
  });

  it('25 por página, la más reciente primero, y la página 2 trae el resto', async () => {
    const first = await runInbox(world.ctx, { page: 1 });
    const second = await runInbox(world.ctx, { page: 2 });

    expect(first.items).toHaveLength(25);
    expect(second.items).toHaveLength(5);
    expect(first.total).toBe(30);
    expect(second.page).toBe(2);
    expect(second.pageSize).toBe(25);
    expect(first.items.map((i) => i.number).slice(2, 4)).toEqual(['ORD-028', 'ORD-027']);
    expect(second.items.map((i) => i.number)).toEqual([
      'ORD-005',
      'ORD-004',
      'ORD-003',
      'ORD-002',
      'ORD-001',
    ]);
  });

  it('con el mismo updated_at desempata por id descendente (orden estable)', async () => {
    const [x, y] = [created[28], created[29]] as [string, string];
    const out = await runInbox(world.ctx, { page: 1 });

    const top = out.items.slice(0, 2).map((item) => item.id);
    expect(top).toEqual([x, y].sort().reverse());
    expect(top).toEqual(
      (await runInbox(world.ctx, { page: 1 })).items.slice(0, 2).map((i) => i.id),
    );
  });

  it('una página fuera de rango devuelve filas vacías pero el total real', async () => {
    const out = await runInbox(world.ctx, { page: 9 });
    expect(out.items).toEqual([]);
    expect(out.total).toBe(30);
  });

  it('«Aprobadas esta semana» cuenta desde el lunes 00:00 de la zona del tenant', async () => {
    const w = await seedRequestsWorld(fx);
    // Lima es UTC-5: el lunes 2026-11-23 00:00 es 2026-11-23T05:00Z.
    await insertRequest(w, { status: 'approved', approvedAt: new Date('2026-11-23T05:00:00Z') });
    await insertRequest(w, { status: 'approved', approvedAt: new Date('2026-11-25T10:00:00Z') });
    await insertRequest(w, { status: 'approved', approvedAt: new Date('2026-11-23T04:59:59Z') });
    await insertRequest(w, { status: 'approved', approvedAt: null });
    await insertRequest(w, { status: 'delivered', approvedAt: new Date('2026-11-24T10:00:00Z') });
    await insertRequest(w, { status: 'in_approval' });
    await insertRequest(w, { status: 'draft' });

    const out = await runInbox(
      w.ctx,
      {},
      { clock: new FixedClock(new Date('2026-11-25T15:00:00Z')) },
    );

    expect(out.summary).toEqual({ awaitingMe: 0, inApproval: 1, approvedThisWeek: 2 });
  });

  it('los conteos ignoran pestaña y búsqueda y respetan la visibilidad', async () => {
    const out = await runInbox(world.ctx, { tab: 'draft', q: 'inexistente' });

    expect(out.items).toEqual([]);
    expect(out.summary.inApproval).toBe(30);
  });
});

describe('nombres', () => {
  it('resuelve solicitante, equipo y centro de costo; el saludo usa el nombre del usuario', async () => {
    const world = await seedRequestsWorld(fx);
    const lucia = await addMember(fx, world, { fullName: 'Lucía Gómez' });
    const withEquipment = await insertRequest(world, {
      requesterId: lucia.userId,
      equipmentId: world.equipmentId,
      updatedAt: new Date('2026-11-20T12:00:00Z'),
    });
    const withCostCenter = await insertRequest(world, {
      requesterId: lucia.userId,
      updatedAt: new Date('2026-11-20T11:00:00Z'),
    });
    const bare = await insertRequest(world, {
      requesterId: lucia.userId,
      costCenterId: null,
      updatedAt: new Date('2026-11-20T10:00:00Z'),
    });
    const reader2 = await addMember(fx, world, {
      fullName: 'Pedro Lector',
      permissions: ['requests.read_own', 'requests.read_all'],
    });

    const out = await runInbox(reader2.ctx);

    const byId = Object.fromEntries(out.items.map((item) => [item.id, item]));
    expect(byId[withEquipment]).toMatchObject({
      requesterName: 'Lucía Gómez',
      areaLabel: 'EQ-1 · Grúa',
    });
    expect(byId[withCostCenter]?.areaLabel).toBe('Obra norte');
    expect(byId[bare]?.areaLabel).toBeNull();
    expect(out.viewerName).toBe('Pedro Lector');
  });

  it('el nombre de un usuario de otro tenant no se resuelve', async () => {
    const out = await runInbox(A.ctx);
    // A solo muestra solicitudes de A; el saludo es el de Ruby y nunca el de B.
    expect(out.viewerName).toBe('Ruby Pérez');
    const bOnly = await runInbox(B.ctx);
    expect(bOnly.items.every((item) => item.requesterId === B.userId)).toBe(true);
  });
});

describe('formato', () => {
  it('el monto sale como texto con 2 decimales y la fecha en ISO', async () => {
    const world = await seedRequestsWorld(fx);
    await insertRequest(world, {
      totalAmount: '1860.5',
      updatedAt: new Date('2026-11-20T12:00:00Z'),
    });

    const [item] = (await runInbox(world.ctx)).items;

    expect(item?.totalAmount).toBe('1860.50');
    expect(item?.updatedAt).toBe('2026-11-20T12:00:00.000Z');
    expect(item?.currency).toBe('PEN');
  });
});
