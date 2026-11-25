// Crear un borrador de SOF. Sin precios: el servidor los toma del catálogo.
import { draftFieldsSchema, requestViewSchema } from './shared';

export const inputSchema = draftFieldsSchema;
export const outputSchema = requestViewSchema;
