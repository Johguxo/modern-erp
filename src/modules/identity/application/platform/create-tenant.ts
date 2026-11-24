// platform.createTenant (E1-H4): en una sola transacción crea el tenant, sus ajustes, la
// suscripción, los pasos de otras historias (tenantSetupSteps) y la invitación al primer admin.
// Si algo falla no queda nada. El correo sale después del commit.
import type { PlatformCtx } from '@/shared/context';
import { ValidationError } from '@/shared/errors';

import { planOverridesSchema } from '../../domain/entitlements';
import { withMaxUsers } from '../../domain/subscription';
import { isReservedSlug } from '../../domain/tenant-slug';
import { scheduleInvitationEmail } from '../invitation-email';

import { recordPlatformAudit } from './audit';
import type { PlatformDeps } from './ports';
import { assertPlatformAdmin, issueAdminInvitation } from './shared';

export interface CreateTenantInput {
  readonly name: string;
  readonly slug: string;
  readonly planCode: string;
  readonly maxUsers: number | null;
  readonly currency: 'PEN' | 'USD';
  readonly adminEmail: string;
}

export async function createTenant(
  ctx: PlatformCtx,
  input: CreateTenantInput,
  deps: PlatformDeps,
): Promise<{ tenantId: string; invitationId: string; emailSent: boolean }> {
  if (isReservedSlug(input.slug)) {
    throw new ValidationError({
      reason: 'slug_reserved',
      fieldErrors: { slug: ['slug_reserved'] },
      message: 'Reserved slug',
    });
  }
  const overrides = planOverridesSchema.parse(withMaxUsers({}, input.maxUsers));
  const now = deps.clock.now();

  const created = await deps.store.transaction(async (uow) => {
    await assertPlatformAdmin(uow, ctx);
    const plan = await uow.findPlan(input.planCode);
    if (!plan?.active) {
      throw new ValidationError({
        reason: 'plan_unavailable',
        fieldErrors: { planCode: ['plan_unavailable'] },
        message: 'Plan not found or inactive',
      });
    }

    const tenantId = await uow.insertTenant({ name: input.name, slug: input.slug });
    await uow.insertSettings({ tenantId, currency: input.currency });
    await uow.insertSubscription({ tenantId, planId: plan.id, status: 'active', overrides });
    for (const step of uow.setupSteps) await step.run({ tenantId });

    // Sin revisar cupo: el cliente es nuevo, está activo y max_users ≥ 1.
    const invitation = await issueAdminInvitation(uow, {
      tenantId,
      email: input.adminEmail,
      invitedBy: ctx.userId,
      now,
    });

    await recordPlatformAudit(
      ctx,
      tenantId,
      {
        action: 'tenant.created',
        entityType: 'tenant',
        entityId: tenantId,
        data: {
          name: input.name,
          slug: input.slug,
          planCode: plan.code,
          currency: input.currency,
          overrides,
        },
      },
      uow,
      deps,
    );
    await recordPlatformAudit(
      ctx,
      tenantId,
      {
        action: 'invitation.created',
        entityType: 'invitation',
        entityId: invitation.invitationId,
        data: { email: input.adminEmail, roles: ['admin'] },
      },
      uow,
      deps,
    );
    return { tenantId, ...invitation };
  });

  scheduleInvitationEmail(
    { tenantId: created.tenantId, locale: 'es-PE' },
    {
      invitationId: created.invitationId,
      email: input.adminEmail,
      token: created.token,
      tokenHash: created.tokenHash,
      tenantName: input.name,
    },
    deps,
  );
  return { tenantId: created.tenantId, invitationId: created.invitationId, emailSent: false };
}
