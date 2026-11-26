// ApprovalAssignments vacío: sin motor de aprobaciones nadie tiene solicitudes asignadas. Solo para
// pruebas; la entrega conecta el motor de `approvals`.
import type { ApprovalAssignments } from '../application/ports';

export const noopApprovalAssignments: ApprovalAssignments = {
  assignedRequestIds: () => Promise.resolve([]),
  isAssigned: () => Promise.resolve(false),
  pendingRequestIds: () => Promise.resolve([]),
  pendingStepId: () => Promise.resolve(null),
};
