// E3-H1 · Casos de uso de requests con repositorios en memoria (la base se prueba en integración).
import { makeCtx } from '@tests/support/ctx';
import { FixedClock } from '@tests/support/fakes/fixed-clock';
import { describe, expect, it } from 'vitest';

import type { AuditLog } from '@/modules/identity';
import { ForbiddenError, NotFoundError } from '@/shared/errors';
import { UNKNOWN_CLIENT } from '@/shared/ports/client-info';

import type { SequenceState } from '../domain/numbering';
import type { Request, RequestLine } from '../domain/request';

import { createDraft } from './create-draft';
import { getDocumentSequence } from './get-document-sequence';
import { getRequest } from './get-request';
import type {
  ApprovalAssignments,
  ApprovalStarter,
  CatalogLookup,
  CatalogProduct,
  HeaderInsert,
  LineInsert,
  RequestRepository,
  RequestWithLines,
  SequenceRepository,
  SubmitDeps,
} from './ports';
import { submitRequest } from './submit-request';
import { updateDocumentSequence } from './update-document-sequence';
import { updateDraft } from './update-draft';

const ME = makeCtx({ permissions: ['requests.create', 'requests.read_own'] });
const OTHER = makeCtx({
  userId: '33333333-3333-4333-8333-333333333333',
  permissions: ['requests.create', 'requests.read_own'],
});
const READER = makeCtx({
  userId: '44444444-4444-4444-8444-444444444444',
  permissions: ['requests.read_all'],
});
const SETTINGS = makeCtx({ permissions: ['settings.manage'] });

const P1 = '55555555-5555-4555-8555-555555555551';
const P2 = '55555555-5555-4555-8555-555555555552';
const P_NO_PRICE = '55555555-5555-4555-8555-555555555553';
const P_USD = '55555555-5555-4555-8555-555555555554';
const P_GONE = '55555555-5555-4555-8555-555555555559';
const CC = '66666666-6666-4666-8666-666666666661';
const EQ = '77777777-7777-4777-8777-777777777771';
const WAREHOUSE = '88888888-8888-4888-8888-888888888881';

const PRODUCTS: CatalogProduct[] = [
  {
    id: P1,
    code: 'FIL-1',
    name: 'Filtro',
    unit: 'UND',
    referencePrice: '12.5000',
    currency: 'PEN',
  },
  {
    id: P2,
    code: 'PER-2',
    name: 'Perno',
    unit: 'UND',
    referencePrice: '3.3333',
    currency: 'PEN',
  },
  {
    id: P_NO_PRICE,
    code: 'SIN-3',
    name: 'Sin precio',
    unit: 'UND',
    referencePrice: null,
    currency: null,
  },
  {
    id: P_USD,
    code: 'USD-4',
    name: 'Importado',
    unit: 'UND',
    referencePrice: '10.0000',
    currency: 'USD',
  },
];

function memoryRequests(): RequestRepository & { store: Map<string, RequestWithLines> } {
  const store = new Map<string, RequestWithLines>();
  let counter = 0;
  const toLine = (line: LineInsert, n: number): RequestLine => ({
    id: `line-${++counter}-${n}`,
    lineNo: line.lineNo,
    productId: line.productId,
    productCode: line.productCode,
    description: line.description,
    unit: line.unit,
    equipmentId: line.equipmentId,
    quantity: line.quantity,
    unitPrice: line.unitPrice,
    subtotal: line.subtotal,
    notes: line.notes,
    status: 'active',
    revision: 1,
    needsReconfirmation: false,
  });
  return {
    store,
    create(header: HeaderInsert, lines) {
      counter += 1;
      const now = new Date('2026-11-25T10:00:00.000Z');
      const request: Request = {
        id: `00000000-0000-4000-8000-${String(counter).padStart(12, '0')}`,
        tenantId: header.tenantId,
        docType: 'SOF',
        number: null,
        status: 'draft',
        requesterId: header.requesterId,
        costCenterId: header.costCenterId,
        warehouseId: header.warehouseId,
        equipmentId: header.equipmentId,
        reason: header.reason,
        currency: header.currency,
        totalAmount: header.totalAmount,
        submittedAt: null,
        approvedAt: null,
        deliveredAt: null,
        closedAt: null,
        version: 1,
        createdAt: now,
        updatedAt: now,
      };
      const created = { request, lines: lines.map(toLine) };
      store.set(request.id, created);
      return Promise.resolve(created);
    },
    find(tenantId, id) {
      const found = store.get(id);
      return Promise.resolve(found && found.request.tenantId === tenantId ? found : null);
    },
    lockById(tenantId, id) {
      const found = store.get(id);
      return Promise.resolve(found && found.request.tenantId === tenantId ? found : null);
    },
    replaceLines(_tenantId, requestId, lines) {
      const found = store.get(requestId);
      if (!found) throw new Error('missing');
      const next = lines.map(toLine);
      store.set(requestId, { request: found.request, lines: next });
      return Promise.resolve(next);
    },
    updateHeader(_tenantId, id, expectedVersion, patch) {
      const found = store.get(id);
      if (found?.request.version !== expectedVersion) {
        return Promise.reject(new Error('stale in fake'));
      }
      const request: Request = {
        ...found.request,
        ...(patch.costCenterId !== undefined ? { costCenterId: patch.costCenterId } : {}),
        ...(patch.equipmentId !== undefined ? { equipmentId: patch.equipmentId } : {}),
        ...(patch.reason !== undefined ? { reason: patch.reason } : {}),
        ...(patch.totalAmount !== undefined ? { totalAmount: patch.totalAmount } : {}),
        ...(patch.status !== undefined ? { status: patch.status } : {}),
        ...(patch.number !== undefined ? { number: patch.number } : {}),
        ...(patch.submittedAt !== undefined ? { submittedAt: patch.submittedAt } : {}),
        version: found.request.version + 1,
      };
      store.set(id, { request, lines: found.lines });
      return Promise.resolve(request);
    },
  };
}

function memorySequences(initial: SequenceState): SequenceRepository & { state: SequenceState } {
  const repo = {
    state: initial,
    find: () => Promise.resolve(repo.state),
    lockForUpdate: () => Promise.resolve(repo.state),
    update(_t: string, _d: string, patch: Partial<SequenceState>) {
      repo.state = { ...repo.state, ...patch };
      return Promise.resolve();
    },
  };
  return repo;
}

function setup(
  options: {
    approvals?: ApprovalStarter;
    /** Solicitudes asignadas al aprobador del ctx. */
    assigned?: string[];
    costCenters?: string[];
    products?: { current: CatalogProduct[] };
  } = {},
) {
  const products = options.products ?? { current: PRODUCTS };
  const audit: Parameters<AuditLog['record']>[0][] = [];
  const requests = memoryRequests();
  const sequences = memorySequences({
    prefix: 'SOF-',
    nextNumber: 143,
    padding: 4,
    lastIssuedNumber: null,
  });
  const catalog: CatalogLookup = {
    refs: (_ctx, ids) =>
      Promise.resolve({
        products: products.current.filter((p) => ids.productIds.includes(p.id)),
        equipmentIds: ids.equipmentIds.filter((id) => id === EQ),
        costCenterIds: ids.costCenterIds.filter((id) => (options.costCenters ?? [CC]).includes(id)),
      }),
    defaultWarehouseId: () => Promise.resolve(WAREHOUSE),
  };
  const started: string[] = [];
  const assignments: ApprovalAssignments = {
    assignedRequestIds: () => Promise.resolve(options.assigned ?? []),
    pendingRequestIds: () => Promise.resolve(options.assigned ?? []),
  };
  const deps: SubmitDeps & { sequences: typeof sequences; assignments: ApprovalAssignments } = {
    assignments,
    requests,
    sequences,
    catalog,
    currency: { currencyOf: () => Promise.resolve('PEN') },
    approvals: options.approvals ?? {
      start: (_ctx, input) => {
        started.push(input.requestId);
        return Promise.resolve();
      },
    },
    audit: {
      record: (entry) => {
        audit.push(entry);
        return Promise.resolve();
      },
    },
    client: UNKNOWN_CLIENT,
    clock: new FixedClock(new Date('2026-11-25T15:00:00.000Z')),
  };
  return { deps, requests, sequences, audit, started };
}

const DRAFT = {
  costCenterId: CC,
  equipmentId: null,
  reason: 'Mantenimiento de la grúa',
  lines: [
    { productId: P1, quantity: '2.000', equipmentId: EQ, notes: null },
    { productId: P2, quantity: '2.500', equipmentId: null, notes: ' urgente ' },
  ],
};

describe('createDraft', () => {
  it('calcula subtotales y total en el servidor con HALF_UP y no consume número', async () => {
    const s = setup();

    const view = await createDraft(ME, DRAFT, s.deps);

    // 2 × 12.50 = 25.00; 2.5 × 3.3333 = 8.33325 → 8.33.
    expect(view.lines.map((l) => l.subtotal)).toEqual(['25.00', '8.33']);
    expect(view.totalAmount).toBe('33.33');
    expect(view).toMatchObject({
      status: 'draft',
      number: null,
      version: 1,
      currency: 'PEN',
      warehouseId: WAREHOUSE,
      requesterId: ME.userId,
    });
    expect(view.lines[1]).toMatchObject({
      notes: 'urgente',
      unitPrice: '3.3333',
      productCode: 'PER-2',
    });
    expect(s.sequences.state.nextNumber).toBe(143);
    expect(s.audit.map((a) => a.action)).toEqual(['request.created']);
  });

  it('un producto sin precio entra con precio 0 (G4)', async () => {
    const s = setup();

    const view = await createDraft(
      ME,
      {
        ...DRAFT,
        lines: [{ productId: P_NO_PRICE, quantity: '4', equipmentId: null, notes: null }],
      },
      s.deps,
    );

    expect(view.lines[0]).toMatchObject({ unitPrice: '0.0000', subtotal: '0.00' });
    expect(view.totalAmount).toBe('0.00');
  });

  it('rechaza un producto en otra moneda (G3), uno inexistente y una cantidad inválida', async () => {
    const s = setup();
    const lines = [
      { productId: P_USD, quantity: '1', equipmentId: null, notes: null },
      { productId: P_GONE, quantity: '1', equipmentId: null, notes: null },
      { productId: P1, quantity: '0', equipmentId: null, notes: null },
    ];

    const error = await createDraft(ME, { ...DRAFT, lines }, s.deps).catch((e: unknown) => e);

    expect(error).toMatchObject({
      code: 'VALIDATION',
      fieldErrors: {
        'lines.0.productId': ['product_currency_mismatch'],
        'lines.1.productId': ['product_not_available'],
        'lines.2.quantity': ['quantity_invalid'],
      },
    });
    expect(s.requests.store.size).toBe(0);
  });

  it('rechaza un centro de costo inactivo o de otro tenant', async () => {
    const s = setup({ costCenters: [] });

    await expect(createDraft(ME, DRAFT, s.deps)).rejects.toMatchObject({
      code: 'VALIDATION',
      fieldErrors: { costCenterId: ['cost_center_not_available'] },
    });
  });

  it('acepta un borrador vacío (sin líneas, centro ni motivo)', async () => {
    const s = setup();

    const view = await createDraft(
      ME,
      { costCenterId: null, equipmentId: null, reason: '  ', lines: [] },
      s.deps,
    );

    expect(view).toMatchObject({ reason: null, totalAmount: '0.00', lines: [] });
  });

  it('exige requests.create', async () => {
    const s = setup();

    await expect(createDraft(READER, DRAFT, s.deps)).rejects.toThrow(ForbiddenError);
  });
});

describe('updateDraft', () => {
  it('reemplaza líneas, recalcula el total y sube la versión', async () => {
    const s = setup();
    const draft = await createDraft(ME, DRAFT, s.deps);

    const updated = await updateDraft(
      ME,
      {
        id: draft.id,
        version: draft.version,
        costCenterId: CC,
        equipmentId: null,
        reason: 'Otro motivo',
        lines: [{ productId: P1, quantity: '1', equipmentId: null, notes: null }],
      },
      s.deps,
    );

    expect(updated).toMatchObject({ version: 2, totalAmount: '12.50', reason: 'Otro motivo' });
    expect(updated.lines.map((l) => l.lineNo)).toEqual([1]);
    expect(s.audit.map((a) => a.action)).toEqual(['request.created', 'request.updated']);
  });

  it('versión obsoleta → ConflictError stale_version', async () => {
    const s = setup();
    const draft = await createDraft(ME, DRAFT, s.deps);

    await expect(
      updateDraft(ME, { ...DRAFT, id: draft.id, version: 7 }, s.deps),
    ).rejects.toMatchObject({ code: 'CONFLICT', reason: 'stale_version' });
  });

  it('el borrador de otro usuario es 404 (no 403)', async () => {
    const s = setup();
    const draft = await createDraft(ME, DRAFT, s.deps);

    await expect(
      updateDraft(OTHER, { ...DRAFT, id: draft.id, version: 1 }, s.deps),
    ).rejects.toThrow(NotFoundError);
  });

  it('un SOF enviado ya no se edita (InvalidTransitionError)', async () => {
    const s = setup();
    const draft = await createDraft(ME, DRAFT, s.deps);
    const sent = await submitRequest(ME, { id: draft.id, version: 1 }, s.deps);

    await expect(
      updateDraft(ME, { ...DRAFT, id: sent.id, version: sent.version }, s.deps),
    ).rejects.toMatchObject({ code: 'INVALID_TRANSITION', from: 'in_approval', event: 'edit' });
  });
});

describe('submitRequest', () => {
  it('asigna el número, pasa a in_approval, congela precios y avanza la secuencia', async () => {
    const s = setup();
    const draft = await createDraft(ME, DRAFT, s.deps);

    const sent = await submitRequest(ME, { id: draft.id, version: draft.version }, s.deps);

    expect(sent).toMatchObject({
      status: 'in_approval',
      number: 'SOF-0143',
      version: 2,
      totalAmount: '33.33',
      submittedAt: '2026-11-25T15:00:00.000Z',
    });
    expect(s.sequences.state).toMatchObject({ nextNumber: 144, lastIssuedNumber: 143 });
    expect(s.started).toEqual([draft.id]);
    expect(s.audit.map((a) => a.action)).toEqual(['request.created', 'request.submitted']);
  });

  it('al enviar los precios del borrador quedan congelados y los ids de línea no cambian', async () => {
    const catalog = { current: PRODUCTS };
    const s = setup({ products: catalog });
    const draft = await createDraft(ME, DRAFT, s.deps);
    catalog.current = PRODUCTS.map((p) => (p.id === P1 ? { ...p, referencePrice: '99.0000' } : p));

    const sent = await submitRequest(ME, { id: draft.id, version: draft.version }, s.deps);

    expect(sent.lines.map((l) => l.id)).toEqual(draft.lines.map((l) => l.id));
    expect(sent.lines.map((l) => l.unitPrice)).toEqual(['12.5000', '3.3333']);
    expect(sent.totalAmount).toBe('33.33');
  });

  it('recalcula el total desde las líneas guardadas si el guardado difiere', async () => {
    const s = setup();
    const draft = await createDraft(ME, DRAFT, s.deps);
    const stored = s.requests.store.get(draft.id);
    if (!stored) throw new Error('missing');
    s.requests.store.set(draft.id, {
      request: { ...stored.request, totalAmount: '1.00' },
      lines: stored.lines,
    });

    const sent = await submitRequest(ME, { id: draft.id, version: draft.version }, s.deps);

    expect(sent.totalAmount).toBe('33.33');
  });

  it.each([
    ['el producto ya no está activo', (p: CatalogProduct) => p.id !== P1, 'product_not_available'],
    ['el producto cambió de moneda', null, 'product_currency_mismatch'],
  ])('%s → ValidationError en lines.0.productId y no consume número', async (_n, keep, reason) => {
    const catalog = { current: PRODUCTS };
    const s = setup({ products: catalog });
    const draft = await createDraft(ME, DRAFT, s.deps);
    catalog.current = keep
      ? PRODUCTS.filter(keep)
      : PRODUCTS.map((p) => (p.id === P1 ? { ...p, currency: 'USD' as const } : p));

    await expect(
      submitRequest(ME, { id: draft.id, version: draft.version }, s.deps),
    ).rejects.toMatchObject({ code: 'VALIDATION', fieldErrors: { 'lines.0.productId': [reason] } });
    expect(s.sequences.state.nextNumber).toBe(143);
  });

  it('el siguiente envío recibe el siguiente número', async () => {
    const s = setup();
    const first = await createDraft(ME, DRAFT, s.deps);
    const second = await createDraft(ME, DRAFT, s.deps);

    const a = await submitRequest(ME, { id: first.id, version: 1 }, s.deps);
    const b = await submitRequest(ME, { id: second.id, version: 1 }, s.deps);

    expect([a.number, b.number]).toEqual(['SOF-0143', 'SOF-0144']);
  });

  it.each([
    ['sin centro de costo', { ...DRAFT, costCenterId: null }, 'costCenterId'],
    ['sin motivo', { ...DRAFT, reason: null }, 'reason'],
    ['sin líneas', { ...DRAFT, lines: [] }, 'lines'],
  ])('%s → request_incomplete y no consume número', async (_name, input, field) => {
    const s = setup();
    const draft = await createDraft(ME, input, s.deps);

    await expect(
      submitRequest(ME, { id: draft.id, version: draft.version }, s.deps),
    ).rejects.toMatchObject({
      code: 'VALIDATION',
      reason: 'request_incomplete',
      fieldErrors: { [field]: ['request_incomplete'] },
    });
    expect(s.sequences.state.nextNumber).toBe(143);
  });

  it('versión obsoleta → stale_version', async () => {
    const s = setup();
    const draft = await createDraft(ME, DRAFT, s.deps);

    await expect(submitRequest(ME, { id: draft.id, version: 3 }, s.deps)).rejects.toMatchObject({
      reason: 'stale_version',
    });
  });

  it('enviar dos veces → InvalidTransitionError con from y event', async () => {
    const s = setup();
    const draft = await createDraft(ME, DRAFT, s.deps);
    await submitRequest(ME, { id: draft.id, version: 1 }, s.deps);

    await expect(submitRequest(ME, { id: draft.id, version: 2 }, s.deps)).rejects.toMatchObject({
      code: 'INVALID_TRANSITION',
      from: 'in_approval',
      event: 'submit',
    });
  });

  it('el borrador de otro usuario es 404', async () => {
    const s = setup();
    const draft = await createDraft(ME, DRAFT, s.deps);

    await expect(submitRequest(OTHER, { id: draft.id, version: 1 }, s.deps)).rejects.toThrow(
      NotFoundError,
    );
  });

  it('si el arranque de la aprobación falla, el error sale (la transacción real revierte todo)', async () => {
    const s = setup({
      approvals: { start: () => Promise.reject(new Error('approvals down')) },
    });
    const draft = await createDraft(ME, DRAFT, s.deps);

    await expect(submitRequest(ME, { id: draft.id, version: 1 }, s.deps)).rejects.toThrow(
      'approvals down',
    );
  });
});

describe('getRequest', () => {
  it('el solicitante ve su borrador; otro con read_all no (404)', async () => {
    const s = setup();
    const draft = await createDraft(ME, DRAFT, s.deps);

    expect((await getRequest(ME, { id: draft.id }, s.deps)).id).toBe(draft.id);
    await expect(getRequest(READER, { id: draft.id }, s.deps)).rejects.toThrow(NotFoundError);
    await expect(getRequest(OTHER, { id: draft.id }, s.deps)).rejects.toThrow(NotFoundError);
  });

  it('un SOF enviado lo ve quien tiene requests.read_all', async () => {
    const s = setup();
    const draft = await createDraft(ME, DRAFT, s.deps);
    await submitRequest(ME, { id: draft.id, version: 1 }, s.deps);

    expect((await getRequest(READER, { id: draft.id }, s.deps)).number).toBe('SOF-0143');
    await expect(getRequest(OTHER, { id: draft.id }, s.deps)).rejects.toThrow(NotFoundError);
  });

  it('el aprobador asignado ve lo enviado, pero nunca un borrador', async () => {
    const approver = makeCtx({
      userId: '99999999-0000-4000-8000-000000000001',
      permissions: ['requests.read_own', 'approvals.decide'],
    });
    const assigned: string[] = [];
    const s = setup({ assigned });
    const draft = await createDraft(ME, DRAFT, s.deps);
    assigned.push(draft.id);

    await expect(getRequest(approver, { id: draft.id }, s.deps)).rejects.toThrow(NotFoundError);
    await submitRequest(ME, { id: draft.id, version: 1 }, s.deps);
    expect((await getRequest(approver, { id: draft.id }, s.deps)).number).toBe('SOF-0143');
    assigned.length = 0;
    await expect(getRequest(approver, { id: draft.id }, s.deps)).rejects.toThrow(NotFoundError);
  });

  it('un id inexistente es 404 y sin ningún permiso de lectura es 403', async () => {
    const s = setup();

    await expect(
      getRequest(ME, { id: '99999999-9999-4999-8999-999999999999' }, s.deps),
    ).rejects.toThrow(NotFoundError);
    await expect(
      getRequest(makeCtx({ permissions: ['approvals.decide'] }), { id: 'x' }, s.deps),
    ).rejects.toThrow(ForbiddenError);
  });
});

describe('secuencia de numeración', () => {
  const sequenceDeps = () => {
    const s = setup();
    s.sequences.state = { prefix: 'SOF-', nextNumber: 144, padding: 4, lastIssuedNumber: 143 };
    return { s, deps: { sequences: s.sequences, audit: s.deps.audit, client: UNKNOWN_CLIENT } };
  };

  it('getDocumentSequence devuelve la vista previa del próximo número', async () => {
    const { deps } = sequenceDeps();

    expect(await getDocumentSequence(SETTINGS, deps)).toMatchObject({
      prefix: 'SOF-',
      nextNumber: 144,
      lastIssuedNumber: 143,
      preview: 'SOF-0144',
    });
  });

  it('exige settings.manage', async () => {
    const { deps } = sequenceDeps();

    await expect(getDocumentSequence(ME, deps)).rejects.toThrow(ForbiddenError);
    await expect(
      updateDocumentSequence(ME, { prefix: 'X-', nextNumber: 500 }, deps),
    ).rejects.toThrow(ForbiddenError);
  });

  it('cambia prefijo y siguiente número y audita lo que cambió', async () => {
    const { s, deps } = sequenceDeps();

    const result = await updateDocumentSequence(
      SETTINGS,
      { prefix: ' gr- ', nextNumber: 500 },
      deps,
    );

    expect(result.changed).toBe(true);
    expect(result.sequence).toMatchObject({ prefix: 'GR-', nextNumber: 500, preview: 'GR-0500' });
    expect(s.sequences.state).toMatchObject({
      prefix: 'GR-',
      nextNumber: 500,
      lastIssuedNumber: 143,
    });
    expect(s.audit.at(-1)).toMatchObject({
      action: 'document_sequence.updated',
      data: {
        changes: {
          prefix: { from: 'SOF-', to: 'GR-' },
          nextNumber: { from: 144, to: 500 },
        },
      },
    });
  });

  it('no puede quedar por debajo (ni igual) al último emitido', async () => {
    const { s, deps } = sequenceDeps();

    for (const nextNumber of [143, 100, 1]) {
      await expect(
        updateDocumentSequence(SETTINGS, { prefix: 'SOF-', nextNumber }, deps),
      ).rejects.toMatchObject({
        code: 'VALIDATION',
        reason: 'sequence_below_last_used',
        params: { last: 143 },
        fieldErrors: { sequenceNextNumber: ['sequence_below_last_used'] },
      });
    }
    expect(s.sequences.state.nextNumber).toBe(144);
  });

  it('sin cambios no escribe ni audita', async () => {
    const { s, deps } = sequenceDeps();
    const before = s.audit.length;

    const result = await updateDocumentSequence(
      SETTINGS,
      { prefix: 'SOF-', nextNumber: 144 },
      deps,
    );

    expect(result.changed).toBe(false);
    expect(s.audit).toHaveLength(before);
  });
});
