import { z } from 'zod';

import { emailSchema } from './members';

export const inputSchema = z.object({
  tenantId: z.uuid(),
  email: emailSchema,
});

export const outputSchema = z.object({
  invitationId: z.uuid(),
  emailSent: z.boolean(),
});
