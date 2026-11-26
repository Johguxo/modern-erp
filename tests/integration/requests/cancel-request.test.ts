// E3-H5 · Anular un SOF contra la base real: dueño y administrador, 404/403/409 en su orden,
// versión vieja, auditoría, puerto ApprovalCanceller (espía y con falla), privacidad del borrador
// anulado y aislamiento entre dos tenants (A y B).
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { closeDatabases, getDbAdmin } from '@/db/admin';
import { auditEvents, requests } from '@/db/schema';
import { withTenant } from '@/db/with-tenant';
import {
  cancelRequest,
  createDraft,
  createGetRequestDetailDeps,
  getRequestDetail,
  noopApprovalHistory,
  submitRequest,
  type ApprovalCanceller,
} from '@/modules/requests';
import type { Permission } from '@/shared/permissions';
import { UNKNOWN_CLIENT } from '@/shared/ports/client-info';

import { createIdentityFixtures } from '../helpers/identity-fixtures';
import {
  addMember,
  draftInput,
  fakeAssignments,
  NO_ASSIGNMENTS,
  insertRequest,
  runInbox,
  runRequests,
  seedRequestsWorld,
  type Member,
  type RequestsWorld,
} from '../helpers/requests-fixtures';

const fx = createIdentityFixtures();
let A: RequestsWorld;
let B: RequestsWorld;
let admin: Member;
let reader: Member;
let stranger: Member;
let bOwnerRequest: string;

const ADMIN_PERMISSIONS: Permission[] = [
  'requests.create',
  'requests.read_own',
  'requests.read_all',
  'requests.cancel_any',
];

beforeAll(async () => {
  A = await seedRequestsWorld(fx);
  B = await seedRequestsWorld(fx);
  admin = await addMember(fx, A, { fullName: 'Admin Alfa', permissions: ADMIN_PERMISSIONS });
  reader = await addMember(fx, A, {
    fullName: 'Aprobador Alfa',
    permissions: ['requests.read_own', 'requests.read_all', 'approvals.decide'],
  });
  stranger = await addMember(fx, A, { fullName: 'Otra Solicitante' });
  bOwnerRequest = await insertRequest(B, { status: 'in_approval' });
});

afterAll(async () => {
  await fx.cleanup();
  await closeDatabases();
});

const rowOf = async (id: string) => {
  const [row] = await getDbAdmin().select().from(requests).where(eq(requests.id, id));
  return row;
};

const auditsOf = (id: string) =>
  getDbAdmin()
    .select({
      action: auditEvents.action,
      actorUserId: auditEvents.actorUserId,
      data: auditEvents.data,
    })
    .from(auditEvents)
    .where(and(eq(auditEvents.entityId, id), eq(auditEvents.action, 'request.cancelled')));

const cancel = (
  ctx: RequestsWorld['ctx'],
  input: { id: string; version: number; comment?: string },
  extras: Parameters<typeof runRequests>[2] = {},
) =>
  runRequests(
    ctx,
    (deps) => cancelRequest(ctx, { comment: 'Se duplicó el pedido', ...input }, deps),
    extras,
  );

/** Un SOF enviado de verdad (con número) del dueño de A. */
async function sentRequest(): Promise<{ id: string; version: number }> {
  const draft = await runRequests(A.ctx, (deps) => createDraft(A.ctx, draftInput(A), deps));
  const sent = await runRequests(A.ctx, (deps) =>
    submitRequest(A.ctx, { id: draft.id, version: draft.version }, deps),
  );
  return { id: sent.id, version: sent.version };
}

describe('el dueño anula', () => {
  it('un borrador: queda cancelled, sin número, con autor, comentario y auditoría', async () => {
    const draft = await runRequests(A.ctx, (deps) => createDraft(A.ctx, draftInput(A), deps));

    const view = await cancel(A.ctx, {
      id: draft.id,
      version: draft.version,
      comment: '  Error  ',
    });

    expect(view).toMatchObject({
      status: 'cancelled',
      number: null,
      closedBy: A.userId,
      closeComment: 'Error',
      version: draft.version + 1,
    });
    expect(view.closedAt).not.toBeNull();
    const row = await rowOf(draft.id);
    expect(row).toMatchObject({ status: 'cancelled', number: null, closeComment: 'Error' });
    expect(await auditsOf(draft.id)).toEqual([
      {
        action: 'request.cancelled',
        actorUserId: A.userId,
        data: { number: null, fromStatus: 'draft', comment: 'Error' },
      },
    ]);
  });

  it('uno en aprobación: conserva su número y audita el estado de origen', async () => {
    const sent = await sentRequest();

    const view = await cancel(A.ctx, sent);

    expect(view).toMatchObject({ status: 'cancelled', closedBy: A.userId });
    expect(view.number).toMatch(/^SOF-\d{4}$/);
    const [audit] = await auditsOf(sent.id);
    expect(audit?.data).toMatchObject({
      number: view.number,
      fromStatus: 'in_approval',
      comment: 'Se duplicó el pedido',
    });
  });

  it('uno con cambios solicitados', async () => {
    const id = await insertRequest(A, { status: 'changes_requested' });

    const view = await cancel(A.ctx, { id, version: 1 });

    expect(view.status).toBe('cancelled');
  });
});

describe('permisos y orden de errores', () => {
  it('el dueño no anula una aprobada: FORBIDDEN y nada cambia', async () => {
    const id = await insertRequest(A, { status: 'approved', approvedAt: new Date() });

    await expect(cancel(A.ctx, { id, version: 1 })).rejects.toMatchObject({
      code: 'FORBIDDEN',
      reason: 'cancel_not_allowed',
    });
    expect(await rowOf(id)).toMatchObject({ status: 'approved', closeComment: null, version: 1 });
    expect(await auditsOf(id)).toEqual([]);
  });

  it('el administrador (cancel_any) anula una aprobada ajena', async () => {
    const id = await insertRequest(A, { status: 'approved', approvedAt: new Date() });

    const view = await cancel(admin.ctx, { id, version: 1, comment: 'Cambió la obra' });

    expect(view).toMatchObject({ status: 'cancelled', closedBy: admin.userId });
    const [audit] = await auditsOf(id);
    expect(audit).toMatchObject({ actorUserId: admin.userId });
  });

  it('un aprobador con read_all ve el documento pero no tiene permiso para anular', async () => {
    const id = await insertRequest(A, { status: 'in_approval' });

    await expect(cancel(reader.ctx, { id, version: 1 })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    expect(await rowOf(id)).toMatchObject({ status: 'in_approval', version: 1 });
  });

  it('un aprobador asignado que además crea solicitudes ve el documento: FORBIDDEN, no 404', async () => {
    const id = await insertRequest(A, { status: 'in_approval' });

    await expect(
      cancel(stranger.ctx, { id, version: 1 }, { assignments: fakeAssignments([id]) }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN', reason: 'cancel_not_allowed' });
  });

  it('otro solicitante sin acceso: 404 (no revela que existe)', async () => {
    const id = await insertRequest(A, { status: 'in_approval' });

    await expect(cancel(stranger.ctx, { id, version: 1 })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('el borrador ajeno es 404 hasta para el administrador', async () => {
    const id = await insertRequest(A, { status: 'draft' });

    await expect(cancel(admin.ctx, { id, version: 1 })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    expect(await rowOf(id)).toMatchObject({ status: 'draft' });
  });

  it('sin requests.create ni cancel_any: FORBIDDEN sin tocar nada', async () => {
    const id = await insertRequest(A, { status: 'in_approval' });
    const noPermission = await addMember(fx, A, {
      fullName: 'Solo Lectura Propia',
      permissions: ['requests.read_own'],
    });

    await expect(cancel(noPermission.ctx, { id, version: 1 })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    expect(await rowOf(id)).toMatchObject({ status: 'in_approval', version: 1 });
  });

  it.each(['delivered', 'rejected', 'cancelled'] as const)(
    'un estado final (%s) es INVALID_TRANSITION',
    async (status) => {
      const id = await insertRequest(A, { status });

      await expect(cancel(A.ctx, { id, version: 1 })).rejects.toMatchObject({
        code: 'INVALID_TRANSITION',
      });
    },
  );

  it('la versión vieja es stale_version y no anula', async () => {
    const sent = await sentRequest();

    await expect(cancel(A.ctx, { id: sent.id, version: sent.version - 1 })).rejects.toMatchObject({
      code: 'CONFLICT',
      reason: 'stale_version',
    });
    expect(await rowOf(sent.id)).toMatchObject({ status: 'in_approval', closeComment: null });
  });

  it.each(['', '    ', 'x'.repeat(501)])(
    'comentario inválido (%#): VALIDATION',
    async (comment) => {
      const id = await insertRequest(A, { status: 'in_approval' });

      await expect(cancel(A.ctx, { id, version: 1, comment })).rejects.toMatchObject({
        code: 'VALIDATION',
      });
      expect(await rowOf(id)).toMatchObject({ status: 'in_approval', version: 1 });
    },
  );
});

describe('puerto ApprovalCanceller', () => {
  it('recibe el id y el comentario dentro de la transacción', async () => {
    const id = await insertRequest(A, { status: 'in_approval' });
    const calls: { requestId: string; comment: string; userId: string }[] = [];
    const canceller: ApprovalCanceller = {
      cancel: (ctx, input) => {
        calls.push({ ...input, userId: ctx.userId });
        return Promise.resolve();
      },
    };

    await cancel(A.ctx, { id, version: 1, comment: 'Motivo' }, { canceller });

    expect(calls).toEqual([{ requestId: id, comment: 'Motivo', userId: A.userId }]);
  });

  it('si lanza, se revierte todo: estado, cierre y auditoría', async () => {
    const id = await insertRequest(A, { status: 'in_approval' });
    const canceller: ApprovalCanceller = {
      cancel: () => Promise.reject(new Error('approvals down')),
    };

    await expect(cancel(A.ctx, { id, version: 1 }, { canceller })).rejects.toThrow(
      'approvals down',
    );

    expect(await rowOf(id)).toMatchObject({
      status: 'in_approval',
      closedAt: null,
      closedBy: null,
      closeComment: null,
      version: 1,
    });
    expect(await auditsOf(id)).toEqual([]);
  });
});

describe('visibilidad tras anular', () => {
  it('un borrador anulado sigue privado: ni read_all ni el administrador lo ven (detalle y bandeja)', async () => {
    const draft = await runRequests(A.ctx, (deps) => createDraft(A.ctx, draftInput(A), deps));
    await cancel(A.ctx, { id: draft.id, version: draft.version });

    const detailOf = (ctx: RequestsWorld['ctx']) =>
      withTenant(ctx, (tx) =>
        getRequestDetail(
          ctx,
          { id: draft.id },
          createGetRequestDetailDeps(tx, {
            client: UNKNOWN_CLIENT,
            assignments: NO_ASSIGNMENTS,
            history: noopApprovalHistory,
          }),
        ),
      );

    await expect(detailOf(reader.ctx)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(detailOf(admin.ctx)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    const own = await detailOf(A.ctx);
    expect(own).toMatchObject({ status: 'cancelled', number: null, actions: ['download_pdf'] });
    const items = (ctx: RequestsWorld['ctx']) =>
      runInbox(ctx, { pageSize: 100 }).then((page) => page.items.map((item) => item.id));
    expect(await items(reader.ctx)).not.toContain(draft.id);
    expect(await items(admin.ctx)).not.toContain(draft.id);
    expect(await items(A.ctx)).toContain(draft.id);
  });

  it('una enviada y anulada la ve quien tiene read_all, con quién anuló y el comentario', async () => {
    const sent = await sentRequest();
    await cancel(admin.ctx, { ...sent, comment: 'Pedido repetido' });

    const detail = await withTenant(reader.ctx, (tx) =>
      getRequestDetail(
        reader.ctx,
        { id: sent.id },
        createGetRequestDetailDeps(tx, {
          client: UNKNOWN_CLIENT,
          assignments: NO_ASSIGNMENTS,
          history: noopApprovalHistory,
        }),
      ),
    );

    const last = detail.timeline.at(-1);
    expect(last).toMatchObject({
      kind: 'cancelled',
      state: 'stopped',
      actorName: 'Admin Alfa',
      comment: 'Pedido repetido',
    });
    expect(last?.at).not.toBeNull();
    expect(detail.actions).toEqual(['download_pdf']);
  });
});

describe('aislamiento entre tenants', () => {
  it('A no anula una solicitud de B: 404 y B no cambia', async () => {
    await expect(cancel(admin.ctx, { id: bOwnerRequest, version: 1 })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    expect(await rowOf(bOwnerRequest)).toMatchObject({ status: 'in_approval', closedBy: null });
  });

  it('B anula la suya sin afectar a A', async () => {
    const view = await cancel(B.ctx, { id: bOwnerRequest, version: 1 });

    expect(view).toMatchObject({ status: 'cancelled', closedBy: B.userId });
    const audits = await getDbAdmin()
      .select({ tenantId: auditEvents.tenantId })
      .from(auditEvents)
      .where(eq(auditEvents.entityId, bOwnerRequest));
    expect(audits.every((a) => a.tenantId === B.tenantId)).toBe(true);
  });
});
