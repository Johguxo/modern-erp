// Cambiar el prefijo y el siguiente número del SOF de un cliente (consola de plataforma).
import { z } from 'zod';

import { sequenceSetupFieldsSchema, sequenceUpdateOutputSchema } from './shared';

export const inputSchema = sequenceSetupFieldsSchema.extend({ tenantId: z.uuid() });
export const outputSchema = sequenceUpdateOutputSchema;
