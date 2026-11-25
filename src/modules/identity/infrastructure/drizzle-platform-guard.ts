// Revisión de SuperAdmin sobre una conexión (ADR-007 §4): otros módulos la usan dentro de su propia
// transacción dueño para repetir la revisión antes de escribir, sin depender de platform_admins.
import { eq } from 'drizzle-orm';

import type { DbExecutor } from '@/db';
import { platformAdmins } from '@/db/schema';

import type { PlatformGuard } from '../application/platform/ports';

export function createDrizzlePlatformGuard(db: DbExecutor): PlatformGuard {
  return {
    async isPlatformAdmin(userId) {
      const rows = await db
        .select({ userId: platformAdmins.userId })
        .from(platformAdmins)
        .where(eq(platformAdmins.userId, userId))
        .limit(1);
      return rows.length > 0;
    },
  };
}
