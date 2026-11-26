// E4-H2 · decideRequest con repositorio y motor falsos (la base se prueba en integración).
import { makeCtx } from '@tests/support/ctx';
import { FixedClock } from '@tests/support/fakes/fixed-clock';
import { describe, expect, it } from 'vitest';

import type { AuditLog } from '@/modules/identity';
import { ConflictError } from '@/shared/errors';
import { UNKNOWN_CLIENT } from '@/shared/ports/client-info';

import type { DecisionKind, DecisionOutcome } from '../domain/decision';
import type { Request } from '../domain/request';
import type { RequestStatus } from '../domain/request-state-machine';

import { decideRequest } from './decide-request';
import type { DecideDeps, RequestRepository } from './ports';

const TENANT = '11111111-1111-4111-8111-111111111111';
const OWNER_ID = '22222222-2222-4222-8222-222222222222';
const APPROVER_ID = '33333333-3333-4333-8333-333333333333';
const REQ = '00000000-0000-4000-8000-000000000001';
const STEP = '44444444-4444-4444-8444-444444444444';
const NOW = new Date('2026-11-26T15:00:00.000Z');

const APPROVER = makeCtx({
  userId: APPROVER_ID,
  permissions: ['approvals.decide', 'requests.read_all'],
});

const request = (status: RequestStatus, overrides: Partial<Request> = {}): Request => ({
  id: REQ,
  tenantId: TENANT,
  docType: 'SOF',
  number: 'SOF-0001',
  status,
  requesterId: OWNER_ID,
  costCenterId: null,
  warehouseId: '88888888-8888-4888-8888-888888888881',
  equipmentId: null,
  reason: 'Mantenimiento',
  currency: 'PEN',
  totalAmount: '10.00',
  submittedAt: NOW,
  approvedAt: null,
  deliveredAt: null,
  closedAt: null,
  closedBy: null,
  closeComment: null,
  version: 3,
  createdAt: NOW,
  updatedAt: NOW,
  ...overrides,
});

function setup(initial: Request, engine: { outcome?: DecisionOutcome; error?: Error } = {}) {
  let current = initial;
  const patches: object[] = [];
  const decided: object[] = [];
  const cleared: string[] = [];
  const audit: Parameters<AuditLog['record']>[0][] = [];
  const requests = {
    lockById: (tenantId: string, id: string) =>
      Promise.resolve(
        current.tenantId === tenantId && current.id === id ? { request: current, lines: [] } : null,
      ),
    clearReconfirmation: (_t: string, id: string) => {
      cleared.push(id);
      return Promise.resolve();
    },
    updateHeader: (_t: string, _id: string, version: number, patch: object) => {
      if (version !== current.version) return Promise.reject(new Error('stale in fake'));
      patches.push(patch);
      current = { ...current, ...patch, version: version + 1 };
      return Promise.resolve(current);
    },
  } as unknown as RequestRepository;
  const deps: DecideDeps = {
    requests,
    assignments: {
      assignedRequestIds: () => Promise.resolve([]),
      isAssigned: () => Promise.resolve(true),
      pendingRequestIds: () => Promise.resolve([]),
      pendingStepId: () => Promise.resolve(null),
    },
    decider: {
      decide: (_ctx, input) => {
        decided.push(input);
        if (engine.error) return Promise.reject(engine.error);
        return Promise.resolve({ outcome: engine.outcome ?? 'approved' });
      },
    },
    audit: {
      record: (entry) => {
        audit.push(entry);
        return Promise.resolve();
      },
    },
    client: UNKNOWN_CLIENT,
    clock: new FixedClock(NOW),
  };
  return { deps, patches, decided, audit, cleared };
}

interface InputOverrides {
  version?: number;
  decision?: DecisionKind;
  comment?: string | null;
}

const input = (overrides: InputOverrides = {}) => ({
  id: REQ,
  version: 3,
  stepId: STEP,
  decision: 'approve' as DecisionKind,
  comment: null as string | null,
  ...overrides,
});

describe('decideRequest', () => {
  it('aprobar el último paso: approved con approved_at, versión +1 y auditoría', async () => {
    const s = setup(request('in_approval'), { outcome: 'approved' });
    const view = await decideRequest(APPROVER, input({ comment: ' Conforme ' }), s.deps);

    expect(view).toMatchObject({
      status: 'approved',
      approvedAt: NOW.toISOString(),
      closedAt: null,
      version: 4,
      outcome: 'approved',
    });
    expect(s.decided).toEqual([
      { requestId: REQ, stepId: STEP, kind: 'approve', comment: 'Conforme' },
    ]);
    // Al aprobar el último paso, ninguna línea queda pendiente de reconfirmar (E4-H4).
    expect(s.cleared).toEqual([REQ]);
    expect(s.audit).toHaveLength(1);
    expect(s.audit[0]).toMatchObject({
      action: 'request.decided',
      entityId: REQ,
      data: {
        decision: 'approve',
        outcome: 'approved',
        fromStatus: 'in_approval',
        toStatus: 'approved',
        comment: 'Conforme',
      },
    });
  });

  it.each(['partial', 'advanced'] as const)(
    'una aprobación %s deja el estado en in_approval y sube la versión',
    async (outcome) => {
      const s = setup(request('in_approval'), { outcome });
      const view = await decideRequest(APPROVER, input(), s.deps);
      expect(view).toMatchObject({ status: 'in_approval', version: 4, outcome, approvedAt: null });
      expect(s.patches).toEqual([{ status: 'in_approval' }]);
      expect(s.cleared).toEqual([]);
    },
  );

  it('rechazar cierra con closed_at (sin closed_by) y exige comentario', async () => {
    const s = setup(request('in_approval'), { outcome: 'rejected' });
    await expect(
      decideRequest(APPROVER, input({ decision: 'reject' }), s.deps),
    ).rejects.toMatchObject({ code: 'VALIDATION', reason: 'decision_comment_required' });
    expect(s.decided).toEqual([]);

    const view = await decideRequest(
      APPROVER,
      input({ decision: 'reject', comment: 'No corresponde' }),
      s.deps,
    );
    expect(view).toMatchObject({
      status: 'rejected',
      closedAt: NOW.toISOString(),
      closedBy: null,
      closeComment: null,
    });
  });

  it('pedir cambios deja changes_requested y exige comentario', async () => {
    const s = setup(request('in_approval'), { outcome: 'changes_requested' });
    await expect(
      decideRequest(APPROVER, input({ decision: 'request_changes', comment: '  ' }), s.deps),
    ).rejects.toMatchObject({ reason: 'decision_comment_required' });
    const view = await decideRequest(
      APPROVER,
      input({ decision: 'request_changes', comment: 'Falta el equipo' }),
      s.deps,
    );
    expect(view).toMatchObject({ status: 'changes_requested', version: 4 });
  });

  it('sin approvals.decide: 403 y no toca nada', async () => {
    const s = setup(request('in_approval'));
    const ctx = makeCtx({ userId: APPROVER_ID, permissions: ['requests.read_all'] });
    await expect(decideRequest(ctx, input(), s.deps)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(s.decided).toEqual([]);
  });

  it('el solicitante no decide su propia solicitud (own_request)', async () => {
    const s = setup(request('in_approval'));
    const ctx = makeCtx({
      userId: OWNER_ID,
      permissions: ['approvals.decide', 'requests.read_own'],
    });
    await expect(decideRequest(ctx, input(), s.deps)).rejects.toMatchObject({
      code: 'FORBIDDEN',
      reason: 'own_request',
    });
    expect(s.decided).toEqual([]);
  });

  it('una solicitud que no ve (borrador ajeno, otro tenant) es 404', async () => {
    const draft = setup(request('draft', { number: null, submittedAt: null }));
    await expect(decideRequest(APPROVER, input(), draft.deps)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    const otherTenant = makeCtx({
      tenantId: '99999999-9999-4999-8999-999999999999',
      userId: APPROVER_ID,
      permissions: ['approvals.decide', 'requests.read_all'],
    });
    const s = setup(request('in_approval'));
    await expect(decideRequest(otherTenant, input(), s.deps)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('el error del motor (step_already_decided) sale antes de revisar la versión', async () => {
    const s = setup(request('in_approval'), {
      error: new ConflictError({ reason: 'step_already_decided' }),
    });
    await expect(decideRequest(APPROVER, input({ version: 1 }), s.deps)).rejects.toMatchObject({
      code: 'CONFLICT',
      reason: 'step_already_decided',
    });
    expect(s.patches).toEqual([]);
  });

  it('versión obsoleta tras el motor: stale_version y no actualiza', async () => {
    const s = setup(request('in_approval'), { outcome: 'partial' });
    await expect(decideRequest(APPROVER, input({ version: 2 }), s.deps)).rejects.toMatchObject({
      code: 'CONFLICT',
      reason: 'stale_version',
    });
    expect(s.patches).toEqual([]);
  });

  it('un documento que ya no está en aprobación: INVALID_TRANSITION', async () => {
    const s = setup(request('cancelled'), { outcome: 'approved' });
    await expect(decideRequest(APPROVER, input(), s.deps)).rejects.toMatchObject({
      code: 'INVALID_TRANSITION',
    });
  });
});
