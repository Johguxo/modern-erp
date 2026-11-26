// Acciones disponibles sobre un SOF para quien lo mira (E3-H4). Función pura: decide por estado,
// permisos y relación con el documento (nunca por nombre de rol). La entrega aplica además la solo
// lectura y decide cuáles acciones ya están conectadas.
import { hasPermission } from '@/shared/authorization';
import type { Ctx } from '@/shared/context';

import { canCancel } from './cancellation';
import { EDITABLE_STATUSES, type Request } from './request';
import { canTransition } from './request-state-machine';

export const REQUEST_ACTIONS = [
  'edit_draft',
  'resubmit',
  'cancel',
  'approve',
  'request_changes',
  'reject',
  'correct_line',
  'deliver',
  'download_pdf',
] as const;
export type RequestAction = (typeof REQUEST_ACTIONS)[number];

export interface ActionOptions {
  /** El paso pendiente de aprobación es del usuario (lo resuelve el puerto ApprovalAssignments). */
  readonly pendingForMe: boolean;
}

export function availableActions(
  request: Pick<Request, 'status' | 'requesterId'>,
  ctx: Pick<Ctx, 'userId' | 'permissions'>,
  options: ActionOptions,
): RequestAction[] {
  const { status } = request;
  const isOwner = request.requesterId === ctx.userId;
  // El dueño nunca decide su propio documento (flujo §1).
  const canDecide = options.pendingForMe && !isOwner && hasPermission(ctx, 'approvals.decide');
  const actions: RequestAction[] = [];

  if (isOwner && EDITABLE_STATUSES.includes(status) && hasPermission(ctx, 'requests.create')) {
    actions.push('edit_draft');
  }
  // Tras pedir cambios, el dueño puede reenviar a aprobación (la edición llega con E4).
  if (isOwner && hasPermission(ctx, 'requests.create') && canTransition(status, 'resubmit')) {
    actions.push('resubmit');
  }
  // El dueño anula hasta antes de la aprobación; quien tiene `requests.cancel_any`, cualquier
  // documento enviado (E3-H5).
  if (canCancel(request, ctx)) actions.push('cancel');
  if (canDecide && canTransition(status, 'approve')) actions.push('approve');
  if (canDecide && canTransition(status, 'request_changes')) actions.push('request_changes');
  if (canDecide && canTransition(status, 'reject')) actions.push('reject');
  if (hasPermission(ctx, 'requests.correct_line') && canTransition(status, 'correct_line')) {
    actions.push('correct_line');
  }
  if (hasPermission(ctx, 'requests.deliver') && canTransition(status, 'deliver')) {
    actions.push('deliver');
  }
  actions.push('download_pdf');
  return actions;
}
