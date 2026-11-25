// E3-H3 · listRequests con consulta y puertos falsos (la base se prueba en integración).
import { makeCtx } from '@tests/support/ctx';
import { FixedClock } from '@tests/support/fakes/fixed-clock';
import { describe, expect, it } from 'vitest';

import { ForbiddenError } from '@/shared/errors';

import type { InboxListQuery, InboxRow, InboxVisibility, ListRequestsDeps } from './ports';
import { listRequests } from './list-requests';

const ME = '11111111-1111-4111-8111-111111111111';
const ANA = '22222222-2222-4222-8222-222222222222';
const EQ = '77777777-7777-4777-8777-777777777771';
const CC = '66666666-6666-4666-8666-666666666661';
const R1 = '00000000-0000-4000-8000-000000000001';
const R2 = '00000000-0000-4000-8000-000000000002';
const R3 = '00000000-0000-4000-8000-000000000003';

const ctx = makeCtx({
  userId: ME,
  permissions: ['requests.read_own'],
  timezone: 'America/Lima',
});

const row = (overrides: Partial<InboxRow>): InboxRow => ({
  id: R1,
  docType: 'SOF',
  number: 'SOF-0001',
  status: 'in_approval',
  requesterId: ANA,
  equipmentId: null,
  costCenterId: null,
  currency: 'PEN',
  totalAmount: '10.00',
  updatedAt: new Date('2026-11-25T14:00:00.000Z'),
  ...overrides,
});

function setup(rows: InboxRow[], pending: string[] = [], assigned: string[] = []) {
  const calls: {
    list: InboxListQuery[];
    summary: { visibility: InboxVisibility; weekStart: Date }[];
    userNames: string[][];
    areaIds: { equipmentIds: readonly string[]; costCenterIds: readonly string[] }[];
  } = { list: [], summary: [], userNames: [], areaIds: [] };
  const deps: ListRequestsDeps = {
    queries: {
      list: (query) => {
        calls.list.push(query);
        return Promise.resolve({ items: rows, total: 42 });
      },
      summary: (visibility, weekStart) => {
        calls.summary.push({ visibility, weekStart });
        return Promise.resolve({ awaitingMe: 1, inApproval: 2, approvedThisWeek: 3 });
      },
    },
    assignments: {
      assignedRequestIds: () => Promise.resolve(assigned),
      pendingRequestIds: () => Promise.resolve(pending),
    },
    labels: {
      userNames: (_ctx, ids) => {
        calls.userNames.push([...ids]);
        return Promise.resolve(
          new Map([
            [ME, 'Ruby Pérez'],
            [ANA, 'Ana Torres'],
          ]),
        );
      },
      areaLabels: (_ctx, ids) => {
        calls.areaIds.push(ids);
        return Promise.resolve({
          equipment: new Map([[EQ, 'GEN-045 · Motor principal']]),
          costCenters: new Map([[CC, 'Mantenimiento']]),
        });
      },
    },
    clock: new FixedClock(new Date('2026-11-25T15:00:00.000Z')),
  };
  return { deps, calls };
}

const INPUT = { tab: 'all', q: null, page: 1, pageSize: 25 } as const;

describe('listRequests', () => {
  it('sin ningún permiso de lectura es 403', async () => {
    const s = setup([]);
    await expect(
      listRequests(makeCtx({ permissions: ['approvals.decide'] }), INPUT, s.deps),
    ).rejects.toThrow(ForbiddenError);
  });

  it('pasa tenant, alcance, pendientes y la semana (lunes en la zona del tenant)', async () => {
    const s = setup([], [R2], [R1, R2]);

    await listRequests(ctx, { ...INPUT, tab: 'approved', q: 'filtro', page: 2 }, s.deps);

    expect(s.calls.list[0]).toMatchObject({
      tenantId: ctx.tenantId,
      scope: { viewerId: ME, readAll: false, assignedIds: [R1, R2] },
      pendingIds: [R2],
      tab: 'approved',
      q: 'filtro',
      page: 2,
      pageSize: 25,
    });
    expect(s.calls.summary[0]?.weekStart.toISOString()).toBe('2026-11-23T05:00:00.000Z');
    expect(s.calls.summary[0]?.visibility.scope.viewerId).toBe(ME);
  });

  it('resuelve nombres y áreas en lote solo de las filas de la página', async () => {
    const s = setup([
      row({ id: R1, equipmentId: EQ, costCenterId: CC }),
      row({ id: R2, equipmentId: EQ }),
      row({ id: R3, costCenterId: CC }),
    ]);

    const out = await listRequests(ctx, INPUT, s.deps);

    expect(s.calls.userNames).toHaveLength(1);
    expect(new Set(s.calls.userNames[0])).toEqual(new Set([ME, ANA]));
    expect(s.calls.areaIds[0]).toEqual({ equipmentIds: [EQ], costCenterIds: [CC] });
    expect(out.items.map((item) => item.areaLabel)).toEqual([
      'GEN-045 · Motor principal',
      'GEN-045 · Motor principal',
      'Mantenimiento',
    ]);
    expect(out.items[0]?.requesterName).toBe('Ana Torres');
    expect(out.viewerName).toBe('Ruby Pérez');
  });

  it('sin equipo ni centro de costo el área es null', async () => {
    const out = await listRequests(ctx, INPUT, setup([row({})]).deps);
    expect(out.items[0]?.areaLabel).toBeNull();
  });

  it('devuelve el total, la página y los conteos tal como vienen', async () => {
    const out = await listRequests(ctx, { ...INPUT, page: 2 }, setup([row({})]).deps);
    expect(out).toMatchObject({
      total: 42,
      page: 2,
      pageSize: 25,
      summary: { awaitingMe: 1, inApproval: 2, approvedThisWeek: 3 },
    });
    expect(out.items[0]?.updatedAt).toBe('2026-11-25T14:00:00.000Z');
  });

  it('«Espera mi aprobación» solo con paso pendiente mío, en aprobación y de otro', async () => {
    const s = setup(
      [
        row({ id: R1, status: 'in_approval' }),
        row({ id: R2, status: 'in_approval', requesterId: ME }),
        row({ id: R3, status: 'approved' }),
      ],
      [R1, R2, R3],
    );

    const out = await listRequests(ctx, INPUT, s.deps);

    expect(out.items.map((item) => item.displayStatus)).toEqual([
      'awaiting_my_approval',
      'in_approval',
      'approved',
    ]);
  });

  it('marca el borrador propio (va al editor) y no el ajeno', async () => {
    const s = setup([
      row({ id: R1, status: 'draft', number: null, requesterId: ME }),
      row({ id: R2, status: 'draft', number: null, requesterId: ANA }),
    ]);

    const out = await listRequests(ctx, INPUT, s.deps);

    expect(out.items.map((item) => item.isOwnDraft)).toEqual([true, false]);
    expect(out.items[0]?.number).toBeNull();
  });

  it('el nombre del saludo es null si no se resuelve', async () => {
    const s = setup([]);
    s.deps.labels.userNames = () => Promise.resolve(new Map());
    expect((await listRequests(ctx, INPUT, s.deps)).viewerName).toBeNull();
  });
});
