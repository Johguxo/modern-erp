// ApprovalHistory vacío: sin motor de aprobaciones no hay decisiones. Solo para pruebas; la entrega
// conecta el motor de `approvals`.
import type { ApprovalHistory } from '../application/ports';

export const noopApprovalHistory: ApprovalHistory = {
  latestDecision: () => Promise.resolve(null),
};
