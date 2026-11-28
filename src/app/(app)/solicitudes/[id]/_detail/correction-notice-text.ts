// Texto del aviso de corrección (E4-H4), sin React. El flujo §4 decide si hay reconfirmación; el
// aviso solo lo cuenta: «solo esa línea vuelve a aprobación» o «las firmas se mantienen».
import type { CorrectionChange, CorrectionNotice, RequestStatus } from '@/modules/requests';
import { trimDecimal } from '@/ui/format/money';
import { messages } from '@/ui/messages/es-PE';

const t = messages.requests.detail.correction;

/** Cantidad sin ceros de más («2.000» es «2») y precio con al menos 2 decimales. */
function display(change: CorrectionChange, value: string | null): string | null {
  if (value === null) return null;
  if (change.field === 'quantity') return trimDecimal(value, 0);
  if (change.field === 'unitPrice') return trimDecimal(value, 2);
  return value;
}

function describeChange(change: CorrectionChange): string {
  if (change.field === 'notes') return t.changed.notes;
  const from = display(change, change.from);
  const to = display(change, change.to);
  return t.changed[change.field](from, to);
}

export interface CorrectionNoticeText {
  /** Lo que va en negrita: «Línea 3 corregida por Jhony P.». */
  readonly headline: string;
  readonly body: string;
}

export function correctionNoticeText(
  notice: CorrectionNotice,
  status: RequestStatus,
): CorrectionNoticeText {
  const what =
    notice.changeType === 'add'
      ? t.added
      : notice.changeType === 'remove'
        ? t.removed
        : notice.changes.map(describeChange).join(' ');
  const effect = notice.reconfirmation
    ? status === 'in_approval'
      ? t.reconfirmation
      : t.reconfirmed
    : t.signaturesKept;
  return {
    headline: t.headline(notice.lineNo, notice.actorName),
    body: [what, effect].filter((part) => part !== '').join(' '),
  };
}
