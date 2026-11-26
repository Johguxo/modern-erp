// Anular un SOF: comentario obligatorio (se guarda y se muestra en la línea de tiempo).
import { z } from 'zod';

import { CANCEL_COMMENT_MAX } from '../domain/request';

import { requestViewSchema, versionSchema } from './shared';

export const inputSchema = z.object({
  id: z.uuid(),
  version: versionSchema,
  comment: z.string().trim().min(1).max(CANCEL_COMMENT_MAX),
});
export const outputSchema = requestViewSchema;
