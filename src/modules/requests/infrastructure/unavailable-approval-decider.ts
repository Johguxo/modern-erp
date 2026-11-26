// ApprovalDecider por omisión: no hay motor conectado, así que decidir falla en vez de fingir que
// se decidió. La entrega (src/app/_lib/requests.ts) conecta el motor de `approvals`.
import { ConflictError } from '@/shared/errors';

import type { ApprovalDecider } from '../application/ports';

export const unavailableApprovalDecider: ApprovalDecider = {
  decide: () =>
    Promise.reject(
      new ConflictError({
        reason: 'approval_not_started',
        message: 'No approval engine is connected to this composition',
      }),
    ),
};
