// ApprovalStarter vacío: enviar deja el SOF en in_approval y no crea pasos de aprobación. Solo para
// pruebas que no ejercitan la aprobación; la entrega (src/app/_lib/requests.ts) conecta el motor de
// `approvals` y nunca debe usar este.
import type { ApprovalStarter } from '../application/ports';

export const noopApprovalStarter: ApprovalStarter = {
  start: () => Promise.resolve({ round: 1 }),
};
