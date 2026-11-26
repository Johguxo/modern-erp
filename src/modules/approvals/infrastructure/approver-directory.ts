// Directorio de aprobadores (E4-H1): los lectores de identity sobre la transacción de withTenant.
// approvals nunca toca las tablas de usuarios y membresías directamente.
import type { DbExecutor } from '@/db';
import { createActiveMembersFor, createUserNamesFor, permissionsFor } from '@/modules/identity';
import { TENANT_ROLES } from '@/shared/permissions';

import type { ApproverDirectory } from '../application/ports';

export function createApproverDirectory(db: DbExecutor): ApproverDirectory {
  const activeMembers = createActiveMembersFor(db);
  const namesOf = createUserNamesFor(db);
  return {
    decidingRoles: TENANT_ROLES.filter((role) => permissionsFor([role]).has('approvals.decide')),
    async activeMembers(tenantId) {
      const members = await activeMembers(tenantId);
      return members.map(({ userId, fullName, roles }) => ({
        userId,
        name: fullName,
        roles,
        canDecide: permissionsFor(roles).has('approvals.decide'),
      }));
    },
    namesOf,
  };
}
