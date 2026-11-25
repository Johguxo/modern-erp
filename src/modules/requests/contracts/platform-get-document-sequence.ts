// Secuencia del SOF de un cliente (consola de plataforma).
import { z } from 'zod';

import { sequenceViewSchema } from './shared';

export const inputSchema = z.object({ tenantId: z.uuid() });
export const outputSchema = sequenceViewSchema;
