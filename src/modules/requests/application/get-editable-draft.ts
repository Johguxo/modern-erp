// Leer un borrador para editarlo (requests.create): solo el solicitante y solo en borrador. Si no
// existe, es de otro usuario o tenant, o ya salió de borrador → NotFoundError (404, no revela nada).
import { requirePermission } from '@/shared/authorization';
import type { Ctx } from '@/shared/context';
import { NotFoundError } from '@/shared/errors';

import { EDITABLE_STATUSES } from '../domain/request';

import type { GetRequestDeps } from './ports';
import { toRequestView, type RequestView } from './views';

export async function getEditableDraft(
  ctx: Ctx,
  input: { readonly id: string },
  deps: Pick<GetRequestDeps, 'requests'>,
): Promise<RequestView> {
  requirePermission(ctx, 'requests.create');
  const found = await deps.requests.find(ctx.tenantId, input.id);
  if (
    !found ||
    found.request.requesterId !== ctx.userId ||
    !EDITABLE_STATUSES.includes(found.request.status)
  ) {
    throw new NotFoundError({ message: 'Draft not found' });
  }
  // Las líneas quitadas en una edición anterior (E4-H4) no se vuelven a ofrecer en el editor.
  return toRequestView(
    found.request,
    found.lines.filter((line) => line.status === 'active'),
  );
}
