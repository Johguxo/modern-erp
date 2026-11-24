import { z } from 'zod';

import { emailSchema } from './members';
import { CURRENCIES, maxUsersSchema, planCodeSchema, slugSchema } from './platform-shared';

export const inputSchema = z.object({
  name: z.string().trim().min(2).max(120),
  slug: slugSchema,
  planCode: planCodeSchema,
  maxUsers: maxUsersSchema,
  currency: z.enum(CURRENCIES),
  adminEmail: emailSchema,
});

/** `emailSent` se conoce después del commit (si el correo falla, la invitación queda creada). */
export const outputSchema = z.object({
  tenantId: z.uuid(),
  invitationId: z.uuid(),
  emailSent: z.boolean(),
});
