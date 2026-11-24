// Lecturas de sesión con la conexión dueño (getDbAdmin): todavía no hay tenant activo para RLS.
// Están acotadas: siempre filtran por auth_user_id y, si aplica, por tenant_id (ADR-004 §8).
import { and, eq } from 'drizzle-orm';

import type { DbExecutor } from '@/db';
import { memberships, platformAdmins, tenantSettings, tenants, users } from '@/db/schema';

import type { SessionRepository, TenantAccess } from '../application/session-ports';
import type { EntryAccess } from '../domain/entry';

import { toRoles } from './roles';

export function createDrizzleSessionRepository(db: DbExecutor): SessionRepository {
  return {
    async findEntryAccess(authUserId: string): Promise<EntryAccess> {
      const [user] = await db
        .select({ id: users.id, email: users.email })
        .from(users)
        .where(and(eq(users.authUserId, authUserId), eq(users.status, 'active')))
        .limit(1);
      if (!user) return { user: null, memberships: [], isPlatformAdmin: false };

      const [rows, admin] = await Promise.all([
        db
          .select({ tenantId: memberships.tenantId, tenantName: tenants.name })
          .from(memberships)
          .innerJoin(tenants, eq(tenants.id, memberships.tenantId))
          .where(and(eq(memberships.userId, user.id), eq(memberships.status, 'active')))
          .orderBy(tenants.name),
        db
          .select({ userId: platformAdmins.userId })
          .from(platformAdmins)
          .where(eq(platformAdmins.userId, user.id))
          .limit(1),
      ]);
      return { user, memberships: rows, isPlatformAdmin: admin.length > 0 };
    },

    async findTenantAccess(authUserId: string, tenantId: string): Promise<TenantAccess | null> {
      const [row] = await db
        .select({
          userId: users.id,
          email: users.email,
          roles: memberships.roles,
          timezone: tenantSettings.timezone,
        })
        .from(users)
        .innerJoin(
          memberships,
          and(
            eq(memberships.userId, users.id),
            eq(memberships.tenantId, tenantId),
            eq(memberships.status, 'active'),
          ),
        )
        .innerJoin(tenants, eq(tenants.id, memberships.tenantId))
        .leftJoin(tenantSettings, eq(tenantSettings.tenantId, tenants.id))
        .where(and(eq(users.authUserId, authUserId), eq(users.status, 'active')))
        .limit(1);
      if (!row) return null;
      return {
        userId: row.userId,
        email: row.email,
        roles: toRoles(row.roles),
        timezone: row.timezone ?? 'America/Lima',
        locale: 'es-PE',
      };
    },
  };
}
