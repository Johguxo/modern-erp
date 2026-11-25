// Vista previa de una importación (E2-H3): lee y valida el archivo completo sin guardar nada y
// devuelve los totales, las primeras filas y los errores.
import { z } from 'zod';

import { importKindSchema, importRowSchema, importRowsInputSchema, rowErrorSchema } from './import';

/**
 * Las filas ya extraídas del archivo: la acción web lee el archivo (FormData) antes de abrir la
 * transacción y llama a la acción interna con esto.
 */
export const inputSchema = z.object({ kind: importKindSchema, rows: importRowsInputSchema });

export const outputSchema = z.object({
  kind: importKindSchema,
  /** Filas de datos del archivo (sin encabezado ni filas vacías). */
  total: z.number().int().nonnegative(),
  valid: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  /** Las primeras filas del archivo, tal como vienen. */
  rows: z.array(importRowSchema),
  /** Todos los errores encontrados (la lista de abajo trae solo los primeros). */
  errorsTotal: z.number().int().nonnegative(),
  /** Hasta 500 errores, en orden de fila. */
  errors: z.array(rowErrorSchema),
});
