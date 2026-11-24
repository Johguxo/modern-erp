// Ctx de prueba con valores válidos (UUIDs reales) y permisos como Set.
import type { Ctx } from '@/shared/context';
import type { Permission, Role } from '@/shared/permissions';

export const TEST_TENANT_ID = '11111111-1111-4111-8111-111111111111';
export const TEST_USER_ID = '22222222-2222-4222-8222-222222222222';
export const TEST_REQUEST_ID = 'req-test-0001';

export interface CtxOverrides {
  readonly tenantId?: string;
  readonly userId?: string;
  readonly roles?: readonly Role[];
  readonly permissions?: Iterable<Permission>;
  readonly timezone?: string;
  readonly requestId?: string;
  readonly readOnly?: boolean;
}

export function makeCtx(overrides: CtxOverrides = {}): Ctx {
  return {
    tenantId: overrides.tenantId ?? TEST_TENANT_ID,
    userId: overrides.userId ?? TEST_USER_ID,
    roles: overrides.roles ?? ['requester'],
    permissions: new Set(overrides.permissions ?? ['requests.create', 'requests.read_own']),
    locale: 'es-PE',
    timezone: overrides.timezone ?? 'America/Lima',
    requestId: overrides.requestId ?? TEST_REQUEST_ID,
    readOnly: overrides.readOnly ?? false,
  };
}
