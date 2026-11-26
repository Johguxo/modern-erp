// Regla pura de la barra fija del celular (E4-H2), separada del componente para probarla sin DOM.
import type { RequestAction, RequestDetail } from '@/modules/requests';

import { isActionEnabled } from './detail-actions';

/** Acciones que la barra reemplaza en el panel del celular. */
export const MOBILE_BAR_ACTIONS: readonly RequestAction[] = ['approve', 'reject'];

/** ¿Se muestra la barra? Hace falta poder aprobar y rechazar, un paso pendiente y no ser solo lectura. */
export function showsMobileBar(
  detail: Pick<RequestDetail, 'pendingStepId' | 'actions'>,
  readOnly: boolean,
): boolean {
  return (
    detail.pendingStepId !== null &&
    MOBILE_BAR_ACTIONS.every(
      (action) => detail.actions.includes(action) && isActionEnabled(action, readOnly),
    )
  );
}
