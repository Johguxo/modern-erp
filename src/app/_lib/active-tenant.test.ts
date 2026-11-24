// E1-H2 · Cookie firmada active_tenant: atada al usuario de Auth y al tenant; cualquier
// manipulación devuelve null sin tocar la base.
import { describe, expect, it } from 'vitest';

import {
  ACTIVE_TENANT_COOKIE,
  activeTenantCookieOptions,
  signActiveTenant,
  verifyActiveTenant,
} from './active-tenant';

const SECRET = 'test-session-secret-0123456789abcdef';
const OTHER_SECRET = 'other-session-secret-0123456789abcd';
const AUTH_USER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER_AUTH_USER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const TENANT_A = '11111111-1111-4111-8111-111111111111';
const TENANT_B = '33333333-3333-4333-8333-333333333333';

const signed = () => signActiveTenant(SECRET, AUTH_USER, TENANT_A);

describe('cookie firmada active_tenant', () => {
  it('se llama active_tenant y tiene el formato v1.<tenantId>.<firma>', () => {
    expect(ACTIVE_TENANT_COOKIE).toBe('active_tenant');
    expect(signed()).toMatch(new RegExp(`^v1\\.${TENANT_A}\\.[A-Za-z0-9_-]{43}$`));
  });

  it('una cookie bien firmada para el mismo usuario devuelve el tenant', () => {
    expect(verifyActiveTenant(SECRET, AUTH_USER, signed())).toBe(TENANT_A);
  });

  it('firma alterada → null', () => {
    const value = signed();
    const last = value.at(-1) === 'A' ? 'B' : 'A';
    expect(verifyActiveTenant(SECRET, AUTH_USER, `${value.slice(0, -1)}${last}`)).toBeNull();
  });

  it('tenant cambiado conservando la firma → null', () => {
    const signature = signed().split('.')[2];
    expect(verifyActiveTenant(SECRET, AUTH_USER, `v1.${TENANT_B}.${signature}`)).toBeNull();
  });

  it('cookie de otro usuario de Auth (mismo navegador) → null', () => {
    expect(verifyActiveTenant(SECRET, OTHER_AUTH_USER, signed())).toBeNull();
  });

  it('firmada con otro secret → null', () => {
    const forged = signActiveTenant(OTHER_SECRET, AUTH_USER, TENANT_A);
    expect(verifyActiveTenant(SECRET, AUTH_USER, forged)).toBeNull();
  });

  it.each([
    ['sin firma', `v1.${TENANT_A}`],
    ['firma vacía', `v1.${TENANT_A}.`],
    ['partes de más', `${signActiveTenant(SECRET, AUTH_USER, TENANT_A)}.extra`],
    ['solo el tenant', TENANT_A],
    ['cadena vacía', ''],
    ['basura', 'not-a-cookie'],
    ['firma más corta', `v1.${TENANT_A}.abc`],
  ])('formato roto (%s) → null', (_label, value) => {
    expect(verifyActiveTenant(SECRET, AUTH_USER, value)).toBeNull();
  });

  it('versión desconocida (v2 con la firma correcta) → null', () => {
    const [, tenant, signature] = signed().split('.');
    expect(verifyActiveTenant(SECRET, AUTH_USER, `v2.${tenant}.${signature}`)).toBeNull();
  });

  it('tenant que no es UUID → null aunque esté bien firmado', () => {
    const value = signActiveTenant(SECRET, AUTH_USER, 'tenant-a');
    expect(verifyActiveTenant(SECRET, AUTH_USER, value)).toBeNull();
  });

  it('sin cookie (undefined) → null', () => {
    expect(verifyActiveTenant(SECRET, AUTH_USER, undefined)).toBeNull();
  });

  it('opciones: httpOnly, sameSite lax, path / y 30 días; secure solo con https', () => {
    expect(activeTenantCookieOptions('https://app.linkus.pe')).toEqual({
      httpOnly: true,
      sameSite: 'lax',
      secure: true,
      path: '/',
      maxAge: 60 * 60 * 24 * 30,
    });
    expect(activeTenantCookieOptions('http://localhost:3000').secure).toBe(false);
  });
});
