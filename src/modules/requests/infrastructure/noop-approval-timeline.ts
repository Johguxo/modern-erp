// ApprovalTimeline vacío: sin motor de aprobaciones no hay instancia y el detalle usa la línea
// derivada de las fechas del documento. Solo para pruebas; la entrega conecta el motor de `approvals`.
import type { ApprovalTimeline } from '../application/ports';

export const noopApprovalTimeline: ApprovalTimeline = {
  getTimeline: () => Promise.resolve(null),
};
