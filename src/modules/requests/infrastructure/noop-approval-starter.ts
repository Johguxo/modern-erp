// ApprovalStarter vacío (E3-H1): enviar deja el SOF en in_approval y no crea pasos de aprobación.
// E4-H2 lo reemplaza por el motor de aprobaciones. «Enviar» no se publica en producción antes de eso.
import type { ApprovalStarter } from '../application/ports';

export const noopApprovalStarter: ApprovalStarter = {
  start: () => Promise.resolve(),
};
