// Botón de una acción del detalle. Solo las acciones conectadas (detail-actions.ts) funcionan; las
// demás se ven deshabilitadas y apuntan a la nota «se habilita pronto» cuando existe.
import type { Route } from 'next';
import Link from 'next/link';

import type { RequestAction, RequestStatus } from '@/modules/requests';
import { Button } from '@/ui/components/button';
import { cn } from '@/ui/lib/utils';
import { messages } from '@/ui/messages/es-PE';

import { CancelRequestDialog } from './cancel-request-dialog';
import { DecisionDialog } from './decision-dialog';
import { ResubmitButton } from './resubmit-button';
import { isActionEnabled, isImplemented } from './detail-actions';

const t = messages.requests.detail.actions;

const STYLE: Record<RequestAction, { variant: 'default' | 'outline'; className?: string }> = {
  edit_draft: { variant: 'default' },
  resubmit: { variant: 'default' },
  deliver: { variant: 'default' },
  approve: { variant: 'default', className: 'bg-success text-white hover:bg-success/90' },
  request_changes: { variant: 'outline' },
  reject: { variant: 'outline', className: 'border-danger/40 text-danger hover:text-danger' },
  cancel: { variant: 'outline' },
  correct_line: { variant: 'outline' },
  download_pdf: { variant: 'outline' },
};

export function ActionButton({
  action,
  requestId,
  readOnly,
  large = false,
  noteId,
  className,
  version,
  number = null,
  status,
  stepId = null,
}: {
  action: RequestAction;
  requestId: string;
  readOnly: boolean;
  /** El botón principal del panel mide 48 px; los demás, 44 px. */
  large?: boolean;
  /** Id de la nota «se habilita pronto»; solo lo usan las acciones aún sin conectar. */
  noteId?: string;
  className?: string;
  /** Versión y número del documento: «Anular» los necesita. */
  version?: number;
  number?: string | null;
  /** Estado del documento: «Editar» se llama «Editar solicitud» tras pedir cambios. */
  status?: RequestStatus;
  /** El paso pendiente del usuario: las decisiones lo necesitan. */
  stepId?: string | null;
}) {
  const style = STYLE[action];
  const size = large ? 'lg' : 'default';
  const classes = cn(style.className, className);

  if (isActionEnabled(action, readOnly) && action === 'edit_draft') {
    // Tras pedir cambios, lo principal es reenviar: «Editar solicitud» pasa a secundario.
    const variant = status === 'changes_requested' ? 'outline' : style.variant;
    return (
      <Button asChild variant={variant} size={size} className={classes}>
        <Link href={`/solicitudes/${requestId}/editar` as Route}>
          {status === 'changes_requested' ? t.edit_request : t[action]}
        </Link>
      </Button>
    );
  }
  if (isActionEnabled(action, readOnly) && action === 'cancel' && version !== undefined) {
    return (
      <CancelRequestDialog
        requestId={requestId}
        version={version}
        number={number}
        large={large}
        className={classes}
      />
    );
  }
  if (isActionEnabled(action, readOnly) && action === 'resubmit' && version !== undefined) {
    return (
      <ResubmitButton requestId={requestId} version={version} large={large} className={classes} />
    );
  }
  if (
    isActionEnabled(action, readOnly) &&
    (action === 'approve' || action === 'request_changes' || action === 'reject') &&
    version !== undefined &&
    stepId !== null
  ) {
    return (
      <DecisionDialog
        decision={action}
        requestId={requestId}
        version={version}
        stepId={stepId}
        number={number}
        trigger={
          <Button variant={style.variant} size={size} className={classes}>
            {t[action]}
          </Button>
        }
      />
    );
  }
  // aria-disabled (y no disabled): el botón recibe el foco y el lector de pantalla oye la nota. Sin
  // onClick, un clic no hace nada. En solo lectura, «Editar borrador» ya está explicado por el
  // aviso del layout: no se describe como «se habilita pronto».
  return (
    <Button
      type="button"
      variant={style.variant}
      size={size}
      className={cn(classes, 'aria-disabled:pointer-events-none aria-disabled:opacity-50')}
      aria-disabled="true"
      aria-describedby={isImplemented(action) ? undefined : noteId}
    >
      {t[action]}
    </Button>
  );
}
