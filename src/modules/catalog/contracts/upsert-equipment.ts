// Crear o actualizar un equipo.
import { z } from 'zod';

import { TYPE_MAX, codeSchema, nameSchema, optionalTextSchema, upsertOutputSchema } from './shared';
import { equipmentViewSchema } from './views';

export const inputSchema = z.object({
  /** Con id se actualiza; el código no cambia (se ignora el que venga). */
  id: z.uuid().optional(),
  code: codeSchema,
  name: nameSchema,
  type: optionalTextSchema(TYPE_MAX),
});

export const outputSchema = upsertOutputSchema(equipmentViewSchema);
