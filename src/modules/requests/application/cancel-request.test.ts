// E3-H5 · cancelRequest con repositorio en memoria (la base se prueba en integración).
import { makeCtx } from '@tests/support/ctx';
import { FixedClock } from '@tests/support/fakes/fixed-clock';
import { describe, expect, it } from 'vitest';

import type { AuditLog } from '@/modules/identity';
import type { Ctx } from '@/shared/context';
import { ConflictError, ForbiddenError, NotFoundError } from '@/shared/errors';
import { UNKNOWN_CLIENT } from '@/shared/ports/client-info';

import type { Request } from '../domain/request';
import type { RequestStatus } from '../domain/request-state-machine';

import { cancelRequest } from './cancel-request';
import type { CancelDeps, RequestRepository } from './ports';

const TENANT = '11111111-1111-4111-8111-111111111111';
const OWNER_ID = '22222222-2222-4222-8222-222222222222';
const OTHER_ID = '33333333-3333-4333-8333-333333333333';
const REQ = '00000000-0000-4000-8000-000000000001';
const NOW = new Date('2026-11-26T15:00:00.000Z');

const OWNER = makeCtx({ userId: OWNER_ID, permissions: ['requests.create', 'requests.read_own'] });
const ADMIN = makeCtx({
  userId: OTHER_ID,
  permissions: ['requests.create', 'requests.read_all', 'requests.cancel_any'],
});
const READER = makeCtx({ userId: OTHER_ID, permissions: ['requests.read_all'] });
const NOBODY = makeCtx({ userId: OTHER_ID, permissions: ['settings.manage'] });
const STRANGER = makeCtx({
  userId: OTHER_ID,
  permissions: ['requests.create', 'requests.read_own'],
});

const request = (status: RequestStatus, overrides: Partial<Request> = {}): Request => ({
  id: REQ,
  tenantId: TENANT,
  docType: 'SOF',
  number: status === 'draft' ? null : 'SOF-0001',
  status,
  requesterId: OWNER_ID,
  costCenterId: null,
  warehouseId: '88888888-8888-4888-8888-888888888881',
  equipmentId: null,
  reason: 'Mantenimiento',
  currency: 'PEN',
  totalAmount: '0.00',
  submittedAt: status === 'draft' ? null : NOW,
  approvedAt: null,
  deliveredAt: null,
  closedAt: null,
  closedBy: null,
  closeComment: null,
  version: 4,
  createdAt: NOW,
  updatedAt: NOW,
  ...overrides,
});

function setup(initial: Request, options: { assigned?: boolean; failCanceller?: boolean } = {}) {
  let current = initial;
  const updates: unknown[] = [];
  const audit: Parameters<AuditLog['record']>[0][] = [];
  const cancelled: { requestId: string; comment: string }[] = [];
  const cleared: string[] = [];
  const requests = {
    clearReconfirmation: (_t: string, id: string) => {
      cleared.push(id);
      return Promise.resolve();
    },
    lockById: (tenantId: string, id: string) =>
      Promise.resolve(
        current.tenantId === tenantId && current.id === id ? { request: current, lines: [] } : null,
      ),
    updateHeader: (_t: string, _id: string, version: number, patch: object) => {
      if (version !== current.version) return Promise.reject(new Error('stale in fake'));
      updates.push(patch);
      current = { ...current, ...patch, version: version + 1 };
      return Promise.resolve(current);
    },
  } as unknown as RequestRepository;
  const deps: CancelDeps = {
    requests,
    assignments: {
      assignedRequestIds: () => Promise.resolve([]),
      isAssigned: () => Promise.resolve(options.assigned ?? false),
      pendingRequestIds: () => Promise.resolve([]),
      pendingStepId: () => Promise.resolve(null),
    },
    canceller: {
      cancel: (_ctx, input) => {
        if (options.failCanceller) return Promise.reject(new Error('approvals down'));
        cancelled.push(input);
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
    clock: new FixedClock(NOW),
  };
  return { deps, updates, audit, cancelled, cleared, current: () => current };
}

const input = (overrides: Partial<{ version: number; comment: string }> = {}) => ({
  id: REQ,
  version: 4,
  comment: 'Se duplicó el pedido',
  ...overrides,
});

describe('cancelRequest', () => {
  it.each(['draft', 'in_approval', 'changes_requested'] as const)(
    'el dueño anula desde %s: estado, cierre, puerto y auditoría',
    async (status) => {
      const s = setup(request(status));

      const view = await cancelRequest(OWNER, input({ comment: '  Duplicada  ' }), s.deps);

      expect(view).toMatchObject({
        status: 'cancelled',
        closedAt: NOW.toISOString(),
        closedBy: OWNER_ID,
        closeComment: 'Duplicada',
        version: 5,
      });
      expect(s.cancelled).toEqual([{ requestId: REQ, comment: 'Duplicada' }]);
      // Anular deja las líneas sin marca de reconfirmación (E4-H4).
      expect(s.cleared).toEqual([REQ]);
      expect(s.audit).toEqual([
        expect.objectContaining({
          action: 'request.cancelled',
          entityType: 'request',
          entityId: REQ,
          data: {
            number: status === 'draft' ? null : 'SOF-0001',
            fromStatus: status,
            comment: 'Duplicada',
          },
        }),
      ]);
    },
  );

  it('quien tiene cancel_any anula una aprobada', async () => {
    const s = setup(request('approved'));

    const view = await cancelRequest(ADMIN, input(), s.deps);

    expect(view).toMatchObject({ status: 'cancelled', closedBy: OTHER_ID });
  });

  it('el dueño no anula una aprobada: Forbidden cancel_not_allowed y no toca nada', async () => {
    const s = setup(request('approved'));

    await expect(cancelRequest(OWNER, input(), s.deps)).rejects.toMatchObject({
      constructor: ForbiddenError,
      reason: 'cancel_not_allowed',
    });
    expect(s.updates).toEqual([]);
    expect(s.cancelled).toEqual([]);
    expect(s.audit).toEqual([]);
  });

  it('un lector con solo read_all no puede anular (falta requests.create o cancel_any)', async () => {
    const s = setup(request('in_approval'));
    await expect(cancelRequest(READER, input(), s.deps)).rejects.toThrow(ForbiddenError);
  });

  it('sin requests.create ni cancel_any: Forbidden sin tocar nada', async () => {
    const s = setup(request('in_approval'));
    await expect(cancelRequest(NOBODY, input(), s.deps)).rejects.toThrow(ForbiddenError);
    expect(s.updates).toEqual([]);
  });

  it('el dueño ajeno no ve el borrador: 404; ni siquiera con cancel_any', async () => {
    const s = setup(request('draft'));
    await expect(cancelRequest(STRANGER, input(), s.deps)).rejects.toThrow(NotFoundError);
    await expect(cancelRequest(ADMIN, input(), s.deps)).rejects.toThrow(NotFoundError);
  });

  it('otro solicitante sin acceso a un documento enviado: 404', async () => {
    const s = setup(request('in_approval'));
    await expect(cancelRequest(STRANGER, input(), s.deps)).rejects.toThrow(NotFoundError);
  });

  it('el aprobador asignado lo ve pero no lo anula: Forbidden', async () => {
    const s = setup(request('in_approval'), { assigned: true });
    await expect(cancelRequest(STRANGER, input(), s.deps)).rejects.toThrow(ForbiddenError);
  });

  it('un estado final: InvalidTransition antes que Forbidden', async () => {
    const s = setup(request('delivered'), { assigned: true });
    await expect(cancelRequest(STRANGER, input(), s.deps)).rejects.toMatchObject({
      code: 'INVALID_TRANSITION',
    });
  });

  it('la versión vieja lanza stale_version, después de los permisos', async () => {
    const s = setup(request('in_approval'));
    await expect(cancelRequest(OWNER, input({ version: 3 }), s.deps)).rejects.toMatchObject({
      constructor: ConflictError,
      reason: 'stale_version',
    });
    await expect(cancelRequest(READER, input({ version: 3 }), s.deps)).rejects.toThrow(
      ForbiddenError,
    );
  });

  it.each(['', '   ', 'a'.repeat(501)])('comentario inválido (%#): Validation', async (comment) => {
    const s = setup(request('in_approval'));
    await expect(cancelRequest(OWNER, input({ comment }), s.deps)).rejects.toMatchObject({
      code: 'VALIDATION',
    });
    expect(s.updates).toEqual([]);
  });

  it('un canceller que lanza propaga el error y no audita', async () => {
    const s = setup(request('in_approval'), { failCanceller: true });
    await expect(cancelRequest(OWNER, input(), s.deps)).rejects.toThrow('approvals down');
    expect(s.audit).toEqual([]);
  });

  it('un ctx de otro tenant no encuentra el documento', async () => {
    const s = setup(request('in_approval'));
    const foreign: Ctx = { ...OWNER, tenantId: '99999999-9999-4999-8999-999999999999' };
    await expect(cancelRequest(foreign, input(), s.deps)).rejects.toThrow(NotFoundError);
  });
});
