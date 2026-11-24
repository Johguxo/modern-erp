// Primer SuperAdmin (E1-H4): lo usa el script `pnpm admin:create-superadmin` (y E7-H1). Idempotente:
// si el usuario existe, solo asegura platform_admins; si no, crea la cuenta de Auth, el usuario y
// la fila de SuperAdmin. Si la transacción falla, borra la cuenta de Auth recién creada.
import type { AuthAdmin } from '@/shared/ports/auth-admin';
import { UNKNOWN_CLIENT } from '@/shared/ports/client-info';

import type { AuditLog } from '../user-admin-ports';

import type { PlatformStore } from './ports';

export type BootstrapResult = 'created' | 'granted' | 'unchanged';

export class BootstrapError extends Error {}

export async function bootstrapPlatformAdmin(
  input: { email: string; password: string; fullName: string },
  deps: { store: PlatformStore; authAdmin: AuthAdmin },
): Promise<BootstrapResult> {
  const email = input.email.trim().toLowerCase();

  const existing = await deps.store.transaction(async (uow) => {
    const user = await uow.findUserByEmail(email);
    if (!user) return null;
    const granted = await uow.grantPlatformAdmin(user.id);
    if (granted) await audit(uow.audit, user.id);
    return granted ? 'granted' : 'unchanged';
  });
  if (existing) return existing;

  const auth = await deps.authAdmin.createUser({
    email,
    password: input.password,
    fullName: input.fullName,
  });
  if (!auth.ok) {
    throw new BootstrapError(
      auth.reason === 'email_exists'
        ? 'The email already has an Auth account without a platform user; link it manually.'
        : 'The password was rejected by Auth (weak password).',
    );
  }

  try {
    await deps.store.transaction(async (uow) => {
      const userId = await uow.createUser({
        authUserId: auth.authUserId,
        email,
        fullName: input.fullName,
      });
      await uow.grantPlatformAdmin(userId);
      await audit(uow.audit, userId);
    });
  } catch (error) {
    await deps.authAdmin.deleteUser(auth.authUserId);
    throw error;
  }
  return 'created';
}

function audit(log: AuditLog, userId: string): Promise<void> {
  return log.record({
    tenantId: null,
    actorUserId: null,
    actorType: 'system',
    action: 'platform_admin.granted',
    entityType: 'user',
    entityId: userId,
    data: {},
    ip: UNKNOWN_CLIENT.ip,
    userAgent: UNKNOWN_CLIENT.userAgent,
  });
}
