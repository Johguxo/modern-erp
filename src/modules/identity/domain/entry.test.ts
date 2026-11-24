// E1-H2 · Destino tras el login según las membresías activas.
import { describe, expect, it } from 'vitest';

import { decideEntry, type EntryAccess } from './entry';

const USER = { id: 'user-1', email: 'ana@genrent.pe' };
const A = { tenantId: '11111111-1111-4111-8111-111111111111', tenantName: 'Alfa' };
const B = { tenantId: '33333333-3333-4333-8333-333333333333', tenantName: 'Beta' };

const access = (overrides: Partial<EntryAccess> = {}): EntryAccess => ({
  user: USER,
  memberships: [],
  isPlatformAdmin: false,
  ...overrides,
});

describe('decideEntry', () => {
  it('usuario de plataforma inexistente o desactivado → sin acceso (aunque sea SuperAdmin)', () => {
    expect(decideEntry(access({ user: null, isPlatformAdmin: true, memberships: [A] }))).toEqual({
      kind: 'no_access',
    });
  });

  it('si tiene 1 membresía activa, entra directo a esa empresa', () => {
    expect(decideEntry(access({ memberships: [A] }))).toEqual({
      kind: 'tenant',
      tenantId: A.tenantId,
    });
  });

  it('1 membresía y además SuperAdmin → entra a la empresa (no a /admin)', () => {
    expect(decideEntry(access({ memberships: [A], isPlatformAdmin: true }))).toEqual({
      kind: 'tenant',
      tenantId: A.tenantId,
    });
  });

  it('si tiene varias, va a /elegir-empresa', () => {
    expect(decideEntry(access({ memberships: [A, B] }))).toEqual({ kind: 'choose' });
  });

  it('si tiene 0 y es SuperAdmin, va a /admin', () => {
    expect(decideEntry(access({ isPlatformAdmin: true }))).toEqual({ kind: 'platform' });
  });

  it('si tiene 0 y no es SuperAdmin → "Tu cuenta no tiene acceso a ninguna empresa"', () => {
    expect(decideEntry(access())).toEqual({ kind: 'no_access' });
  });
});
