// Secuencia de numeración del SOF del cliente activo.
import { z } from 'zod';

import { sequenceViewSchema } from './shared';

export const inputSchema = z.object({});
export const outputSchema = sequenceViewSchema;
