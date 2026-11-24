// Listar centros de costo con búsqueda, estado y paginación.
import { listInputSchema, pageOutputSchema } from './shared';
import { costCenterViewSchema } from './views';

export const inputSchema = listInputSchema;
export const outputSchema = pageOutputSchema(costCenterViewSchema);
