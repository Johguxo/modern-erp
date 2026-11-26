// Anular un SOF (E3-H5, flujo §1). Reglas puras: la máquina de estados dice si el estado admite
// `cancel`; aquí se decide quién puede y qué comentario se acepta.
import { hasPermission } from '@/shared/authorization';
import type { Ctx } from '@/shared/context';
import { ForbiddenError, ValidationError } from '@/shared/errors';

import { CANCEL_COMMENT_MAX, type Request } from './request';
import { canTransition, nextStatus, type RequestStatus } from './request-state-machine';

/** Estados en los que el dueño puede anular su propio documento (aprobado ya no). */
export const OWNER_CANCELLABLE: readonly RequestStatus[] = [
  'draft',
  'in_approval',
  'changes_requested',
];

/**
 * - `requests.cancel_any` anula cualquier documento enviado (también aprobado); el borrador ajeno
 *   no se ve, así que no se anula.
 * - El dueño, con `requests.create`, anula el suyo mientras no esté aprobado.
 */
export function canCancel(
  request: Pick<Request, 'status' | 'requesterId'>,
  ctx: Pick<Ctx, 'userId' | 'permissions'>,
): boolean {
  if (!canTransition(request.status, 'cancel')) return false;
  if (hasPermission(ctx, 'requests.cancel_any') && request.status !== 'draft') return true;
  return (
    request.requesterId === ctx.userId &&
    hasPermission(ctx, 'requests.create') &&
    OWNER_CANCELLABLE.includes(request.status)
  );
}

/**
 * InvalidTransitionError (409) si el estado no admite anular; ForbiddenError `cancel_not_allowed`
 * si el estado lo admite pero el usuario no tiene derecho. Devuelve el estado destino.
 */
export function assertCanCancel(
  request: Pick<Request, 'status' | 'requesterId'>,
  ctx: Pick<Ctx, 'userId' | 'permissions'>,
): RequestStatus {
  const to = nextStatus(request.status, 'cancel');
  if (!canCancel(request, ctx)) {
    throw new ForbiddenError({
      reason: 'cancel_not_allowed',
      message: `User ${ctx.userId} cannot cancel a request in ${request.status}`,
    });
  }
  return to;
}

/** Comentario sin espacios en los bordes, de 1 a 500 caracteres; ValidationError si no. */
export function normalizeCancelComment(raw: string): string {
  const comment = raw.trim();
  const reason =
    comment === ''
      ? 'cancel_comment_required'
      : comment.length > CANCEL_COMMENT_MAX
        ? 'cancel_comment_too_long'
        : null;
  if (reason !== null) {
    throw new ValidationError({
      reason,
      params: { max: CANCEL_COMMENT_MAX },
      fieldErrors: { comment: [reason] },
      message: 'Cancel comment must have 1 to 500 characters',
    });
  }
  return comment;
}
