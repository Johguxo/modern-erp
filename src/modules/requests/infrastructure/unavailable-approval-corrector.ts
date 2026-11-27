// ApprovalCorrector por omisión: no hay motor conectado, así que corregir una línea falla en vez de
// fingir que se registró. La entrega (src/app/_lib/requests.ts) conecta `engine.corrector`.
import { ConflictError } from '@/shared/errors';

import type { ApprovalCorrector } from '../application/ports';

const unavailable = () =>
  Promise.reject(
    new ConflictError({
      reason: 'approval_not_started',
      message: 'No approval engine is connected to this composition',
    }),
  );

export const unavailableApprovalCorrector: ApprovalCorrector = {
  tolerance: unavailable,
  record: unavailable,
};
