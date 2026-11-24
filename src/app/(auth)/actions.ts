'use server';

// Acciones de la sesión (ADR-006): sin ctx; validan con los contratos de identity.
import { cookies } from 'next/headers';

import { getEnv } from '@/env';
import {
  createSessionServices,
  requestPasswordReset,
  resetPassword,
  resolveEntry,
  signIn,
} from '@/modules/identity';
import {
  requestPasswordResetContract,
  resetPasswordContract,
  selectTenantContract,
  signInContract,
  signOutContract,
} from '@/modules/identity/contracts';
import { ForbiddenError, UnauthenticatedError } from '@/shared/errors';

import {
  ACTIVE_TENANT_COOKIE,
  activeTenantCookieOptions,
  signActiveTenant,
} from '../_lib/active-tenant';
import { getAuthProvider } from '../_lib/auth';
import { publicAction } from '../_lib/public-action';

export const signInAction = publicAction(
  signInContract,
  async ({ input }) => signIn(input, { auth: await getAuthProvider() }),
  { name: 'auth.signIn' },
);

export const requestPasswordResetAction = publicAction(
  requestPasswordResetContract,
  async ({ input, logger }) =>
    requestPasswordReset(input, { auth: await getAuthProvider(), logger }),
  { name: 'auth.requestPasswordReset' },
);

export const resetPasswordAction = publicAction(
  resetPasswordContract,
  async ({ input }) => resetPassword(input, { auth: await getAuthProvider() }),
  { name: 'auth.resetPassword' },
);

/** Fija la empresa activa si el usuario tiene membresía activa en ella. */
export const selectTenantAction = publicAction(
  selectTenantContract,
  async ({ input }) => {
    const session = await (await getAuthProvider()).getSession();
    if (!session) throw new UnauthenticatedError();
    const { access } = await resolveEntry(session.authUserId, createSessionServices());
    if (!access.memberships.some((m) => m.tenantId === input.tenantId)) {
      throw new ForbiddenError({ message: 'No active membership in tenant' });
    }
    const env = getEnv();
    (await cookies()).set(
      ACTIVE_TENANT_COOKIE,
      signActiveTenant(env.SESSION_SECRET, session.authUserId, input.tenantId),
      activeTenantCookieOptions(env.APP_URL),
    );
    return {};
  },
  { name: 'auth.selectTenant' },
);

/** Cierra la sesión de este navegador y olvida la empresa activa. */
export const signOutAction = publicAction(
  signOutContract,
  async () => {
    (await cookies()).delete(ACTIVE_TENANT_COOKIE);
    await (await getAuthProvider()).signOut('local');
    return {};
  },
  { name: 'auth.signOut' },
);
