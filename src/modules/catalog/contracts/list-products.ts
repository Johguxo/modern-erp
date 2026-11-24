// Listar productos con búsqueda, estado y paginación.
import { listInputSchema, pageOutputSchema } from './shared';
import { productViewSchema } from './views';

export const inputSchema = listInputSchema;
export const outputSchema = pageOutputSchema(productViewSchema);
