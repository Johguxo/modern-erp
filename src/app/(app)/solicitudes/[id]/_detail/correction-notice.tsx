// Aviso naranja de la última corrección (DetalleSOF.dc.html, líneas 44-48): `role="status"` y los
// tokens warning. El texto sale de una función pura (correction-notice-text.ts).
import type { CorrectionNotice as CorrectionNoticeView, RequestStatus } from '@/modules/requests';

import { correctionNoticeText } from './correction-notice-text';

export function CorrectionNotice({
  notice,
  status,
}: {
  notice: CorrectionNoticeView;
  status: RequestStatus;
}) {
  const { headline, body } = correctionNoticeText(notice, status);
  return (
    <div
      role="status"
      className="rounded-[10px] border border-warning-border bg-warning-bg px-4 py-3.5 text-sm text-warning-text"
    >
      <strong>{headline}</strong> {body}
    </div>
  );
}
