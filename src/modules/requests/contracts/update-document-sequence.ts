// Cambiar el prefijo y el siguiente número del SOF (no puede bajar del último emitido).
import { sequenceSetupFieldsSchema, sequenceUpdateOutputSchema } from './shared';

export const inputSchema = sequenceSetupFieldsSchema;
export const outputSchema = sequenceUpdateOutputSchema;
