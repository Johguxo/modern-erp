// E1-H2 · El ctx se reconstruye en cada request validando la membresía activa y el estado del
// tenant (resolveTenantSession), y el destino tras el login (resolveEntry), con fakes en memoria.
import { describe, expect, it } from 'vitest';

import { permissionsFor } from '../domain/permissions';
import type { EntryAccess } from '../domain/entry';

import type { Entitlements } from './entitlements';
import { resolveEntry } from './resolve-entry';
import { resolveJobCtx } from './resolve-job-ctx';
import { resolveTenantSession } from './resolve-tenant-session';
import type { SessionRepository, TenantAccess } from './session-ports';

const AUTH_USER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const TENANT_A = '11111111-1111-4111-8111-111111111111';
const TENANT_B = '33333333-3333-4333-8333-333333333333';

const ACCESS: TenantAccess = {
  userId: 'user-1',
  email: 'ana@genrent.pe',
  roles: ['requester', 'approver'],
  timezone: 'America/Bogota',
  locale: 'es-PE',
};

class InMemorySessions implements SessionRepository {
  readonly tenantCalls: [string, string][] = [];

  constructor(
    private readonly byTenant: Record<string, TenantAccess>,
    private readonly entry: EntryAccess = { user: null, memberships: [], isPlatformAdmin: false },
  ) {}

  findEntryAccess(): Promise<EntryAccess> {
    return Promise.resolve(this.entry);
  }

  findTenantAccess(authUserId: string, tenantId: string): Promise<TenantAccess | null> {
    this.tenantCalls.push([authUserId, tenantId]);
    return Promise.resolve(authUserId === AUTH_USER ? (this.byTenant[tenantId] ?? null) : null);
  }

  findTenantAccessByUserId(userId: string, tenantId: string): Promise<TenantAccess | null> {
    const access = this.byTenant[tenantId] ?? null;
    return Promise.resolve(access && access.userId === userId ? access : null);
  }
}

function entitlements(isReadOnly: (tenantId: string) => Promise<boolean>): Entitlements {
  return {
    isReadOnly,
    canAddUser: () => Promise.reject(new Error('no usado')),
    hasFeature: () => Promise.reject(new Error('no usado')),
  };
}

const input = (tenantId = TENANT_A) => ({ authUserId: AUTH_USER, tenantId, requestId: 'req-1' });

describe('resolveTenantSession', () => {
  it('con membresía activa arma el Ctx con permisos por permissionsFor, zona horaria y requestId', async () => {
    const sessions = new InMemorySessions({ [TENANT_A]: ACCESS });

    const ctx = await resolveTenantSession(input(), {
      sessions,
      entitlements: entitlements(() => Promise.resolve(false)),
    });

    expect(ctx).toEqual({
      tenantId: TENANT_A,
      userId: 'user-1',
      roles: ['requester', 'approver'],
      permissions: permissionsFor(['requester', 'approver']),
      locale: 'es-PE',
      timezone: 'America/Bogota',
      requestId: 'req-1',
      readOnly: false,
    });
    expect(sessions.tenantCalls).toEqual([[AUTH_USER, TENANT_A]]);
  });

  it('aislamiento: una cookie con el tenant B para un usuario que solo pertenece a A → null', async () => {
    const sessions = new InMemorySessions({ [TENANT_A]: ACCESS });

    const ctx = await resolveTenantSession(input(TENANT_B), {
      sessions,
      entitlements: entitlements(() => Promise.resolve(false)),
    });

    expect(ctx).toBeNull();
  });

  it('modo solo lectura: readOnly viene de Entitlements.isReadOnly del tenant', async () => {
    const asked: string[] = [];
    const ctx = await resolveTenantSession(input(), {
      sessions: new InMemorySessions({ [TENANT_A]: ACCESS }),
      entitlements: entitlements((tenantId) => {
        asked.push(tenantId);
        return Promise.resolve(true);
      }),
    });

    expect(ctx?.readOnly).toBe(true);
    expect(asked).toEqual([TENANT_A]);
  });

  it('si isReadOnly lanza, el tenant queda en solo lectura (falla cerrado)', async () => {
    const ctx = await resolveTenantSession(input(), {
      sessions: new InMemorySessions({ [TENANT_A]: ACCESS }),
      entitlements: entitlements(() => Promise.reject(new Error('db down'))),
    });

    expect(ctx?.readOnly).toBe(true);
  });

  it('sin acceso no importa el resultado de isReadOnly → null', async () => {
    const ctx = await resolveTenantSession(input(), {
      sessions: new InMemorySessions({}),
      entitlements: entitlements(() => Promise.reject(new Error('db down'))),
    });

    expect(ctx).toBeNull();
  });
});

describe('resolveJobCtx', () => {
  const jobInput = (userId = 'user-1', tenantId = TENANT_A) => ({
    userId,
    tenantId,
    requestId: 'job-1',
  });

  it('arma el Ctx con el id del usuario (sin sesión de Auth) y sus permisos', async () => {
    const ctx = await resolveJobCtx(jobInput(), {
      sessions: new InMemorySessions({ [TENANT_A]: ACCESS }),
      entitlements: entitlements(() => Promise.resolve(false)),
    });

    expect(ctx).toEqual({
      tenantId: TENANT_A,
      userId: 'user-1',
      roles: ['requester', 'approver'],
      permissions: permissionsFor(['requester', 'approver']),
      locale: 'es-PE',
      timezone: 'America/Bogota',
      requestId: 'job-1',
      readOnly: false,
    });
  });

  it('usuario o membresía inactivos (o de otro tenant) → null', async () => {
    const deps = {
      sessions: new InMemorySessions({ [TENANT_A]: ACCESS }),
      entitlements: entitlements(() => Promise.resolve(false)),
    };
    expect(await resolveJobCtx(jobInput('otro'), deps)).toBeNull();
    expect(await resolveJobCtx(jobInput('user-1', TENANT_B), deps)).toBeNull();
  });

  it('refleja el solo lectura del tenant y falla cerrado si Entitlements lanza', async () => {
    const sessions = new InMemorySessions({ [TENANT_A]: ACCESS });
    const readOnly = await resolveJobCtx(jobInput(), {
      sessions,
      entitlements: entitlements(() => Promise.resolve(true)),
    });
    const broken = await resolveJobCtx(jobInput(), {
      sessions,
      entitlements: entitlements(() => Promise.reject(new Error('db down'))),
    });
    expect(readOnly?.readOnly).toBe(true);
    expect(broken?.readOnly).toBe(true);
  });
});

describe('resolveEntry', () => {
  it('devuelve el acceso leído y la decisión de decideEntry', async () => {
    const entry: EntryAccess = {
      user: { id: 'user-1', email: 'ana@genrent.pe' },
      memberships: [{ tenantId: TENANT_A, tenantName: 'Alfa' }],
      isPlatformAdmin: false,
    };

    const result = await resolveEntry(AUTH_USER, { sessions: new InMemorySessions({}, entry) });

    expect(result).toEqual({ decision: { kind: 'tenant', tenantId: TENANT_A }, access: entry });
  });
});
