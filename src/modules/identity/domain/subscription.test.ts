// E1-H4 · Cambios de suscripción: actualizar la vigente, cancelar, reactivar (fila nueva) y sin cambios.
import { describe, expect, it } from 'vitest';

import { planSubscriptionChange, withMaxUsers, type SubscriptionState } from './subscription';

const current: SubscriptionState = { planId: 'p1', status: 'active', overrides: {} };

describe('planSubscriptionChange', () => {
  it('sin cambios → noop', () => {
    expect(planSubscriptionChange(current, { ...current })).toEqual({ kind: 'noop' });
  });

  it('cambiar plan, estado u overrides de la vigente → update', () => {
    expect(planSubscriptionChange(current, { ...current, planId: 'p2' })).toEqual({
      kind: 'update',
      endsNow: false,
    });
    expect(planSubscriptionChange(current, { ...current, status: 'suspended' }).kind).toBe(
      'update',
    );
    expect(planSubscriptionChange(current, { ...current, overrides: { max_users: 3 } }).kind).toBe(
      'update',
    );
  });

  it('cancelar la vigente → update con fin ahora', () => {
    expect(planSubscriptionChange(current, { ...current, status: 'cancelled' })).toEqual({
      kind: 'update',
      endsNow: true,
    });
  });

  it('solo canceladas (o ninguna) y nuevo estado vigente → create', () => {
    const cancelled = { ...current, status: 'cancelled' as const };
    expect(planSubscriptionChange(cancelled, { ...current })).toEqual({ kind: 'create' });
    expect(planSubscriptionChange(null, { ...current })).toEqual({ kind: 'create' });
  });

  it('cancelada y sigue cancelada → noop', () => {
    const cancelled = { ...current, status: 'cancelled' as const };
    expect(planSubscriptionChange(cancelled, { ...cancelled, planId: 'p2' })).toEqual({
      kind: 'noop',
    });
  });
});

describe('withMaxUsers', () => {
  it('null quita el override y conserva el resto', () => {
    expect(withMaxUsers({ max_users: 5, storage_mb: 10 }, null)).toEqual({ storage_mb: 10 });
  });

  it('un número fija el override', () => {
    expect(withMaxUsers({}, 7)).toEqual({ max_users: 7 });
  });
});
