// E3-H4 · getRequestDetail con repositorio, asignaciones y nombres falsos (la base se prueba en
// integración).
import { makeCtx } from '@tests/support/ctx';
import { describe, expect, it } from 'vitest';

import { ForbiddenError, NotFoundError } from '@/shared/errors';

import { getRequestDetailContract } from '../contracts';
import type { Request, RequestLine } from '../domain/request';
import type { ApprovalTimelineEntry } from '../domain/request-timeline';

import { getRequestDetail } from './get-request-detail';
import type { GetRequestDetailDeps } from './ports';

const OWNER = '11111111-1111-4111-8111-111111111111';
const ANA = '22222222-2222-4222-8222-222222222222';
const STEP_ID = '33333333-3333-4333-8333-333333333333';
const APPROVER = '33333333-3333-4333-8333-333333333333';
const REQ = '00000000-0000-4000-8000-000000000001';
const CC = '66666666-6666-4666-8666-666666666661';
const EQ_HEAD = '77777777-7777-4777-8777-777777777771';
const EQ_LINE = '77777777-7777-4777-8777-777777777772';
const EQ_GONE = '77777777-7777-4777-8777-777777777773';

const T = new Date('2026-11-25T14:00:00.000Z');

const request = (overrides: Partial<Request> = {}): Request => ({
  id: REQ,
  tenantId: '99999999-9999-4999-8999-999999999999',
  docType: 'SOF',
  number: 'SOF-0001',
  status: 'in_approval',
  requesterId: ANA,
  costCenterId: CC,
  warehouseId: '88888888-8888-4888-8888-888888888881',
  equipmentId: EQ_HEAD,
  reason: 'Mantenimiento',
  currency: 'PEN',
  totalAmount: '30.00',
  submittedAt: T,
  approvedAt: null,
  deliveredAt: null,
  closedAt: null,
  closedBy: null,
  closeComment: null,
  version: 3,
  createdAt: T,
  updatedAt: T,
  ...overrides,
});

const line = (n: number, overrides: Partial<RequestLine> = {}): RequestLine => ({
  id: `00000000-0000-4000-8000-00000000010${n}`,
  lineNo: n,
  productId: '55555555-5555-4555-8555-555555555551',
  productCode: `P-${n}`,
  description: `Producto ${n}`,
  unit: 'UND',
  equipmentId: null,
  quantity: '2.000',
  unitPrice: '5.0000',
  subtotal: '10.00',
  notes: null,
  status: 'active',
  revision: 1,
  needsReconfirmation: false,
  ...overrides,
});

function setup(
  req: Request,
  lines: RequestLine[],
  {
    assigned = [],
    pending = [],
    entries = null,
  }: {
    assigned?: string[];
    pending?: string[];
    entries?: readonly ApprovalTimelineEntry[] | null;
  } = {},
) {
  const calls = { isAssigned: 0, pending: 0, timeline: 0, userNames: [] as string[][] };
  const areaIds: { equipmentIds: readonly string[]; costCenterIds: readonly string[] }[] = [];
  const deps: GetRequestDetailDeps = {
    requests: {
      find: (_tenant, id) => Promise.resolve(id === req.id ? { request: req, lines } : null),
    } as GetRequestDetailDeps['requests'],
    assignments: {
      assignedRequestIds: () => Promise.resolve(assigned),
      isAssigned: (_ctx, id) => {
        calls.isAssigned += 1;
        return Promise.resolve(assigned.includes(id));
      },
      pendingRequestIds: () => Promise.resolve(pending),
      pendingStepId: (_ctx, id) => {
        calls.pending += 1;
        return Promise.resolve(pending.includes(id) ? STEP_ID : null);
      },
    },
    timeline: {
      getTimeline: () => {
        calls.timeline += 1;
        return Promise.resolve(entries);
      },
    },
    labels: {
      userNames: (_ctx, ids) => {
        calls.userNames.push([...ids]);
        return Promise.resolve(
          new Map([
            [ANA, 'Ana Torres'],
            [OWNER, 'Ruby Pérez'],
            [APPROVER, 'Sergio Díaz'],
          ]),
        );
      },
      areaLabels: (_ctx, ids) => {
        areaIds.push(ids);
        return Promise.resolve({
          equipment: new Map([
            [EQ_HEAD, 'GEN-045 · Motor principal'],
            [EQ_LINE, 'GEN-046 · Motor auxiliar'],
          ]),
          equipmentCodes: new Map([
            [EQ_HEAD, 'GEN-045'],
            [EQ_LINE, 'GEN-046'],
          ]),
          costCenters: new Map([[CC, 'Mantenimiento']]),
        });
      },
    },
  };
  return { deps, calls, areaIds };
}

const requesterCtx = makeCtx({
  userId: ANA,
  permissions: ['requests.create', 'requests.read_own'],
});
const approverCtx = makeCtx({
  userId: APPROVER,
  permissions: ['requests.read_own', 'requests.read_all', 'approvals.decide'],
});

describe('getRequestDetail', () => {
  it('arma el detalle con nombres, solo líneas activas y línea de tiempo', async () => {
    const { deps, areaIds } = setup(request(), [
      line(2, { equipmentId: EQ_LINE }),
      line(1),
      line(3, { status: 'removed', equipmentId: EQ_GONE }),
    ]);
    const detail = await getRequestDetail(requesterCtx, { id: REQ }, deps);

    expect(detail).toMatchObject({
      number: 'SOF-0001',
      status: 'in_approval',
      displayStatus: 'in_approval',
      requesterName: 'Ana Torres',
      costCenterLabel: 'Mantenimiento',
      equipmentLabel: 'GEN-045 · Motor principal',
      totalAmount: '30.00',
    });
    expect(detail.lines.map((l) => [l.lineNo, l.equipmentLabel])).toEqual([
      [1, null],
      [2, 'GEN-046 · Motor auxiliar'],
    ]);
    expect(detail.timeline.map((i) => `${i.kind}:${i.state}`)).toEqual([
      'created:done',
      'submitted:done',
      'approval:pending',
      'delivery:upcoming',
    ]);
    expect(detail.timeline[0]).toMatchObject({ actorName: 'Ana Torres', at: T.toISOString() });
    expect(detail.timeline[2]).toMatchObject({ actorName: null, at: null });
    // No se piden rótulos de las líneas quitadas.
    expect(areaIds[0]?.equipmentIds).not.toContain(EQ_GONE);
    // La salida respeta el contrato.
    expect(() => getRequestDetailContract.outputSchema.parse(detail)).not.toThrow();
  });

  it('con instancia, la línea sale del motor: rondas, paso pendiente con asignados y entrega', async () => {
    const entry = (
      overrides: Partial<ApprovalTimelineEntry> & Pick<ApprovalTimelineEntry, 'kind'>,
    ): ApprovalTimelineEntry => ({
      at: T,
      actorId: null,
      comment: null,
      stepName: null,
      rule: null,
      assigneeIds: [],
      data: null,
      ...overrides,
    });
    const { deps, calls } = setup(request(), [line(1)], {
      entries: [
        entry({ kind: 'submitted', actorId: ANA }),
        entry({ kind: 'step_approved', actorId: OWNER, stepName: 'Almacén', comment: 'Hay stock' }),
        entry({
          kind: 'step_pending',
          stepName: 'Gerencia local',
          rule: 'any',
          assigneeIds: [APPROVER, OWNER, '99999999-9999-4999-8999-999999999999'],
        }),
      ],
    });
    const detail = await getRequestDetail(requesterCtx, { id: REQ }, deps);
    expect(detail.timeline.map((i) => `${i.kind}:${i.state}`)).toEqual([
      'created:done',
      'submitted:done',
      'step_approved:done',
      'approval:pending',
      'delivery:upcoming',
    ]);
    expect(detail.timeline[2]).toMatchObject({
      stepName: 'Almacén',
      actorName: 'Ruby Pérez',
      comment: 'Hay stock',
    });
    // Los asignados sin nombre se omiten; el resto va ordenado por nombre.
    expect(detail.timeline[3]).toMatchObject({
      stepName: 'Gerencia local',
      rule: 'any',
      assigneeNames: ['Ruby Pérez', 'Sergio Díaz'],
      assigneeCount: 3,
    });
    expect(calls.timeline).toBe(1);
    // Un solo lote de nombres, con el aprobador incluido.
    expect(calls.userNames).toHaveLength(1);
    expect(calls.userNames[0]).toEqual(expect.arrayContaining([ANA, OWNER, APPROVER]));
    expect(() => getRequestDetailContract.outputSchema.parse(detail)).not.toThrow();
  });

  describe('aviso de corrección (E4-H4)', () => {
    const entry = (
      overrides: Partial<ApprovalTimelineEntry> & Pick<ApprovalTimelineEntry, 'kind'>,
    ): ApprovalTimelineEntry => ({
      at: T,
      actorId: OWNER,
      comment: null,
      stepName: null,
      rule: null,
      assigneeIds: [],
      data: null,
      ...overrides,
    });
    const corrected = (lineNo: number, overrides: Record<string, unknown> = {}) =>
      entry({
        kind: 'line_corrected',
        comment: 'Equipo equivocado',
        data: {
          lineNo,
          changeType: 'update',
          changedFields: ['equipmentId'],
          before: { equipmentId: EQ_LINE },
          after: { equipmentId: EQ_HEAD },
          reconfirmation: false,
          ...overrides,
        },
      });
    const lines = () => [line(1), line(2), line(3, { needsReconfirmation: true })];

    it('describe el último cambio, con códigos de equipo, y resalta esa línea', async () => {
      const { deps, areaIds } = setup(request(), lines(), {
        entries: [entry({ kind: 'submitted' }), corrected(2)],
      });
      const detail = await getRequestDetail(requesterCtx, { id: REQ }, deps);
      expect(detail.correctionNotice).toEqual({
        lineNo: 2,
        actorId: OWNER,
        actorName: 'Ruby Pérez',
        changeType: 'update',
        changes: [{ field: 'equipmentId', from: 'GEN-046', to: 'GEN-045' }],
        reconfirmation: false,
      });
      expect(areaIds[0]?.equipmentIds).toEqual(expect.arrayContaining([EQ_LINE, EQ_HEAD]));
      // La 2 por el aviso y la 3 porque espera reconfirmación.
      expect(detail.lines.map((l) => l.highlighted)).toEqual([false, true, true]);
      expect(detail.timeline.find((i) => i.kind === 'line_corrected')).toMatchObject({
        lineNos: [2],
        comment: 'Equipo equivocado',
      });
      expect(() => getRequestDetailContract.outputSchema.parse(detail)).not.toThrow();
    });

    it('solo vale la última corrección de la ronda vigente', async () => {
      const { deps } = setup(request(), lines(), {
        entries: [
          entry({ kind: 'submitted' }),
          corrected(1),
          entry({ kind: 'changes_requested' }),
          entry({ kind: 'resubmitted' }),
        ],
      });
      expect((await getRequestDetail(requesterCtx, { id: REQ }, deps)).correctionNotice).toBeNull();

      const second = setup(request(), lines(), {
        entries: [entry({ kind: 'submitted' }), corrected(1), corrected(2)],
      });
      const detail = await getRequestDetail(requesterCtx, { id: REQ }, second.deps);
      expect(detail.correctionNotice?.lineNo).toBe(2);
    });

    it('aprobada: el aviso sigue, pero nada se resalta (una marca vieja no cuenta)', async () => {
      const { deps } = setup(request({ status: 'approved' }), lines(), {
        entries: [entry({ kind: 'submitted' }), corrected(2), entry({ kind: 'approved' })],
      });
      const detail = await getRequestDetail(requesterCtx, { id: REQ }, deps);
      expect(detail.correctionNotice?.lineNo).toBe(2);
      expect(detail.lines.every((l) => !l.highlighted)).toBe(true);
    });

    it('sin aviso en cambios solicitados, y los datos raros se ignoran', async () => {
      const stopped = setup(request({ status: 'changes_requested' }), lines(), {
        entries: [entry({ kind: 'submitted' }), corrected(2), entry({ kind: 'changes_requested' })],
      });
      const first = await getRequestDetail(requesterCtx, { id: REQ }, stopped.deps);
      expect(first.correctionNotice).toBeNull();
      expect(first.lines.every((l) => !l.highlighted)).toBe(true);

      const odd = setup(request(), lines(), {
        entries: [
          entry({ kind: 'submitted' }),
          entry({ kind: 'line_corrected', data: { lineNo: 'dos' } }),
        ],
      });
      expect(
        (await getRequestDetail(requesterCtx, { id: REQ }, odd.deps)).correctionNotice,
      ).toBeNull();
    });

    it('una cantidad que no es decimal ignora el aviso sin romper el detalle', async () => {
      const { deps } = setup(request(), lines(), {
        entries: [
          entry({ kind: 'submitted' }),
          corrected(2, {
            changedFields: ['quantity'],
            before: { quantity: 'dos' },
            after: { quantity: '3.000' },
          }),
        ],
      });
      const detail = await getRequestDetail(requesterCtx, { id: REQ }, deps);
      expect(detail.correctionNotice).toBeNull();
    });

    it('agregar y quitar no listan campos; la reconfirmación va en el aviso', async () => {
      const { deps } = setup(request(), lines(), {
        entries: [
          entry({ kind: 'submitted' }),
          corrected(3, {
            changeType: 'add',
            changedFields: [],
            before: null,
            reconfirmation: true,
          }),
          entry({ kind: 'reconfirmation_requested', data: { lineNos: [3] } }),
        ],
      });
      const detail = await getRequestDetail(requesterCtx, { id: REQ }, deps);
      expect(detail.correctionNotice).toMatchObject({
        lineNo: 3,
        changeType: 'add',
        changes: [],
        reconfirmation: true,
      });
      expect(detail.timeline.at(-2)).toMatchObject({
        kind: 'reconfirmation_requested',
        lineNos: [3],
      });
    });
  });

  it('un borrador no consulta la línea del motor', async () => {
    const { deps, calls } = setup(
      request({ status: 'draft', number: null, submittedAt: null }),
      [],
    );
    await getRequestDetail(requesterCtx, { id: REQ }, deps);
    expect(calls.timeline).toBe(0);
  });

  it('el solicitante dueño puede anular y no decide', async () => {
    const { deps, calls } = setup(request(), [line(1)], { pending: [REQ] });
    const detail = await getRequestDetail(requesterCtx, { id: REQ }, deps);
    expect(detail.actions).toEqual(['cancel', 'download_pdf']);
    expect(calls.pending).toBe(0);
  });

  it('el aprobador con el paso pendiente ve la pastilla y las acciones de decisión', async () => {
    const { deps } = setup(request(), [line(1)], { assigned: [REQ], pending: [REQ] });
    const detail = await getRequestDetail(approverCtx, { id: REQ }, deps);
    expect(detail.displayStatus).toBe('awaiting_my_approval');
    expect(detail.pendingStepId).toBe(STEP_ID);
    expect(detail.status).toBe('in_approval');
    expect(detail.actions).toEqual(['approve', 'request_changes', 'reject', 'download_pdf']);
  });

  it('el aprobador sin el paso pendiente no decide', async () => {
    const { deps } = setup(request(), [line(1)], { assigned: [REQ] });
    const detail = await getRequestDetail(approverCtx, { id: REQ }, deps);
    expect(detail.displayStatus).toBe('in_approval');
    expect(detail.pendingStepId).toBeNull();
    expect(detail.actions).toEqual(['download_pdf']);
  });

  it('el borrador propio ofrece editar y anular', async () => {
    const { deps } = setup(request({ status: 'draft', number: null, submittedAt: null }), []);
    const detail = await getRequestDetail(requesterCtx, { id: REQ }, deps);
    expect(detail.number).toBeNull();
    expect(detail.actions).toEqual(['edit_draft', 'cancel', 'download_pdf']);
  });

  it('un borrador ajeno es 404 aunque tenga requests.read_all o esté asignado', async () => {
    const { deps } = setup(request({ status: 'draft', number: null, submittedAt: null }), [], {
      assigned: [REQ],
    });
    await expect(getRequestDetail(approverCtx, { id: REQ }, deps)).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it('sin read_all ni asignación, una solicitud ajena es 404', async () => {
    const { deps } = setup(request({ requesterId: OWNER }), [line(1)]);
    await expect(getRequestDetail(requesterCtx, { id: REQ }, deps)).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it('con el aprobador asignado (sin read_all) se puede ver', async () => {
    const { deps } = setup(request(), [line(1)], { assigned: [REQ] });
    const assignedOnly = makeCtx({ userId: APPROVER, permissions: ['requests.read_own'] });
    const detail = await getRequestDetail(assignedOnly, { id: REQ }, deps);
    expect(detail.id).toBe(REQ);
  });

  it('un id inexistente es 404', async () => {
    const { deps } = setup(request(), []);
    await expect(
      getRequestDetail(requesterCtx, { id: '00000000-0000-4000-8000-0000000000ff' }, deps),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('sin ningún permiso de solicitudes es Forbidden', async () => {
    const { deps } = setup(request(), []);
    const nobody = makeCtx({ userId: ANA, permissions: [] });
    await expect(getRequestDetail(nobody, { id: REQ }, deps)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });
});
