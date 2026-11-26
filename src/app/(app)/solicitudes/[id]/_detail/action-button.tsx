// Botón de una acción del detalle. Solo las acciones conectadas (detail-actions.ts) funcionan; las
// demás se ven deshabilitadas y apuntan a la nota «se habilita pronto» cuando existe.
import type { Route } from 'next';
import Link from 'next/link';

import type { RequestAction } from '@/modules/requests';
import { Button } from '@/ui/components/button';
import { cn } from '@/ui/lib/utils';
import { messages } from '@/ui/messages/es-PE';

import { isActionEnabled } from './detail-actions';

const t = messages.requests.detail.actions;

const STYLE: Record<RequestAction, { variant: 'default' | 'outline'; className?: string }> = {
  edit_draft: { variant: 'default' },
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
}: {
  action: RequestAction;
  requestId: string;
  readOnly: boolean;
  /** El botón principal del panel mide 48 px; los demás, 44 px. */
  large?: boolean;
  /** Id de la nota «se habilita pronto», si se muestra. */
  noteId?: string;
  className?: string;
}) {
  const style = STYLE[action];
  const size = large ? 'lg' : 'default';
  const classes = cn(style.className, className);

  if (isActionEnabled(action, readOnly) && action === 'edit_draft') {
    return (
      <Button asChild variant={style.variant} size={size} className={classes}>
        <Link href={`/solicitudes/${requestId}/editar` as Route}>{t[action]}</Link>
      </Button>
    );
  }
  return (
    <Button
      type="button"
      variant={style.variant}
      size={size}
      className={classes}
      disabled
      aria-describedby={noteId}
    >
      {t[action]}
    </Button>
  );
}
