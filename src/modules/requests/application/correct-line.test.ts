// E4-H4 · correctLine con repositorio, catálogo y motor falsos (la base se prueba en integración).
import { makeCtx } from '@tests/support/ctx';
import { FixedClock } from '@tests/support/fakes/fixed-clock';
import { InMemoryRequests } from '@tests/support/fakes/in-memory-requests';
import { describe, expect, it } from 'vitest';

import type { AuditLog } from '@/modules/identity';
import { ConflictError } from '@/shared/errors';
import { UNKNOWN_CLIENT } from '@/shared/ports/client-info';

import type { Request, RequestLine } from '../domain/request';
import type { RequestStatus } from '../domain/request-state-machine';

import { correctLine, type CorrectLineInput } from './correct-line';
import type { CatalogProduct, CorrectDeps, LineCorrectionRecord } from './ports';

const TENANT = '11111111-1111-4111-8111-111111111111';
const OWNER = '22222222-2222-4222-8222-222222222222';
const WAREHOUSE_USER = '33333333-3333-4333-8333-333333333333';
const REQ = '00000000-0000-4000-8000-000000000001';
const P1 = '55555555-5555-4555-8555-555555555551';
const P2 = '55555555-5555-4555-8555-555555555552';
const P_USD = '55555555-5555-4555-8555-555555555554';
const EQ = '77777777-7777-4777-8777-777777777771';
const EQ_OLD = '77777777-7777-4777-8777-777777777770';
const NOW = new Date('2026-11-26T15:00:00.000Z');

const CORRECTOR = makeCtx({
  tenantId: TENANT,
  userId: WAREHOUSE_USER,
  permissions: ['requests.correct_line', 'requests.read_all'],
});

const PRODUCTS: CatalogProduct[] = [
  {
    id: P1,
    code: 'FIL-1',
    name: 'Filtro',
    unit: 'UND',
    referencePrice: '12.5000',
    currency: 'PEN',
  },
  { id: P2, code: 'PER-2', name: 'Perno', unit: 'UND', referencePrice: '3.3333', currency: 'PEN' },
  {
    id: P_USD,
    code: 'USD-4',
    name: 'Importado',
    unit: 'UND',
    referencePrice: '10.0000',
    currency: 'USD',
  },
];

const line = (id: string, lineNo: number, extra: Partial<RequestLine> = {}): RequestLine => ({
  id,
  lineNo,
  productId: P1,
  productCode: 'FIL-1',
  description: 'Filtro',
  unit: 'UND',
  equipmentId: EQ_OLD,
  quantity: '2.000',
  unitPrice: '10.0000',
  subtotal: '20.00',
  notes: null,
  status: 'active',
  revision: 1,
  needsReconfirmation: false,
  ...extra,
});

const request = (status: RequestStatus, extra: Partial<Request> = {}): Request => ({
  id: REQ,
  tenantId: TENANT,
  docType: 'SOF',
  number: 'SOF-0001',
  status,
  requesterId: OWNER,
  costCenterId: null,
  warehouseId: '88888888-8888-4888-8888-888888888881',
  equipmentId: null,
  reason: 'Mantenimiento',
  currency: 'PEN',
  totalAmount: '30.00',
  submittedAt: NOW,
  approvedAt: status === 'approved' ? NOW : null,
  deliveredAt: null,
  closedAt: null,
  closedBy: null,
  closeComment: null,
  version: 3,
  createdAt: NOW,
  updatedAt: NOW,
  ...extra,
});

interface Engine {
  tolerancePct?: string;
  reconfirmation?: boolean;
  error?: Error;
}

function setup(status: RequestStatus = 'in_approval', engine: Engine = {}) {
  const requests = new InMemoryRequests();
  requests.seed(request(status), [
    line('line-a', 1),
    line('line-b', 2, { unitPrice: '5.0000', subtotal: '10.00', productId: P2 }),
  ]);
  const calls: string[] = [];
  const recorded: LineCorrectionRecord[] = [];
  const audit: Parameters<AuditLog['record']>[0][] = [];
  const deps: CorrectDeps = {
    requests,
    assignments: {
      assignedRequestIds: () => Promise.resolve([]),
      isAssigned: () => Promise.resolve(false),
      pendingRequestIds: () => Promise.resolve([]),
      pendingStepId: () => Promise.resolve(null),
    },
    catalog: {
      refs: (_ctx, ids) =>
        Promise.resolve({
          products: PRODUCTS.filter((p) => ids.productIds.includes(p.id)),
          equipmentIds: ids.equipmentIds.filter((id) => id === EQ),
          costCenterIds: [],
        }),
      defaultWarehouseId: () => Promise.resolve('wh'),
    },
    corrector: {
      tolerance: () => {
        calls.push('tolerance');
        if (engine.error) return Promise.reject(engine.error);
        return Promise.resolve({ tolerancePct: engine.tolerancePct ?? '0' });
      },
      record: (_ctx, input) => {
        calls.push('record');
        recorded.push(input);
        return Promise.resolve({ reconfirmation: engine.reconfirmation ?? false });
      },
    },
    audit: {
      record: (entry) => {
        calls.push('audit');
        audit.push(entry);
        return Promise.resolve();
      },
    },
    client: UNKNOWN_CLIENT,
    clock: new FixedClock(NOW),
  };
  return { requests, deps, calls, recorded, audit };
}

const update = (extra: Record<string, unknown> = {}): CorrectLineInput => ({
  id: REQ,
  version: 3,
  reason: ' Equipo mal registrado ',
  change: {
    type: 'update',
    lineId: 'line-a',
    productId: P1,
    quantity: '2.000',
    unitPrice: '10.0000',
    equipmentId: EQ_OLD,
    notes: null,
    ...extra,
  },
});

describe('correctLine · rama sin cambio de monto', () => {
  it('cambiar el equipo: guarda la revisión anterior, sube la revisión y mantiene las firmas', async () => {
    const s = setup('in_approval');
    const view = await correctLine(CORRECTOR, update({ equipmentId: EQ }), s.deps);

    expect(view).toMatchObject({
      status: 'in_approval',
      totalAmount: '30.00',
      version: 4,
      branch: 'amount_unchanged',
      reconfirmation: false,
    });
    const corrected = view.lines.find((l) => l.id === 'line-a');
    expect(corrected).toMatchObject({ equipmentId: EQ, revision: 2, needsReconfirmation: false });

    expect(s.requests.revisions).toHaveLength(1);
    expect(s.requests.revisions[0]).toMatchObject({
      tenantId: TENANT,
      requestLineId: 'line-a',
      revision: 1,
      changedBy: WAREHOUSE_USER,
      reason: 'Equipo mal registrado',
      snapshot: { equipmentId: EQ_OLD, quantity: '2.000', revision: 1 },
    });
    expect(s.recorded[0]).toMatchObject({
      lineId: 'line-a',
      lineNo: 1,
      changeType: 'update',
      branch: 'amount_unchanged',
      changedFields: ['equipmentId'],
      previousTotal: '30.00',
      newTotal: '30.00',
      tolerancePct: '0',
      requesterId: OWNER,
    });
    expect(s.recorded[0]?.before?.equipmentId).toBe(EQ_OLD);
    expect(s.recorded[0]?.after?.equipmentId).toBe(EQ);
  });

  it('el orden: tolerancia, escrituras, motor y auditoría', async () => {
    const s = setup('in_approval');
    await correctLine(CORRECTOR, update({ equipmentId: EQ }), s.deps);
    expect(s.calls).toEqual(['tolerance', 'record', 'audit']);
    expect(s.audit[0]).toMatchObject({
      action: 'request.line_corrected',
      entityId: REQ,
      data: {
        number: 'SOF-0001',
        lineId: 'line-a',
        changeType: 'update',
        branch: 'amount_unchanged',
        reconfirmation: false,
        reason: 'Equipo mal registrado',
        fromStatus: 'in_approval',
        toStatus: 'in_approval',
        version: 4,
      },
    });
  });

  it('un SOF aprobado sigue aprobado y conserva approved_at', async () => {
    const s = setup('approved');
    const view = await correctLine(CORRECTOR, update({ equipmentId: EQ }), s.deps);
    expect(view).toMatchObject({ status: 'approved', approvedAt: NOW.toISOString(), version: 4 });
    expect(s.requests.headerPatches[0]).toEqual({});
  });
});

describe('correctLine · rama dentro de la tolerancia', () => {
  it('bajar el monto no pide reconfirmar', async () => {
    const s = setup('approved');
    const view = await correctLine(CORRECTOR, update({ quantity: '1.000' }), s.deps);
    expect(view).toMatchObject({
      status: 'approved',
      totalAmount: '20.00',
      branch: 'within_tolerance',
    });
    expect(s.requests.headerPatches[0]).toEqual({ totalAmount: '20.00' });
  });

  it('subir el monto dentro de la tolerancia (10 %): 30.00 → 32.00 (6.67 %)', async () => {
    const s = setup('approved', { tolerancePct: '10' });
    const view = await correctLine(CORRECTOR, update({ unitPrice: '11.0000' }), s.deps);
    expect(view).toMatchObject({
      totalAmount: '32.00',
      branch: 'within_tolerance',
      status: 'approved',
    });
    expect(s.recorded[0]?.tolerancePct).toBe('10');
  });
});

describe('correctLine · rama por encima de la tolerancia', () => {
  it('SOF aprobado con reconfirmación: vuelve a in_approval, approved_at null y la línea marcada', async () => {
    const s = setup('approved', { reconfirmation: true });
    const view = await correctLine(CORRECTOR, update({ quantity: '5.000' }), s.deps);

    expect(view).toMatchObject({
      status: 'in_approval',
      approvedAt: null,
      totalAmount: '60.00',
      version: 4,
      branch: 'above_tolerance',
      reconfirmation: true,
    });
    expect(view.lines.find((l) => l.id === 'line-a')).toMatchObject({
      quantity: '5.000',
      subtotal: '50.00',
      revision: 2,
      needsReconfirmation: true,
    });
    expect(s.requests.get(REQ).lines.find((l) => l.id === 'line-a')?.needsReconfirmation).toBe(
      true,
    );
    expect(s.requests.headerPatches[0]).toEqual({
      totalAmount: '60.00',
      status: 'in_approval',
      approvedAt: null,
    });
    expect(s.audit[0]?.data).toMatchObject({ toStatus: 'in_approval', reconfirmation: true });
  });

  it('en in_approval con reconfirmación: sigue in_approval y la línea queda marcada', async () => {
    const s = setup('in_approval', { reconfirmation: true });
    const view = await correctLine(CORRECTOR, update({ quantity: '5.000' }), s.deps);
    expect(view).toMatchObject({ status: 'in_approval', reconfirmation: true });
    expect(view.lines.find((l) => l.id === 'line-a')?.needsReconfirmation).toBe(true);
    expect(s.requests.headerPatches[0]).toEqual({ totalAmount: '60.00' });
  });

  it('sin nadie a quien pedirle reconfirmar: el SOF aprobado sigue aprobado y sin marca', async () => {
    const s = setup('approved', { reconfirmation: false });
    const view = await correctLine(CORRECTOR, update({ quantity: '5.000' }), s.deps);
    expect(view).toMatchObject({
      status: 'approved',
      branch: 'above_tolerance',
      reconfirmation: false,
    });
    expect(view.lines.find((l) => l.id === 'line-a')?.needsReconfirmation).toBe(false);
  });
});

describe('correctLine · agregar y quitar', () => {
  it('agregar toma el catálogo, el siguiente lineNo y no guarda revisión', async () => {
    const s = setup('in_approval');
    const view = await correctLine(
      CORRECTOR,
      {
        id: REQ,
        version: 3,
        reason: 'Faltaba un perno',
        change: {
          type: 'add',
          productId: P2,
          quantity: '3',
          unitPrice: '3.3333',
          equipmentId: EQ,
          notes: ' urgente ',
        },
      },
      s.deps,
    );
    const added = view.lines.find((l) => l.lineNo === 3);
    expect(added).toMatchObject({
      productCode: 'PER-2',
      description: 'Perno',
      quantity: '3.000',
      unitPrice: '3.3333',
      subtotal: '10.00',
      notes: 'urgente',
      revision: 1,
    });
    expect(view.totalAmount).toBe('40.00');
    expect(s.requests.revisions).toHaveLength(0);
    expect(s.recorded[0]).toMatchObject({ changeType: 'add', before: null, lineNo: 3 });
    expect(view.branch).toBe('above_tolerance');
  });

  it('quitar guarda la revisión, deja la línea en removed y baja el total', async () => {
    const s = setup('in_approval');
    const view = await correctLine(
      CORRECTOR,
      {
        id: REQ,
        version: 3,
        reason: 'No se necesita',
        change: { type: 'remove', lineId: 'line-b' },
      },
      s.deps,
    );
    expect(view).toMatchObject({ totalAmount: '20.00', branch: 'within_tolerance' });
    expect(view.lines.find((l) => l.id === 'line-b')).toMatchObject({
      status: 'removed',
      revision: 2,
    });
    expect(s.requests.revisions[0]).toMatchObject({ requestLineId: 'line-b', revision: 1 });
    expect(s.recorded[0]).toMatchObject({ changeType: 'remove', after: null });
  });

  it('quitar la última línea vigente falla (last_line) y no escribe nada', async () => {
    const s = setup('in_approval');
    await correctLine(
      CORRECTOR,
      { id: REQ, version: 3, reason: 'x', change: { type: 'remove', lineId: 'line-b' } },
      s.deps,
    );
    await expect(
      correctLine(
        CORRECTOR,
        { id: REQ, version: 4, reason: 'x', change: { type: 'remove', lineId: 'line-a' } },
        s.deps,
      ),
    ).rejects.toMatchObject({ code: 'VALIDATION', reason: 'last_line' });
    expect(s.requests.get(REQ).request.version).toBe(4);
  });
});

describe('correctLine · validaciones', () => {
  it('sin requests.correct_line: 403 y no toca nada', async () => {
    const s = setup();
    const ctx = makeCtx({
      tenantId: TENANT,
      userId: WAREHOUSE_USER,
      permissions: ['requests.read_all'],
    });
    await expect(correctLine(ctx, update({ equipmentId: EQ }), s.deps)).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    expect(s.calls).toEqual([]);
  });

  it('el motivo es obligatorio', async () => {
    const s = setup();
    await expect(
      correctLine(CORRECTOR, { ...update({ equipmentId: EQ }), reason: '   ' }, s.deps),
    ).rejects.toMatchObject({ reason: 'correction_reason_required' });
    expect(s.calls).toEqual([]);
  });

  it('versión obsoleta: stale_version y no llama al motor', async () => {
    const s = setup();
    await expect(
      correctLine(CORRECTOR, { ...update({ equipmentId: EQ }), version: 2 }, s.deps),
    ).rejects.toMatchObject({ code: 'CONFLICT', reason: 'stale_version' });
    expect(s.calls).toEqual([]);
  });

  it.each(['draft', 'changes_requested', 'delivered', 'rejected', 'cancelled'] as const)(
    'en %s no se corrige (InvalidTransitionError)',
    async (status) => {
      const s = setup(status, {});
      await expect(
        correctLine(CORRECTOR, update({ equipmentId: EQ }), s.deps),
      ).rejects.toMatchObject({
        code: 'INVALID_TRANSITION',
        from: status,
        event: 'correct_line',
      });
      expect(s.calls).toEqual([]);
    },
  );

  it('un SOF de otro tenant es 404', async () => {
    const s = setup();
    const other = makeCtx({
      tenantId: '99999999-9999-4999-8999-999999999999',
      userId: WAREHOUSE_USER,
      permissions: ['requests.correct_line', 'requests.read_all'],
    });
    await expect(correctLine(other, update({ equipmentId: EQ }), s.deps)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('sin instancia de aprobación (approval_not_started): no escribe nada', async () => {
    const s = setup('in_approval', {
      error: new ConflictError({ reason: 'approval_not_started' }),
    });
    await expect(correctLine(CORRECTOR, update({ equipmentId: EQ }), s.deps)).rejects.toMatchObject(
      {
        reason: 'approval_not_started',
      },
    );
    expect(s.requests.revisions).toHaveLength(0);
    expect(s.requests.get(REQ).request.version).toBe(3);
  });

  it('una corrección sin cambios falla con line_unchanged', async () => {
    const s = setup();
    await expect(correctLine(CORRECTOR, update(), s.deps)).rejects.toMatchObject({
      reason: 'line_unchanged',
    });
    expect(s.requests.revisions).toHaveLength(0);
  });

  it('una línea inexistente es 404 line_not_found', async () => {
    const s = setup();
    await expect(
      correctLine(CORRECTOR, update({ lineId: 'zzz', equipmentId: EQ }), s.deps),
    ).rejects.toMatchObject({ code: 'NOT_FOUND', reason: 'line_not_found' });
  });

  it('solo revalida lo que cambió: un equipo ya inactivo que no se toca no bloquea la corrección', async () => {
    const s = setup();
    const view = await correctLine(CORRECTOR, update({ quantity: '1.000' }), s.deps);
    expect(view.lines.find((l) => l.id === 'line-a')?.equipmentId).toBe(EQ_OLD);
  });

  it('un equipo nuevo no disponible falla con equipment_not_available', async () => {
    const s = setup();
    await expect(
      correctLine(
        CORRECTOR,
        update({ equipmentId: '77777777-7777-4777-8777-777777777779' }),
        s.deps,
      ),
    ).rejects.toMatchObject({ code: 'VALIDATION', reason: 'equipment_not_available' });
  });

  it('un producto en otra moneda falla con product_currency_mismatch', async () => {
    const s = setup();
    await expect(
      correctLine(CORRECTOR, update({ productId: P_USD }), s.deps),
    ).rejects.toMatchObject({ reason: 'product_currency_mismatch' });
  });

  it('cambiar el producto toma código, nombre y unidad del catálogo y el precio enviado', async () => {
    const s = setup();
    const view = await correctLine(
      CORRECTOR,
      update({ productId: P2, unitPrice: '10.0000' }),
      s.deps,
    );
    expect(view.lines.find((l) => l.id === 'line-a')).toMatchObject({
      productId: P2,
      productCode: 'PER-2',
      description: 'Perno',
      unitPrice: '10.0000',
    });
    expect(s.recorded[0]?.changedFields).toEqual(['productId']);
  });

  it('un precio con más de 4 decimales falla con unit_price_invalid', async () => {
    const s = setup();
    await expect(
      correctLine(CORRECTOR, update({ quantity: '2.5', unitPrice: '10.12345' }), s.deps),
    ).rejects.toMatchObject({ code: 'VALIDATION', reason: 'unit_price_invalid' });
    expect(s.requests.revisions).toHaveLength(0);
  });
});
