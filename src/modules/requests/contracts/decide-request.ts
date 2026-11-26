// Decidir un SOF: aprobar, pedir cambios o rechazar el paso que el usuario vio pendiente. El
// comentario es obligatorio al rechazar y al pedir cambios (el caso de uso lo revisa).
import { z } from 'zod';

import { DECISION_COMMENT_MAX, DECISION_KINDS, DECISION_OUTCOMES } from '../domain/decision';

import { requestViewSchema, versionSchema } from './shared';

export const inputSchema = z.object({
  id: z.uuid(),
  version: versionSchema,
  stepId: z.uuid(),
  decision: z.enum(DECISION_KINDS),
  comment: z.string().trim().max(DECISION_COMMENT_MAX).nullable().default(null),
});
export const outputSchema = requestViewSchema.extend({ outcome: z.enum(DECISION_OUTCOMES) });
