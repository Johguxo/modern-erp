// E3-H4 · Detalle del SOF contra la base real: visibilidad entre dos tenants (A y B), borrador
// ajeno, aprobador asignado, permisos, rótulos que no cruzan de tenant y acciones con un fake de
// asignaciones (lo que E4-H2 aportará).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { closeDatabases } from '@/db/admin';
import { withTenant } from '@/db/with-tenant';
import {
  createDraft,
  createGetRequestDetailDeps,
  getRequestDetail,
  noopApprovalTimeline,
  submitRequest,
  type ApprovalAssignments,
  type RequestDetail,
} from '@/modules/requests';
import { ForbiddenError, NotFoundError } from '@/shared/errors';
import { UNKNOWN_CLIENT } from '@/shared/ports/client-info';
import { makeCtx } from '@tests/support/ctx';

import { createIdentityFixtures } from '../helpers/identity-fixtures';
import {
  addMember,
  draftInput,
  fakeAssignments,
  NO_ASSIGNMENTS,
  insertRequest,
  runRequests,
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
let warehouse: Member;

let sentId: string;
let draftId: string;
let anaDraftId: string;
let bSentId: string;

function detailOf(
  ctx: RequestsWorld['ctx'],
  id: string,
  assignments?: ApprovalAssignments,
): Promise<RequestDetail> {
  return withTenant(ctx, (tx) =>
    getRequestDetail(
      ctx,
      { id },
      createGetRequestDetailDeps(tx, {
        client: UNKNOWN_CLIENT,
        assignments: assignments ?? NO_ASSIGNMENTS,
        timeline: noopApprovalTimeline,
      }),
    ),
  );
}

beforeAll(async () => {
  A = await seedRequestsWorld(fx, { nextNumber: 1 });
  B = await seedRequestsWorld(fx, { nextNumber: 1 });
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
  warehouse = await addMember(fx, A, {
    fullName: 'Almacén Central',
    permissions: [
      'requests.read_own',
      'requests.read_all',
      'requests.correct_line',
      'requests.deliver',
      'approvals.decide',
    ],
    roles: ['warehouse'],
  });

  // Un SOF enviado de verdad (con líneas, número y precios del catálogo).
  const draft = await runRequests(A.ctx, (deps) =>
    createDraft(A.ctx, draftInput(A, { equipmentId: A.equipmentId }), deps),
  );
  const sent = await runRequests(A.ctx, (deps) =>
    submitRequest(A.ctx, { id: draft.id, version: draft.version }, deps),
  );
  sentId = sent.id;
  const ownDraft = await runRequests(A.ctx, (deps) => createDraft(A.ctx, draftInput(A), deps));
  draftId = ownDraft.id;
  anaDraftId = await insertRequest(A, { requesterId: ana.userId, status: 'draft' });
  bSentId = await insertRequest(B, { number: 'SOF-0001' });
});

afterAll(async () => {
  await fx.cleanup();
  await closeDatabases();
});

describe('detalle de un SOF enviado', () => {
  it('trae nombres, líneas con equipo, línea de tiempo y acciones del dueño', async () => {
    const detail = await detailOf(A.ctx, sentId);

    expect(detail).toMatchObject({
      number: 'SOF-0001',
      status: 'in_approval',
      displayStatus: 'in_approval',
      costCenterLabel: 'Obra norte',
      equipmentLabel: 'EQ-1 · Grúa',
      totalAmount: '33.33',
      currency: 'PEN',
    });
    expect(detail.requesterName).toEqual(expect.any(String));
    expect(
      detail.lines.map((l) => [l.lineNo, l.productCode, l.quantity, l.equipmentLabel]),
    ).toEqual([
      [1, 'FIL-1', '2.000', 'EQ-1 · Grúa'],
      [2, 'PER-2', '2.500', null],
    ]);
    expect(detail.timeline.map((i) => `${i.kind}:${i.state}`)).toEqual([
      'created:done',
      'submitted:done',
      'approval:pending',
      'delivery:upcoming',
    ]);
    expect(detail.timeline[0]?.actorName).toBe(detail.requesterName);
    expect(detail.actions).toEqual(['cancel', 'download_pdf']);
  });

  it('el borrador propio se ve con las acciones de editar y anular', async () => {
    const detail = await detailOf(A.ctx, draftId);
    expect(detail.number).toBeNull();
    expect(detail.status).toBe('draft');
    expect(detail.actions).toEqual(['edit_draft', 'cancel', 'download_pdf']);
  });
});

describe('visibilidad y aislamiento', () => {
  it('un usuario de B no ve la solicitud de A (404), ni al revés', async () => {
    await expect(detailOf(B.ctx, sentId)).rejects.toBeInstanceOf(NotFoundError);
    await expect(detailOf(A.ctx, bSentId)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('un lector con read_all de B tampoco ve la solicitud de A', async () => {
    const bReader = await addMember(fx, B, {
      fullName: 'Lector B',
      permissions: ['requests.read_own', 'requests.read_all'],
    });
    await expect(detailOf(bReader.ctx, sentId)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('otro solicitante sin asignación no ve un SOF ajeno enviado', async () => {
    await expect(detailOf(ana.ctx, sentId)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('un borrador ajeno es 404 aunque tenga read_all o esté asignado', async () => {
    await expect(detailOf(reader.ctx, anaDraftId)).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      detailOf(approver.ctx, anaDraftId, fakeAssignments([anaDraftId])),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(detailOf(A.ctx, anaDraftId)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('con read_all se ve lo enviado de otros, sin acciones de dueño', async () => {
    const detail = await detailOf(reader.ctx, sentId);
    expect(detail.id).toBe(sentId);
    expect(detail.actions).toEqual(['download_pdf']);
  });

  it('el aprobador asignado lo ve; sin la asignación es 404', async () => {
    await expect(detailOf(approver.ctx, sentId)).rejects.toBeInstanceOf(NotFoundError);
    const detail = await detailOf(approver.ctx, sentId, fakeAssignments([sentId], []));
    expect(detail.id).toBe(sentId);
    expect(detail.displayStatus).toBe('in_approval');
    expect(detail.actions).toEqual(['download_pdf']);
  });

  it('un id de B en las asignaciones de A no abre nada de B', async () => {
    await expect(
      detailOf(approver.ctx, bSentId, fakeAssignments([bSentId])),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('un uuid inexistente es 404', async () => {
    await expect(detailOf(A.ctx, '00000000-0000-4000-8000-000000000000')).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it('sin ningún permiso de solicitudes es Forbidden', async () => {
    const nobody = makeCtx({ tenantId: A.tenantId, userId: A.userId, permissions: [] });
    await expect(detailOf(nobody, sentId)).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe('acciones con asignaciones', () => {
  it('el aprobador con el paso pendiente ve «espera mi aprobación» y decide', async () => {
    const detail = await detailOf(approver.ctx, sentId, fakeAssignments([sentId]));
    expect(detail.displayStatus).toBe('awaiting_my_approval');
    expect(detail.actions).toEqual(['approve', 'request_changes', 'reject', 'download_pdf']);
  });

  it('almacén con el paso pendiente suyo además puede corregir una línea', async () => {
    const detail = await detailOf(warehouse.ctx, sentId, fakeAssignments([sentId]));
    expect(detail.actions).toEqual([
      'approve',
      'request_changes',
      'reject',
      'correct_line',
      'download_pdf',
    ]);
  });

  it('almacén sin paso pendiente solo corrige', async () => {
    const detail = await detailOf(warehouse.ctx, sentId);
    expect(detail.actions).toEqual(['correct_line', 'download_pdf']);
  });

  it('el dueño con el paso pendiente suyo no decide su propio SOF', async () => {
    const detail = await detailOf(A.ctx, sentId, fakeAssignments([sentId]));
    expect(detail.displayStatus).toBe('in_approval');
    expect(detail.actions).toEqual(['cancel', 'download_pdf']);
  });
});

describe('rótulos', () => {
  it('no cruzan de tenant: el equipo de B no se nombra en un SOF de A', async () => {
    const other = await insertRequest(A, { equipmentId: B.equipmentId });
    const detail = await detailOf(A.ctx, other);
    expect(detail.equipmentLabel).toBeNull();
  });

  it('el centro de costo y los usuarios de B tampoco se nombran en un SOF de A', async () => {
    const other = await insertRequest(A, { costCenterId: B.costCenterId, requesterId: B.userId });
    const detail = await detailOf(reader.ctx, other);
    expect(detail.costCenterLabel).toBeNull();
    expect(detail.requesterName).toBeNull();
  });
});
