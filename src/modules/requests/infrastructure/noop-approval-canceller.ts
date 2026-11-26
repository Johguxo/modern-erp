// ApprovalCanceller vacío: anular deja el SOF en cancelled y no toca pasos de aprobación. Solo para
// pruebas; la entrega conecta el motor de `approvals` (cierra los pasos y escribe el evento).
import type { ApprovalCanceller } from '../application/ports';

export const noopApprovalCanceller: ApprovalCanceller = {
  cancel: () => Promise.resolve(),
};
