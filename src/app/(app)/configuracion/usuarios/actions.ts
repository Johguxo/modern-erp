'use server';

// Acciones de /configuracion/usuarios (E1-H3): validan con los contratos de identity y llaman al
// caso de uso; el permiso users.manage se revisa aquí y otra vez en el caso de uso.
import {
  cancelInvitation,
  createUserAdminDeps,
  disableMember,
  inviteUser,
  reactivateMember,
  resendInvitation,
  updateMemberRoles,
} from '@/modules/identity';
import {
  cancelInvitationContract,
  disableMemberContract,
  inviteUserContract,
  reactivateMemberContract,
  resendInvitationContract,
  updateMemberRolesContract,
} from '@/modules/identity/contracts';

import { action } from '../../../_lib/action';
import { userAdminExtras } from '../../../_lib/user-admin';

export const inviteUserAction = action(
  inviteUserContract,
  'users.manage',
  ({ ctx, input, tx, shared }) =>
    inviteUser(ctx, input, createUserAdminDeps(tx, userAdminExtras(shared))),
  { name: 'identity.inviteUser' },
);

export const resendInvitationAction = action(
  resendInvitationContract,
  'users.manage',
  ({ ctx, input, tx, shared }) =>
    resendInvitation(ctx, input, createUserAdminDeps(tx, userAdminExtras(shared))),
  { name: 'identity.resendInvitation' },
);

export const cancelInvitationAction = action(
  cancelInvitationContract,
  'users.manage',
  ({ ctx, input, tx, shared }) =>
    cancelInvitation(ctx, input, createUserAdminDeps(tx, userAdminExtras(shared))),
  { name: 'identity.cancelInvitation' },
);

export const updateMemberRolesAction = action(
  updateMemberRolesContract,
  'users.manage',
  ({ ctx, input, tx, shared }) =>
    updateMemberRoles(ctx, input, createUserAdminDeps(tx, userAdminExtras(shared))),
  { name: 'identity.updateMemberRoles' },
);

export const disableMemberAction = action(
  disableMemberContract,
  'users.manage',
  ({ ctx, input, tx, shared }) =>
    disableMember(ctx, input, createUserAdminDeps(tx, userAdminExtras(shared))),
  { name: 'identity.disableMember' },
);

export const reactivateMemberAction = action(
  reactivateMemberContract,
  'users.manage',
  ({ ctx, input, tx, shared }) =>
    reactivateMember(ctx, input, createUserAdminDeps(tx, userAdminExtras(shared))),
  { name: 'identity.reactivateMember' },
);
