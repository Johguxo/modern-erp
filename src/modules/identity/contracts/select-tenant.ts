import { z } from 'zod';

export const inputSchema = z.object({
  tenantId: z.uuid(),
});

export const outputSchema = z.object({});
