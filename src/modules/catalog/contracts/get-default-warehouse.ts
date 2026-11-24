// Almacén por defecto del cliente (en el MVP hay uno solo).
import { z } from 'zod';

export const inputSchema = z.object({});

export const outputSchema = z.object({
  id: z.uuid(),
  code: z.string(),
  name: z.string(),
});
