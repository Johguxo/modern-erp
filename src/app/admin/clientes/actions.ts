'use server';

// Acciones de la consola (E1-H4): solo SuperAdmins (platformAction); cada caso de uso vuelve a
// revisar platform_admins en su transacción y audita.
import { createTenant, inviteTenantAdmin, updateSubscription } from '@/modules/identity';
import {
  platformInviteTenantAdminContract,
  platformUpdateSubscriptionContract,
} from '@/modules/identity/contracts';
import { platformUpdateDocumentSequence } from '@/modules/requests';
import { platformUpdateDocumentSequenceContract } from '@/modules/requests/contracts';

import { platformDeps } from '../../_lib/platform';
import { platformAction } from '../../_lib/platform-action';
import { platformSequenceDeps } from '../../_lib/requests';

import * as createTenantContract from './create-tenant-contract';

// El alta recibe además el prefijo y el correlativo inicial del SOF: van al paso de alta de la secuencia.
export const createTenantAction = platformAction(
  createTenantContract,
  ({ ctx, input, shared }) => {
    const { sequencePrefix, sequenceNextNumber, ...tenant } = input;
    return createTenant(
      ctx,
      tenant,
      platformDeps(shared, {
        sequence: { prefix: sequencePrefix, nextNumber: sequenceNextNumber },
      }),
    );
  },
  { name: 'platform.createTenant' },
);

export const updateDocumentSequenceAction = platformAction(
  platformUpdateDocumentSequenceContract,
  ({ ctx, input, shared }) =>
    platformUpdateDocumentSequence(
      ctx,
      {
        tenantId: input.tenantId,
        prefix: input.sequencePrefix,
        nextNumber: input.sequenceNextNumber,
      },
      platformSequenceDeps(shared),
    ),
  { name: 'platform.updateDocumentSequence' },
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
