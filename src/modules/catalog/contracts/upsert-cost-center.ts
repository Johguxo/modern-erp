// Crear o actualizar un centro de costo.
import { z } from 'zod';

import { codeSchema, nameSchema, upsertOutputSchema } from './shared';
import { costCenterViewSchema } from './views';

export const inputSchema = z.object({
  /** Con id se actualiza; el código no cambia (se ignora el que venga). */
  id: z.uuid().optional(),
  code: codeSchema,
  name: nameSchema,
});

export const outputSchema = upsertOutputSchema(costCenterViewSchema);
