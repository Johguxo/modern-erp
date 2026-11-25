// Editar un borrador propio con bloqueo optimista (`version`).
import { z } from 'zod';

import { draftFieldsSchema, requestViewSchema, versionSchema } from './shared';

export const inputSchema = draftFieldsSchema.extend({ id: z.uuid(), version: versionSchema });
export const outputSchema = requestViewSchema;
