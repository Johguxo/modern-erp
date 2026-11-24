// E1-H2 · src/proxy.ts protege (app) y admin: sin sesión redirige a /login; /api no redirige;
// con sesión, /login lleva al destino del usuario.
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const refreshAuthSession = vi.fn<() => Promise<{ hasSession: boolean }>>();

vi.mock('@/shared/adapters/supabase-auth-provider', () => ({
  refreshAuthSession: () => refreshAuthSession(),
}));

const { isPublicPath, proxy } = await import('./proxy');

const BASE = 'http://localhost:3000';

beforeEach(() => {
  refreshAuthSession.mockReset();
});

describe('isPublicPath', () => {
  it.each([
    '/login',
    '/recuperar',
    '/restablecer',
    '/invitacion/abc123',
    '/invitacion',
    '/auth/continuar',
    '/api/v1/things',
    '/api',
  ])('%s es pública', (path) => {
    expect(isPublicPath(path)).toBe(true);
  });

  it.each(['/loginx', '/login-falso', '/administrar', '/apiv1', '/authx', '/recuperarme'])(
    'prefijo falso %s no es público',
    (path) => {
      expect(isPublicPath(path)).toBe(false);
    },
  );

  it.each(['/', '/bandeja', '/admin', '/admin/clientes', '/elegir-empresa', '/configuracion'])(
    '%s es privada',
    (path) => {
      expect(isPublicPath(path)).toBe(false);
    },
  );
});

describe('proxy', () => {
  it.each(['/bandeja', '/admin', '/elegir-empresa', '/'])(
    'protege %s: sin sesión redirige a /login',
    async (path) => {
      refreshAuthSession.mockResolvedValue({ hasSession: false });

      const response = await proxy(new NextRequest(`${BASE}${path}`));

      expect(response.status).toBe(307);
      expect(response.headers.get('location')).toBe(`${BASE}/login`);
    },
  );

  it('sin sesión /api/v1/x no redirige (route() responde 401 en JSON)', async () => {
    refreshAuthSession.mockResolvedValue({ hasSession: false });

    const response = await proxy(new NextRequest(`${BASE}/api/v1/x`));

    expect(response.headers.get('location')).toBeNull();
    expect(response.headers.get('x-middleware-next')).toBe('1');
  });

  it('sin sesión /login pasa', async () => {
    refreshAuthSession.mockResolvedValue({ hasSession: false });

    const response = await proxy(new NextRequest(`${BASE}/login`));

    expect(response.headers.get('location')).toBeNull();
  });

  it.each(['/login', '/recuperar'])('con sesión %s lleva a /auth/continuar', async (path) => {
    refreshAuthSession.mockResolvedValue({ hasSession: true });

    const response = await proxy(new NextRequest(`${BASE}${path}`));

    expect(response.headers.get('location')).toBe(`${BASE}/auth/continuar`);
  });

  it('con sesión /restablecer pasa (el canje del token deja la sesión iniciada)', async () => {
    refreshAuthSession.mockResolvedValue({ hasSession: true });

    const response = await proxy(new NextRequest(`${BASE}/restablecer?token_hash=x`));

    expect(response.headers.get('location')).toBeNull();
  });

  it('la redirección no usa ?next= ni otro host: siempre /login del mismo origen', async () => {
    refreshAuthSession.mockResolvedValue({ hasSession: false });

    const response = await proxy(
      new NextRequest(`${BASE}/bandeja?next=https://evil.example/phish`),
    );

    expect(response.headers.get('location')).toBe(`${BASE}/login`);
  });

  it('fija x-request-id: respeta uno válido y genera uno si es inseguro', async () => {
    refreshAuthSession.mockResolvedValue({ hasSession: true });

    const kept = await proxy(
      new NextRequest(`${BASE}/bandeja`, { headers: { 'x-request-id': 'req-abc-12345' } }),
    );
    const generated = await proxy(
      new NextRequest(`${BASE}/bandeja`, { headers: { 'x-request-id': 'bad id\n' } }),
    );

    expect(kept.headers.get('x-request-id')).toBe('req-abc-12345');
    expect(generated.headers.get('x-request-id')).toMatch(/^[0-9a-f-]{36}$/);
  });
});
