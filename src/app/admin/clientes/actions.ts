'use server';

// Acciones de la consola (E1-H4): solo SuperAdmins (platformAction); cada caso de uso vuelve a
// revisar platform_admins en su transacción y audita.
import { createTenant, inviteTenantAdmin, updateSubscription } from '@/modules/identity';
import {
  platformCreateTenantContract,
  platformInviteTenantAdminContract,
  platformUpdateSubscriptionContract,
} from '@/modules/identity/contracts';

import { platformDeps } from '../../_lib/platform';
import { platformAction } from '../../_lib/platform-action';

export const createTenantAction = platformAction(
  platformCreateTenantContract,
  ({ ctx, input, shared }) => createTenant(ctx, input, platformDeps(shared)),
  { name: 'platform.createTenant' },
);

export const updateSubscriptionAction = platformAction(
  platformUpdateSubscriptionContract,
  ({ ctx, input, shared }) => updateSubscription(ctx, input, platformDeps(shared)),
  { name: 'platform.updateSubscription' },
);

export const inviteTenantAdminAction = platformAction(
  platformInviteTenantAdminContract,
  ({ ctx, input, shared }) => inviteTenantAdmin(ctx, input, platformDeps(shared)),
  { name: 'platform.inviteTenantAdmin' },
);
