// Decisión de un aprobador sobre un SOF (E4-H2, flujo §1 y §3). Reglas puras: el comentario que se
// acepta y el estado en que queda el documento según lo que resolvió el motor de aprobaciones.
import { InvalidTransitionError, ValidationError } from '@/shared/errors';

import { nextStatus, type RequestStatus } from './request-state-machine';

/** Aprobar el paso, pedir cambios al solicitante o rechazar (cierra el documento). */
export const DECISION_KINDS = ['approve', 'request_changes', 'reject'] as const;
export type DecisionKind = (typeof DECISION_KINDS)[number];

/** Comentario de la decisión (también es el check de la base). */
export const DECISION_COMMENT_MAX = 500;

/** Lo que el motor resolvió (ver `approvals`): solo `approved` y los cierres cambian el estado. */
export const DECISION_OUTCOMES = [
  'partial',
  'advanced',
  'approved',
  'rejected',
  'changes_requested',
] as const;
export type DecisionOutcome = (typeof DECISION_OUTCOMES)[number];

/**
 * Comentario sin espacios en los bordes; null si viene vacío. Rechazar y pedir cambios lo exigen
 * (`decision_comment_required`); aprobar no. Máximo 500 caracteres.
 */
export function normalizeDecisionComment(
  kind: DecisionKind,
  raw: string | null | undefined,
): string | null {
  const comment = raw?.trim() ?? '';
  const reason =
    comment === '' && kind !== 'approve'
      ? 'decision_comment_required'
      : comment.length > DECISION_COMMENT_MAX
        ? 'decision_comment_too_long'
        : null;
  if (reason !== null) {
    throw new ValidationError({
      reason,
      params: { max: DECISION_COMMENT_MAX },
      fieldErrors: { comment: [reason] },
      message: 'Decision comment is required to reject or request changes, up to 500 characters',
    });
  }
  return comment === '' ? null : comment;
}

/**
 * Estado del documento después de la decisión. Una aprobación que no cierra el último paso lo deja
 * en `in_approval`, pero solo si el documento sigue en aprobación (InvalidTransitionError si no).
 */
export function statusAfterDecision(
  current: RequestStatus,
  outcome: DecisionOutcome,
): RequestStatus {
  switch (outcome) {
    case 'approved':
      return nextStatus(current, 'approve');
    case 'rejected':
      return nextStatus(current, 'reject');
    case 'changes_requested':
      return nextStatus(current, 'request_changes');
    case 'partial':
    case 'advanced':
      if (current !== 'in_approval') {
        throw new InvalidTransitionError({ from: current, event: 'approve' });
      }
      return current;
  }
}
