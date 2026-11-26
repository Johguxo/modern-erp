// Directorio de aprobadores (E4-H1): los lectores de identity sobre la transacción de withTenant.
// approvals nunca toca las tablas de usuarios y membresías directamente.
import type { DbExecutor } from '@/db';
import { createActiveMembersFor, createUserNamesFor } from '@/modules/identity';

import type { ApproverDirectory } from '../application/ports';

export function createApproverDirectory(db: DbExecutor): ApproverDirectory {
  const activeMembers = createActiveMembersFor(db);
  const namesOf = createUserNamesFor(db);
  return {
    async activeMembers(tenantId) {
      const members = await activeMembers(tenantId);
      return members.map(({ userId, fullName, roles }) => ({ userId, name: fullName, roles }));
    },
    namesOf,
  };
}
