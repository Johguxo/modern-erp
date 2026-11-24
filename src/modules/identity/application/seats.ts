// Traduce el UserCapacity de Entitlements en el error que ve el usuario (E1-H3).
import { ForbiddenError, LimitExceededError } from '@/shared/errors';

import type { UserCapacity } from '../domain/entitlements';

export function assertCanAddUser(capacity: UserCapacity): void {
  if (capacity.allowed) return;
  switch (capacity.reason) {
    case 'read_only':
      throw new ForbiddenError({ reason: 'tenant_read_only', message: 'Tenant is read-only' });
    case 'no_subscription':
      throw new ForbiddenError({ reason: 'no_subscription', message: 'No current subscription' });
    default:
      throw new LimitExceededError({
        reason: 'max_users',
        params: { max: capacity.limit ?? 0 },
        message: `User limit reached (${capacity.used}/${String(capacity.limit)})`,
      });
  }
}
