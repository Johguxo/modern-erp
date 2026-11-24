// Listar equipos con búsqueda, estado y paginación.
import { listInputSchema, pageOutputSchema } from './shared';
import { equipmentViewSchema } from './views';

export const inputSchema = listInputSchema;
export const outputSchema = pageOutputSchema(equipmentViewSchema);
