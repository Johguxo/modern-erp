import { z } from 'zod';

import { emailSchema, rolesSchema } from './members';

export const inputSchema = z.object({
  email: emailSchema,
  roles: rolesSchema,
});

/** `emailSent` se conoce después del commit (si el correo falla, la invitación queda creada). */
export const outputSchema = z.object({
  invitationId: z.uuid(),
  emailSent: z.boolean(),
});
