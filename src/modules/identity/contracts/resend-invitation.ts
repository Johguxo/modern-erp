import { z } from 'zod';

export const inputSchema = z.object({
  invitationId: z.uuid(),
});

export const outputSchema = z.object({
  emailSent: z.boolean(),
});
