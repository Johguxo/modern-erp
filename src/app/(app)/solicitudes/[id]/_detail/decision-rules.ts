// Reglas puras del diálogo de decisión (E4-H2), separadas del componente para probarlas sin DOM.
import type { DecisionKind } from '@/modules/requests/contracts';

/** Aprobar no exige comentario; rechazar y pedir cambios, sí. */
export function commentRequired(decision: DecisionKind): boolean {
  return decision !== 'approve';
}

/** Errores tras los cuales el usuario debe recargar para ver el estado actual. */
export function needsReload(error: { code: string; reason?: string | undefined }): boolean {
  return (
    error.code === 'CONFLICT' ||
    error.code === 'INVALID_TRANSITION' ||
    error.reason === 'step_already_decided' ||
    error.reason === 'not_an_approver' ||
    error.reason === 'approval_not_started'
  );
}
