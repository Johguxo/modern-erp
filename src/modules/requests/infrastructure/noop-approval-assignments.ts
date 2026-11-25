// ApprovalAssignments vacío (E3-H3): sin motor de aprobaciones nadie tiene solicitudes asignadas.
// E4-H2 lo reemplaza por el motor; hasta entonces «Esperan mi aprobación» muestra 0.
import type { ApprovalAssignments } from '../application/ports';

export const noopApprovalAssignments: ApprovalAssignments = {
  assignedRequestIds: () => Promise.resolve([]),
  pendingRequestIds: () => Promise.resolve([]),
};
