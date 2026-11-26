// ApprovalCanceller vacío (E3-H5): anular deja el SOF en cancelled y no toca pasos de aprobación.
// E4-H2 lo reemplaza por el motor de aprobaciones (cierra los pasos pendientes y escribe el evento).
import type { ApprovalCanceller } from '../application/ports';

export const noopApprovalCanceller: ApprovalCanceller = {
  cancel: () => Promise.resolve(),
};
