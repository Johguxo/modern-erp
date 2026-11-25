// Enviar un SOF a aprobación (requests.create). Todo en la transacción de withTenant:
//   1. bloquea la solicitud (FOR UPDATE) y revisa versión y estado;
//   2. revisa lo obligatorio (G5) y que las referencias sigan activas; los precios del borrador
//      quedan congelados (no se vuelve a leer el catálogo) y el total se recalcula desde las líneas;
//   3. bloquea la secuencia (FOR UPDATE, siempre después de la solicitud) y toma el número;
//   4. pasa a in_approval y arranca la aprobación.
// Si cualquier paso lanza, la transacción se revierte entera y no se consume número.
import { recordAudit } from '@/modules/identity';
import { requirePermission } from '@/shared/authorization';
import type { Ctx } from '@/shared/context';
import { NotFoundError } from '@/shared/errors';

import { lineSubtotal, sumTotal } from '../domain/money';
import { advance, formatDocumentNumber } from '../domain/numbering';
import { assertSubmittable } from '../domain/request';
import { nextStatus } from '../domain/request-state-machine';

import { assertRefsStillValid } from './catalog-snapshot';
import type { SubmitDeps } from './ports';
import { assertVersion, lockOwnRequest } from './request-access';
import { toRequestView, type RequestView } from './views';

export interface SubmitRequestInput {
  readonly id: string;
  readonly version: number;
}

export async function submitRequest(
  ctx: Ctx,
  input: SubmitRequestInput,
  deps: SubmitDeps,
): Promise<RequestView> {
  requirePermission(ctx, 'requests.create');

  const current = await lockOwnRequest(ctx, deps.requests, input.id);
  const { request } = current;
  // Del §1: solo un borrador se envía (InvalidTransitionError con from/event en otro caso).
  const status = nextStatus(request.status, 'submit');
  assertVersion(request.version, input.version);

  const activeLines = current.lines.filter((line) => line.status === 'active');
  assertSubmittable({
    costCenterId: request.costCenterId,
    reason: request.reason,
    activeLineCount: activeLines.length,
  });

  // Los precios del borrador quedan congelados: solo se revalidan las referencias y se recalculan
  // subtotales y total desde lo guardado. Los ids de las líneas no cambian.
  await assertRefsStillValid(
    ctx,
    {
      currency: request.currency,
      header: { costCenterId: request.costCenterId, equipmentId: request.equipmentId },
      lines: activeLines,
    },
    deps.catalog,
  );
  const lines = current.lines;
  const totalAmount = sumTotal(
    activeLines.map((line) => lineSubtotal(line.quantity, line.unitPrice)),
  );

  const sequence = await deps.sequences.lockForUpdate(ctx.tenantId, request.docType);
  if (!sequence) {
    throw new NotFoundError({ message: `Document sequence ${request.docType} not found` });
  }
  const advanced = advance(sequence);
  const number = formatDocumentNumber(sequence.prefix, advanced.issuedNumber, sequence.padding);
  await deps.sequences.update(ctx.tenantId, request.docType, {
    nextNumber: advanced.nextNumber,
    lastIssuedNumber: advanced.lastIssuedNumber,
  });

  const submitted = await deps.requests.updateHeader(ctx.tenantId, request.id, request.version, {
    status,
    number,
    submittedAt: deps.clock.now(),
    ...(totalAmount !== request.totalAmount ? { totalAmount } : {}),
  });

  await deps.approvals.start(ctx, {
    requestId: submitted.id,
    docType: submitted.docType,
    totalAmount: submitted.totalAmount,
  });

  await recordAudit(
    ctx,
    {
      action: 'request.submitted',
      entityType: 'request',
      entityId: submitted.id,
      data: {
        number,
        lineCount: lines.length,
        totalAmount: submitted.totalAmount,
        currency: submitted.currency,
      },
    },
    deps,
  );
  return toRequestView(submitted, lines);
}
