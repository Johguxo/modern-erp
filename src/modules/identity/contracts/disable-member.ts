import { z } from 'zod';

export const inputSchema = z.object({
  membershipId: z.uuid(),
});

export const outputSchema = z.object({});
