// Estado y resultado de un trabajo de importación (E2-H3).
import { z } from 'zod';

import {
  importKindSchema,
  importStatusSchema,
  importSummarySchema,
  rowErrorSchema,
} from './import';

export const inputSchema = z.object({ id: z.uuid() });

export const outputSchema = z.object({
  id: z.uuid(),
  kind: importKindSchema,
  status: importStatusSchema,
  /** Pendiente por más de 5 minutos: nadie lo tomó (se calcula al leer, no se guarda). */
  stalled: z.boolean(),
  /** Presente cuando el trabajo terminó bien. */
  summary: importSummarySchema.nullable(),
  /** Presente cuando falló: not_allowed, tenant_read_only, invalid_payload o unexpected. */
  failureReason: z.string().nullable(),
  /** Hasta 500 filas con error. */
  errors: z.array(rowErrorSchema),
  createdAt: z.string(),
  finishedAt: z.string().nullable(),
});
