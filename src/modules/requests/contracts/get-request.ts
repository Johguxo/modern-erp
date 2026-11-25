// Leer una solicitud con sus líneas.
import { z } from 'zod';

import { requestViewSchema } from './shared';

export const inputSchema = z.object({ id: z.uuid() });
export const outputSchema = requestViewSchema;
