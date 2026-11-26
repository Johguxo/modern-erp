// Barra fija inferior del celular (MovilAprobar.dc.html): Rechazar y Aprobar siempre a mano para el
// aprobador. Solo aparece bajo `md`; desde `md` las mismas acciones viven en el panel de la línea de
// tiempo. La página reserva espacio al final (MOBILE_BAR_SPACE) para que no tape contenido.
import type { RequestDetail } from '@/modules/requests';
import { Button } from '@/ui/components/button';
import { messages } from '@/ui/messages/es-PE';

import { DecisionDialog } from './decision-dialog';

const t = messages.requests.detail.actions;

/** Relleno inferior de la página (alto de la barra) mientras la barra se ve en el celular. */
export const MOBILE_BAR_SPACE = 'pb-28 md:pb-0';

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
      aria-label={t.decisionLabel}
      className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-2 gap-2.5 border-t border-border bg-surface px-5 pt-4 pb-[max(1.75rem,env(safe-area-inset-bottom))] md:hidden"
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
