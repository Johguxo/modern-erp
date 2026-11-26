// Barra fija inferior del celular (MovilAprobar.dc.html): Rechazar y Aprobar siempre a mano para el
// aprobador. Solo aparece bajo `md`; desde `md` las mismas acciones viven en el panel de la línea de
// tiempo. La página reserva espacio al final (MOBILE_BAR_SPACE) para que no tape contenido.
import type { RequestAction, RequestDetail } from '@/modules/requests';
import { Button } from '@/ui/components/button';
import { messages } from '@/ui/messages/es-PE';

import { isActionEnabled } from './detail-actions';
import { DecisionDialog } from './decision-dialog';

const t = messages.requests.detail.actions;

/** Relleno inferior de la página (alto de la barra) mientras la barra se ve en el celular. */
export const MOBILE_BAR_SPACE = 'pb-28 md:pb-0';

/** Acciones que la barra reemplaza en el panel del celular. */
export const MOBILE_BAR_ACTIONS: readonly RequestAction[] = ['approve', 'reject'];

/** ¿Se muestra la barra? Hace falta poder aprobar y rechazar, un paso pendiente y no ser solo lectura. */
export function showsMobileBar(detail: RequestDetail, readOnly: boolean): boolean {
  return (
    detail.pendingStepId !== null &&
    MOBILE_BAR_ACTIONS.every(
      (action) => detail.actions.includes(action) && isActionEnabled(action, readOnly),
    )
  );
}

export function MobileDecisionBar({ detail }: { detail: RequestDetail }) {
  const { pendingStepId } = detail;
  if (pendingStepId === null) return null;
  const shared = {
    requestId: detail.id,
    version: detail.version,
    stepId: pendingStepId,
    number: detail.number,
  };
  return (
    <div
      role="group"
      aria-label={t.label}
      className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-2 gap-2.5 border-t border-border bg-surface px-5 pt-4 pb-7 md:hidden"
    >
      <DecisionDialog
        {...shared}
        decision="reject"
        trigger={
          <Button
            variant="outline"
            className="min-h-[52px] rounded-xl border-danger/40 text-base font-semibold text-danger hover:text-danger"
          >
            {t.reject}
          </Button>
        }
      />
      <DecisionDialog
        {...shared}
        decision="approve"
        trigger={
          <Button className="min-h-[52px] rounded-xl bg-success text-base font-semibold text-white hover:bg-success/90">
            {t.approve}
          </Button>
        }
      />
    </div>
  );
}
