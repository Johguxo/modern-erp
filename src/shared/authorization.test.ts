// E0-H3 · Revisión de permisos por permiso (ADR-002), nunca por rol.
import { makeCtx } from '@tests/support/ctx';
import { describe, expect, it } from 'vitest';

import { hasPermission, requireAnyPermission, requirePermission } from './authorization';
import { ForbiddenError } from './errors';

describe('hasPermission / requirePermission', () => {
  it('hasPermission es true solo si el ctx tiene el permiso', () => {
    const ctx = makeCtx({ permissions: ['requests.create'] });

    expect(hasPermission(ctx, 'requests.create')).toBe(true);
    expect(hasPermission(ctx, 'approvals.decide')).toBe(false);
  });

  it('requirePermission no lanza si el ctx tiene el permiso', () => {
    const ctx = makeCtx({ permissions: ['approvals.decide'] });

    expect(() => requirePermission(ctx, 'approvals.decide')).not.toThrow();
  });

  it('requirePermission lanza ForbiddenError sin el permiso', () => {
    const ctx = makeCtx({ permissions: [] });

    expect(() => requirePermission(ctx, 'users.manage')).toThrow(ForbiddenError);
  });

  it('decide por permisos, no por el nombre del rol', () => {
    const adminWithoutPermission = makeCtx({ roles: ['admin'], permissions: [] });

    expect(hasPermission(adminWithoutPermission, 'users.manage')).toBe(false);
  });
});

describe('requireAnyPermission', () => {
  it('no lanza si el ctx tiene al menos uno', () => {
    const ctx = makeCtx({ permissions: ['requests.create'] });

    expect(() => requireAnyPermission(ctx, ['catalog.manage', 'requests.create'])).not.toThrow();
  });

  it('lanza ForbiddenError si no tiene ninguno', () => {
    const ctx = makeCtx({ permissions: ['approvals.decide'] });

    expect(() => requireAnyPermission(ctx, ['catalog.manage', 'requests.create'])).toThrow(
      ForbiddenError,
    );
  });

  it('lanza con una lista vacía', () => {
    expect(() => requireAnyPermission(makeCtx({ permissions: ['catalog.manage'] }), [])).toThrow(
      ForbiddenError,
    );
  });
});
