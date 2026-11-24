import { z } from 'zod';

import { rolesSchema } from './members';

export const inputSchema = z.object({
  membershipId: z.uuid(),
  roles: rolesSchema,
});

export const outputSchema = z.object({});
