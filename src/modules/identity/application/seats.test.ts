// E1-H3 · El motivo de Entitlements.canAddUser se traduce al mensaje correcto.
import { describe, expect, it } from 'vitest';

import { isDomainError } from '@/shared/errors';

import { assertCanAddUser } from './seats';

function reasonOf(fn: () => void): { code: string; reason?: string; params: object } {
  try {
    fn();
  } catch (error) {
    if (isDomainError(error)) return error;
    throw error;
  }
  throw new Error('Se esperaba un error');
}

describe('assertCanAddUser', () => {
  it('con cupo no lanza', () => {
    expect(() => assertCanAddUser({ allowed: true, limit: 5, used: 1 })).not.toThrow();
  });

  it('límite → LIMIT_EXCEEDED max_users con el número', () => {
    const error = reasonOf(() =>
      assertCanAddUser({ allowed: false, limit: 5, used: 5, reason: 'limit_reached' }),
    );
    expect(error).toMatchObject({
      code: 'LIMIT_EXCEEDED',
      reason: 'max_users',
      params: { max: 5 },
    });
  });

  it('solo lectura → tenant_read_only; sin suscripción → no_subscription', () => {
    expect(
      reasonOf(() => assertCanAddUser({ allowed: false, limit: 5, used: 0, reason: 'read_only' })),
    ).toMatchObject({ code: 'FORBIDDEN', reason: 'tenant_read_only' });
    expect(
      reasonOf(() =>
        assertCanAddUser({ allowed: false, limit: null, used: 0, reason: 'no_subscription' }),
      ),
    ).toMatchObject({ code: 'FORBIDDEN', reason: 'no_subscription' });
  });
});
