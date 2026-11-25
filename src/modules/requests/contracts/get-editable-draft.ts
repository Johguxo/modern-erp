// Leer un borrador propio para editarlo (E3-H2): solo el solicitante y solo en borrador.
import { z } from 'zod';

import { requestViewSchema } from './shared';

export const inputSchema = z.object({ id: z.uuid() });
export const outputSchema = requestViewSchema;
