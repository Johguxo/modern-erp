import { notFound } from 'next/navigation';

import { withTenant } from '@/db';
import { createUserAdminDeps, listMembers } from '@/modules/identity';
import { hasPermission } from '@/shared/authorization';

import { requireCtx } from '../../../_lib/session';
import { readOnlyUserAdminExtras } from '../../../_lib/user-admin';

import { UsersManager } from './users-manager';

// Gestión de usuarios (E1-H3). Sin users.manage → 404 (no revela que existe).
export default async function UsersPage() {
  const { ctx } = await requireCtx();
  if (!hasPermission(ctx, 'users.manage')) notFound();

  const data = await withTenant(ctx, (tx) =>
    listMembers(ctx, createUserAdminDeps(tx, readOnlyUserAdminExtras())),
  );
  return <UsersManager data={data} readOnly={ctx.readOnly} timeZone={ctx.timezone} />;
}
