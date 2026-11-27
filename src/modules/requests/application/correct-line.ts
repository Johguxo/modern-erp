// Corregir una línea de un SOF en aprobación o aprobado, sin reiniciar la aprobación (E4-H4, flujo
// §4). Todo en la transacción de withTenant:
//   1. permiso `requests.correct_line`;
//   2. bloquea la solicitud (FOR UPDATE), revisa que el usuario la vea (404 si no) y la versión (409);
//   3. el estado admite `correct_line` (in_approval o approved);
//   4. el motor da la tolerancia de la política (bloquea la instancia, siempre después de la
//      solicitud);
//   5. aplica el cambio a las líneas y calcula el total nuevo (decimal.js, texto);
//   6. rama de reaprobación: total igual, dentro de la tolerancia o por encima;
//   7. escribe: la revisión anterior (solo insert) y la línea con `revision + 1`, o la línea nueva;
//   8. el motor registra el evento `line_corrected` y, si hay a quién, el paso de reconfirmación;
//   9. actualiza el documento (total, estado; sube siempre la versión) y audita.
// Si cualquier paso lanza, se revierte todo. Una corrección que llega con la versión vieja recibe
// `stale_version` y debe recargar (§8, caso 3).
import { recordAudit } from '@/modules/identity';
import { requirePermission } from '@/shared/authorization';
import type { Ctx } from '@/shared/context';
import { InvalidTransitionError } from '@/shared/errors';

import { applyLineCorrection, normalizeCorrectionReason } from '../domain/line-correction';
import { reapprovalBranch, type ReapprovalBranch } from '../domain/reapproval';
import { snapshotOf, type RequestLine } from '../domain/request';
import { canTransition, nextStatus } from '../domain/request-state-machine';

import type { CorrectDeps, HeaderPatch } from './ports';
import { assertVersion, lockVisibleRequest } from './request-access';
import { resolveLineChange, type LineChangeInput } from './resolve-line-change';
import { toRequestView, type RequestView } from './views';

export interface CorrectLineInput {
  readonly id: string;
  /** La versión que el cliente vio al abrir el documento. */
  readonly version: number;
  readonly reason: string;
  readonly change: LineChangeInput;
}

export type CorrectLineOutput = RequestView & {
  readonly branch: ReapprovalBranch;
  /** Se creó un paso de reconfirmación. */
  readonly reconfirmation: boolean;
};

export async function correctLine(
  ctx: Ctx,
  input: CorrectLineInput,
  deps: CorrectDeps,
): Promise<CorrectLineOutput> {
  requirePermission(ctx, 'requests.correct_line');
  const reason = normalizeCorrectionReason(input.reason);

  const { request, lines } = await lockVisibleRequest(ctx, input.id, deps);
  assertVersion(request.version, input.version);
  if (!canTransition(request.status, 'correct_line')) {
    throw new InvalidTransitionError({ from: request.status, event: 'correct_line' });
  }

  const { tolerancePct } = await deps.corrector.tolerance(ctx, { requestId: request.id });

  const resolved = await resolveLineChange(
    ctx,
    { currency: request.currency, lines, change: input.change },
    deps.catalog,
  );
  const applied = applyLineCorrection(lines, resolved);
  const branch = reapprovalBranch({
    previousTotal: applied.previousTotal,
    newTotal: applied.newTotal,
    tolerancePct,
  });

  // Escrituras de la línea: la revisión anterior (solo insert) y la línea al día.
  let written: RequestLine;
  if (applied.type === 'add') {
    written = await deps.requests.insertLine(ctx.tenantId, request.id, applied.next);
  } else {
    const { line } = applied;
    await deps.requests.appendRevision(ctx.tenantId, {
      requestId: request.id,
      requestLineId: line.id,
      revision: line.revision,
      snapshot: snapshotOf(line),
      changedBy: ctx.userId,
      reason,
    });
    written = await deps.requests.updateLine(
      ctx.tenantId,
      line.id,
      line.revision,
      applied.type === 'remove' ? { status: 'removed' } : { values: applied.next },
    );
  }

  const { reconfirmation } = await deps.corrector.record(ctx, {
    requestId: request.id,
    requesterId: request.requesterId,
    lineId: written.id,
    lineNo: written.lineNo,
    changeType: applied.type,
    reason,
    before: applied.before,
    after: applied.after,
    changedFields: applied.changedFields,
    branch,
    previousTotal: applied.previousTotal,
    newTotal: applied.newTotal,
    tolerancePct,
  });
  if (reconfirmation) {
    await deps.requests.flagReconfirmation(ctx.tenantId, written.id);
    written = { ...written, needsReconfirmation: true };
  }

  const status = nextStatus(request.status, 'correct_line', { reconfirm: reconfirmation });
  const patch: HeaderPatch = {
    ...(applied.newTotal !== request.totalAmount ? { totalAmount: applied.newTotal } : {}),
    ...(status !== request.status ? { status, approvedAt: null } : {}),
  };
  const updated = await deps.requests.updateHeader(
    ctx.tenantId,
    request.id,
    request.version,
    patch,
  );

  await recordAudit(
    ctx,
    {
      action: 'request.line_corrected',
      entityType: 'request',
      entityId: updated.id,
      data: {
        number: updated.number,
        lineId: written.id,
        lineNo: written.lineNo,
        changeType: applied.type,
        changedFields: [...applied.changedFields],
        reason,
        branch,
        reconfirmation,
        previousTotal: applied.previousTotal,
        newTotal: applied.newTotal,
        fromStatus: request.status,
        toStatus: status,
        version: updated.version,
      },
    },
    deps,
  );

  const nextLines =
    applied.type === 'add'
      ? [...lines, written]
      : lines.map((line) => (line.id === written.id ? written : line));
  return { ...toRequestView(updated, nextLines), branch, reconfirmation };
}
