// Destino tras el login (ADR-006): un solo camino. Decide según las membresías activas:
// una → fija la empresa activa y va a /bandeja; varias → /elegir-empresa; ninguna y SuperAdmin →
// /admin; si no, cierra la sesión y vuelve a /login con el aviso de "sin acceso".
import { cookies } from 'next/headers';
import { NextResponse, type NextRequest } from 'next/server';

import { getEnv } from '@/env';
import { createSessionServices, resolveEntry } from '@/modules/identity';

import {
  ACTIVE_TENANT_COOKIE,
  activeTenantCookieOptions,
  signActiveTenant,
} from '../../_lib/active-tenant';
import { getAuthProvider } from '../../_lib/auth';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const to = (path: string) => NextResponse.redirect(new URL(path, request.url));
  const auth = await getAuthProvider();
  const session = await auth.getSession();
  if (!session) return to('/login');

  const { decision } = await resolveEntry(session.authUserId, createSessionServices());
  const store = await cookies();
  switch (decision.kind) {
    case 'tenant': {
      const env = getEnv();
      store.set(
        ACTIVE_TENANT_COOKIE,
        signActiveTenant(env.SESSION_SECRET, session.authUserId, decision.tenantId),
        activeTenantCookieOptions(env.APP_URL),
      );
      return to('/bandeja');
    }
    case 'choose':
      return to('/elegir-empresa');
    case 'platform':
      return to('/admin');
    case 'no_access':
      store.delete(ACTIVE_TENANT_COOKIE);
      await auth.signOut('local');
      return to('/login?error=sin-acceso');
  }
}
