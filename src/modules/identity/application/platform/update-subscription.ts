// platform.updateSubscription (E1-H4): plan, estado y límite de usuarios del cliente. Actualiza la
// vigente; si solo hay canceladas, una reactivación crea otra fila (índice "una vigente").
// Bajar max_users por debajo del uso se permite: solo bloquea nuevas invitaciones.
import type { PlatformCtx } from '@/shared/context';
import { NotFoundError, ValidationError } from '@/shared/errors';

import { planOverridesSchema, type SubscriptionStatus } from '../../domain/entitlements';
import { planSubscriptionChange, withMaxUsers } from '../../domain/subscription';

import { recordPlatformAudit } from './audit';
import type { PlatformDeps } from './ports';
import { assertPlatformAdmin } from './shared';

export interface UpdateSubscriptionInput {
  readonly tenantId: string;
  readonly planCode: string;
  readonly status: SubscriptionStatus;
  readonly maxUsers: number | null;
}

export async function updateSubscription(
  ctx: PlatformCtx,
  input: UpdateSubscriptionInput,
  deps: PlatformDeps,
): Promise<{ changed: boolean }> {
  return deps.store.transaction(async (uow) => {
    await assertPlatformAdmin(uow, ctx);
    // Mismo orden que invitar (cupos, luego filas): sin deadlocks con E1-H3.
    await uow.locks.seats(input.tenantId);
    if (!(await uow.lockTenant(input.tenantId))) {
      throw new NotFoundError({ message: 'Tenant not found' });
    }

    const latest = await uow.latestSubscription(input.tenantId);
    const plan = await uow.findPlan(input.planCode);
    // Un plan retirado solo se acepta si es el que ya tiene.
    if (!plan || (!plan.active && plan.id !== latest?.planId)) {
      throw new ValidationError({
        reason: 'plan_unavailable',
        fieldErrors: { planCode: ['plan_unavailable'] },
        message: 'Plan not found or inactive',
      });
    }

    const currentOverrides = planOverridesSchema.parse(latest?.overrides ?? {});
    const overrides = planOverridesSchema.parse(withMaxUsers(currentOverrides, input.maxUsers));
    const next = { planId: plan.id, status: input.status, overrides };
    const previous = latest
      ? { planId: latest.planId, status: latest.status, overrides: currentOverrides }
      : null;
    const change = planSubscriptionChange(previous, next);
    if (change.kind === 'noop') return { changed: false };

    const from = latest
      ? { planCode: latest.planCode, status: latest.status, overrides: currentOverrides }
      : null;
    const to = { planCode: plan.code, status: input.status, overrides };

    if (change.kind === 'update' && latest) {
      await uow.updateSubscription(input.tenantId, latest.id, {
        ...next,
        endsAt: change.endsNow ? deps.clock.now() : latest.endsAt,
      });
      await recordPlatformAudit(
        ctx,
        input.tenantId,
        {
          action: 'subscription.updated',
          entityType: 'subscription',
          entityId: latest.id,
          data: { from, to },
        },
        uow,
        deps,
      );
    } else {
      const id = await uow.insertSubscription({ tenantId: input.tenantId, ...next });
      await recordPlatformAudit(
        ctx,
        input.tenantId,
        {
          action: 'subscription.created',
          entityType: 'subscription',
          entityId: id,
          data: { from, to },
        },
        uow,
        deps,
      );
    }
    return { changed: true };
  });
}
