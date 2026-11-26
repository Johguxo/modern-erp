// Bandeja (E3-H3): solicitudes visibles para el usuario, con pestaña, búsqueda, paginación y
// conteos. La consulta solo toca `requests`; los nombres de otros módulos se resuelven en lote
// para las filas de la página (ADR-001 §10).
import { requireAnyPermission } from '@/shared/authorization';
import type { Ctx } from '@/shared/context';

import {
  displayStatus,
  inboxScope,
  isAwaitingMe,
  isOwnDraft,
  startOfWeek,
  type DisplayStatus,
  type InboxTab,
} from '../domain/inbox';

import type { InboxRow, InboxSummary, ListRequestsDeps } from './ports';

export interface ListRequestsInput {
  readonly tab: InboxTab;
  readonly q: string | null;
  readonly page: number;
  readonly pageSize: number;
}

export interface InboxItem {
  readonly id: string;
  readonly docType: 'SOF';
  readonly number: string | null;
  readonly status: InboxRow['status'];
  readonly displayStatus: DisplayStatus;
  readonly requesterId: string;
  readonly requesterName: string | null;
  readonly areaLabel: string | null;
  readonly currency: InboxRow['currency'];
  readonly totalAmount: string;
  readonly updatedAt: string;
  readonly isOwnDraft: boolean;
}

export interface ListRequestsOutput {
  readonly items: InboxItem[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
  readonly summary: InboxSummary;
  readonly viewerName: string | null;
}

const nonNull = (ids: readonly (string | null)[]): string[] => [
  ...new Set(ids.filter((id): id is string => id !== null)),
];

export async function listRequests(
  ctx: Ctx,
  input: ListRequestsInput,
  deps: ListRequestsDeps,
): Promise<ListRequestsOutput> {
  requireAnyPermission(ctx, ['requests.create', 'requests.read_own', 'requests.read_all']);

  const [assignedIds, pendingIds] = await Promise.all([
    deps.assignments.assignedRequestIds(ctx),
    deps.assignments.pendingRequestIds(ctx),
  ]);
  const visibility = {
    tenantId: ctx.tenantId,
    scope: inboxScope(ctx, assignedIds),
    pendingIds,
  };
  const weekStart = startOfWeek(deps.clock.now(), ctx.timezone);

  const [{ items, total }, summary] = await Promise.all([
    deps.queries.list({ ...visibility, ...input }),
    deps.queries.summary(visibility, weekStart),
  ]);

  const [names, areas] = await Promise.all([
    deps.labels.userNames(ctx, [ctx.userId, ...items.map((row) => row.requesterId)]),
    deps.labels.areaLabels(ctx, {
      equipmentIds: nonNull(items.map((row) => row.equipmentId)),
      costCenterIds: nonNull(items.map((row) => row.costCenterId)),
    }),
  ]);

  const pending = new Set(pendingIds);
  return {
    items: items.map((row) => ({
      id: row.id,
      docType: row.docType,
      number: row.number,
      status: row.status,
      displayStatus: displayStatus(row.status, isAwaitingMe(row, ctx.userId, pending)),
      requesterId: row.requesterId,
      requesterName: names.get(row.requesterId) ?? null,
      areaLabel:
        (row.equipmentId ? areas.equipment.get(row.equipmentId) : undefined) ??
        (row.costCenterId ? areas.costCenters.get(row.costCenterId) : undefined) ??
        null,
      currency: row.currency,
      totalAmount: row.totalAmount,
      updatedAt: row.updatedAt.toISOString(),
      isOwnDraft: isOwnDraft(row, ctx.userId),
    })),
    total,
    page: input.page,
    pageSize: input.pageSize,
    summary,
    viewerName: names.get(ctx.userId) ?? null,
  };
}
