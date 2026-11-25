// Confirmar una importación (E2-H3): el servidor lee el archivo (el cliente nunca manda filas),
// guarda las filas sin validar en el trabajo y lo encola para el worker.
import { z } from 'zod';

import { importKindSchema, importRowsInputSchema } from './import';

export const inputSchema = z.object({ kind: importKindSchema, rows: importRowsInputSchema });

export const outputSchema = z.object({
  jobId: z.uuid(),
  /** false si no se pudo encolar: el trabajo queda pendiente y se muestra como "no se pudo iniciar". */
  queued: z.boolean(),
});
