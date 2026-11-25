// Confirmar una importación (E2-H3): el servidor vuelve a leer el archivo (no confía en filas que
// mande el cliente), guarda las filas sin validar en el trabajo y lo encola para el worker.
import { z } from 'zod';

import { importKindSchema } from './import';

export const inputSchema = z.object({ kind: importKindSchema, file: z.instanceof(File) });

export const outputSchema = z.object({
  jobId: z.uuid(),
  /** false si no se pudo encolar: el trabajo queda pendiente y se muestra como "no se pudo iniciar". */
  queued: z.boolean(),
});
