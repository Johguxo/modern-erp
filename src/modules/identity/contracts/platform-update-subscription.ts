import { z } from 'zod';

import { maxUsersSchema, planCodeSchema, SUBSCRIPTION_STATUSES } from './platform-shared';

export const inputSchema = z.object({
  tenantId: z.uuid(),
  planCode: planCodeSchema,
  status: z.enum(SUBSCRIPTION_STATUSES),
  maxUsers: maxUsersSchema,
});

export const outputSchema = z.object({ changed: z.boolean() });
