// Vista previa de una importación (E2-H3): lee y valida el archivo completo sin guardar nada y
// devuelve los totales, las primeras filas y los errores.
import { z } from 'zod';

import { importKindSchema, importRowSchema, rowErrorSchema } from './import';

/** El archivo llega en FormData; el tipo y el tamaño los revisa el adaptador por sus bytes. */
export const inputSchema = z.object({ kind: importKindSchema, file: z.instanceof(File) });

export const outputSchema = z.object({
  kind: importKindSchema,
  /** Filas de datos del archivo (sin encabezado ni filas vacías). */
  total: z.number().int().nonnegative(),
  valid: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  /** Las primeras filas del archivo, tal como vienen. */
  rows: z.array(importRowSchema),
  /** Hasta 500 errores, en orden de fila. */
  errors: z.array(rowErrorSchema),
});
