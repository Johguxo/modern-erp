// Proxy de Next.js 16 (antes middleware; runtime Node). Para cada request (ADR-006):
// 1) fija x-request-id; 2) refresca la sesión de Supabase; 3) protege las rutas: todo es privado
// salvo la lista pública. /api no redirige: route() responde 401 en JSON.
import { NextResponse, type NextRequest } from 'next/server';

import { cryptoIdGenerator } from '@/shared/adapters/crypto-id-generator';
import {
  refreshAuthSession,
  type CookieJar,
  type CookieToSet,
} from '@/shared/adapters/supabase-auth-provider';
import { REQUEST_ID_HEADER, resolveRequestId } from '@/shared/request-id';

const PUBLIC_PREFIXES = ['/login', '/recuperar', '/restablecer', '/invitacion', '/auth', '/api'];
/** Con sesión, estas pantallas mandan al destino del usuario. */
const SIGNED_OUT_ONLY = ['/login', '/recuperar'];

function matches(pathname: string, prefixes: readonly string[]): boolean {
  return prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export function isPublicPath(pathname: string): boolean {
  return matches(pathname, PUBLIC_PREFIXES);
}

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const requestId = resolveRequestId(request.headers.get(REQUEST_ID_HEADER), cryptoIdGenerator);
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(REQUEST_ID_HEADER, requestId);

  const pending: CookieToSet[] = [];
  const jar: CookieJar = {
    getAll: () => request.cookies.getAll().map(({ name, value }) => ({ name, value })),
    setAll: (list) => {
      for (const cookie of list) {
        request.cookies.set(cookie.name, cookie.value);
        pending.push(cookie);
      }
    },
  };

  const { hasSession } = await refreshAuthSession(jar);
  const { pathname } = request.nextUrl;

  let response: NextResponse;
  if (!hasSession && !isPublicPath(pathname)) {
    response = NextResponse.redirect(new URL('/login', request.url));
  } else if (hasSession && matches(pathname, SIGNED_OUT_ONLY)) {
    response = NextResponse.redirect(new URL('/auth/continuar', request.url));
  } else {
    // Las cookies refrescadas viajan en el request (para esta renderización) y en la respuesta.
    requestHeaders.set('cookie', request.cookies.toString());
    response = NextResponse.next({ request: { headers: requestHeaders } });
  }

  for (const { name, value, options } of pending) response.cookies.set(name, value, options);
  response.headers.set(REQUEST_ID_HEADER, requestId);
  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?)$).*)',
  ],
};
