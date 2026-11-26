// Detalle del SOF (E3-H4): la solicitud visible con nombres, línea de tiempo y acciones. Comparte la
// visibilidad de getRequest (404 si no existe, es de otro tenant o no la puede ver).
import { hasPermission } from '@/shared/authorization';
import type { Ctx } from '@/shared/context';

import { displayStatus } from '../domain/inbox';
import { availableActions } from '../domain/request-actions';
import { buildTimeline, deriveTimeline } from '../domain/request-timeline';

import type { GetRequestDetailDeps } from './ports';
import { findVisibleRequest } from './request-access';
import { toTimelineItems, type RequestDetail } from './views';

const nonNull = (ids: readonly (string | null)[]): string[] => [
  ...new Set(ids.filter((id): id is string => id !== null)),
];

export async function getRequestDetail(
  ctx: Ctx,
  input: { readonly id: string },
  deps: GetRequestDetailDeps,
): Promise<RequestDetail> {
  const { request, lines } = await findVisibleRequest(ctx, input.id, deps);
  const activeLines = lines.filter((line) => line.status === 'active');

  // Solo se consulta el paso pendiente cuando puede cambiar la respuesta.
  const mayDecide =
    request.status === 'in_approval' &&
    request.requesterId !== ctx.userId &&
    hasPermission(ctx, 'approvals.decide');
  const pendingStepId = mayDecide ? await deps.assignments.pendingStepId(ctx, request.id) : null;
  const pendingForMe = pendingStepId !== null;

  // Un borrador (sin número) nunca se envió: no hay instancia que consultar. Sin instancia, o con un
  // legado, la línea sale de las fechas del documento.
  const entries = request.number === null ? null : await deps.timeline.getTimeline(ctx, request.id);
  const timeline = entries ? buildTimeline(request, entries) : deriveTimeline(request);
  const [names, areas] = await Promise.all([
    deps.labels.userNames(
      ctx,
      nonNull([
        request.requesterId,
        ...timeline.flatMap((item) => [item.actorId, ...item.assigneeIds]),
      ]),
    ),
    deps.labels.areaLabels(ctx, {
      equipmentIds: nonNull([request.equipmentId, ...activeLines.map((line) => line.equipmentId)]),
      costCenterIds: nonNull([request.costCenterId]),
    }),
  ]);
  const equipmentOf = (id: string | null): string | null =>
    id ? (areas.equipment.get(id) ?? null) : null;

  return {
    id: request.id,
    docType: request.docType,
    number: request.number,
    status: request.status,
    displayStatus: displayStatus(request.status, pendingForMe),
    requesterId: request.requesterId,
    requesterName: names.get(request.requesterId) ?? null,
    closedById: request.closedBy,
    costCenterLabel: request.costCenterId
      ? (areas.costCenters.get(request.costCenterId) ?? null)
      : null,
    equipmentLabel: equipmentOf(request.equipmentId),
    reason: request.reason,
    currency: request.currency,
    totalAmount: request.totalAmount,
    version: request.version,
    pendingStepId,
    lines: [...activeLines]
      .sort((a, b) => a.lineNo - b.lineNo)
      .map((line) => ({
        id: line.id,
        lineNo: line.lineNo,
        productCode: line.productCode,
        description: line.description,
        unit: line.unit,
        quantity: line.quantity,
        subtotal: line.subtotal,
        equipmentLabel: equipmentOf(line.equipmentId),
      })),
    timeline: toTimelineItems(timeline, names),
    actions: availableActions(request, ctx, { pendingForMe }),
  };
}
