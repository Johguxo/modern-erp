// E1-H3 · Último admin (por permiso users.manage) y auto-desactivación.
import { describe, expect, it } from 'vitest';

import { canManageUsers, isSelf, keepsAUserManager, type MemberSnapshot } from './membership-rules';

const admin: MemberSnapshot = { membershipId: 'm-admin', roles: ['admin'], active: true };
const requester: MemberSnapshot = { membershipId: 'm-req', roles: ['requester'], active: true };
const admin2: MemberSnapshot = {
  membershipId: 'm-admin2',
  roles: ['admin', 'approver'],
  active: true,
};

describe('canManageUsers', () => {
  it('solo los roles con users.manage', () => {
    expect(canManageUsers(['admin'])).toBe(true);
    expect(canManageUsers(['warehouse', 'approver'])).toBe(false);
  });
});

describe('keepsAUserManager', () => {
  it('quitar admin al único admin → false', () => {
    expect(
      keepsAUserManager([admin, requester], { membershipId: 'm-admin', roles: ['requester'] }),
    ).toBe(false);
  });

  it('desactivar al único admin → false', () => {
    expect(keepsAUserManager([admin, requester], { membershipId: 'm-admin', active: false })).toBe(
      false,
    );
  });

  it('con otro admin activo → true', () => {
    expect(
      keepsAUserManager([admin, admin2], { membershipId: 'm-admin', roles: ['requester'] }),
    ).toBe(true);
  });

  it('un admin desactivado no cuenta', () => {
    const disabledAdmin = { ...admin2, active: false };
    expect(
      keepsAUserManager([admin, disabledAdmin], { membershipId: 'm-admin', active: false }),
    ).toBe(false);
  });

  it('cambiar roles de otro miembro no afecta', () => {
    expect(
      keepsAUserManager([admin, requester], { membershipId: 'm-req', roles: ['approver'] }),
    ).toBe(true);
  });
});

describe('isSelf', () => {
  it('compara ids de usuario', () => {
    expect(isSelf('u1', 'u1')).toBe(true);
    expect(isSelf('u1', 'u2')).toBe(false);
  });
});
