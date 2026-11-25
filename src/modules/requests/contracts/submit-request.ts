// Enviar a aprobación: asigna el número y deja el SOF en in_approval.
import { z } from 'zod';

import { requestViewSchema, versionSchema } from './shared';

export const inputSchema = z.object({ id: z.uuid(), version: versionSchema });
export const outputSchema = requestViewSchema;
