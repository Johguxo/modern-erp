// Sesión del request (ADR-006): usuario de Auth validado + empresa activa (cookie firmada) →
// Ctx. Las lecturas van por identity con getDbAdmin acotado (aún no hay tenant para RLS).
import { cookies, headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { cache } from 'react';

import { getEnv } from '@/env';
import { createSessionServices, resolveEntry, resolveTenantSession } from '@/modules/identity';
import { cryptoIdGenerator } from '@/shared/adapters/crypto-id-generator';
import type { Ctx } from '@/shared/context';
import { REQUEST_ID_HEADER, resolveRequestId } from '@/shared/request-id';

import { ACTIVE_TENANT_COOKIE, verifyActiveTenant } from './active-tenant';
import { getAuthProvider } from './auth';
import type { CtxResolver } from './ctx-resolver';

export type SessionState =
  | { readonly status: 'anonymous' }
  | { readonly status: 'no_tenant'; readonly authUserId: string; readonly email: string }
  | { readonly status: 'ok'; readonly ctx: Ctx; readonly email: string };

async function loadSessionState(requestId: string): Promise<SessionState> {
  const session = await (await getAuthProvider()).getSession();
  if (!session) return { status: 'anonymous' };

  const store = await cookies();
  const tenantId = verifyActiveTenant(
    getEnv().SESSION_SECRET,
    session.authUserId,
    store.get(ACTIVE_TENANT_COOKIE)?.value,
  );
  if (!tenantId) return { status: 'no_tenant', ...session };

  const ctx = await resolveTenantSession(
    { authUserId: session.authUserId, tenantId, requestId },
    createSessionServices(),
  );
  return ctx ? { status: 'ok', ctx, email: session.email } : { status: 'no_tenant', ...session };
}

async function currentRequestId(): Promise<string> {
  return resolveRequestId((await headers()).get(REQUEST_ID_HEADER), cryptoIdGenerator);
}

/** Estado de sesión, una vez por request (Server Components). */
export const getSessionState = cache(async (): Promise<SessionState> => {
  return loadSessionState(await currentRequestId());
});

/** Para páginas y layouts de (app): sin sesión → /login; sin empresa válida → /auth/continuar. */
export async function requireCtx(): Promise<{ ctx: Ctx; email: string }> {
  const state = await getSessionState();
  if (state.status === 'anonymous') redirect('/login');
  if (state.status === 'no_tenant') redirect('/auth/continuar');
  return { ctx: state.ctx, email: state.email };
}

/** Para /admin: sin sesión → /login; si no es SuperAdmin → 404 (no revela que existe). */
export async function requirePlatformAdmin(): Promise<{ email: string }> {
  const session = await (await getAuthProvider()).getSession();
  if (!session) redirect('/login');
  const { access } = await resolveEntry(session.authUserId, createSessionServices());
  if (!access.isPlatformAdmin) notFound();
  return { email: session.email };
}

/** Resolver de action() y route(): el ctx del request o null (sin sesión o sin empresa). */
export const sessionCtxResolver: CtxResolver = async ({ requestId }) => {
  const state = await loadSessionState(requestId);
  return state.status === 'ok' ? state.ctx : null;
};
