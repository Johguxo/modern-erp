// Extras de la entrega para la gestión de usuarios de identity (E1-H3): Mailer, APP_URL y lo que
// trae SharedDeps (reloj, logger, cliente y afterCommit).
import { getEnv } from '@/env';
import type { UserAdminExtras } from '@/modules/identity';
import { getLogger } from '@/shared/adapters/pino-logger';
import { systemClock } from '@/shared/adapters/system-clock';
import { UNKNOWN_CLIENT } from '@/shared/ports/client-info';

import { getMailer } from './mailer';
import type { SharedDeps } from './pipeline';

export function userAdminExtras(shared: SharedDeps): UserAdminExtras {
  return {
    clock: shared.clock,
    logger: shared.logger,
    client: shared.client,
    afterCommit: shared.afterCommit,
    mailer: getMailer(),
    appUrl: getEnv().APP_URL,
  };
}

/** Para lecturas desde Server Components (no hay tareas después del commit ni auditoría). */
export function readOnlyUserAdminExtras(): UserAdminExtras {
  return {
    clock: systemClock,
    logger: getLogger(),
    client: UNKNOWN_CLIENT,
    afterCommit: () => undefined,
    mailer: getMailer(),
    appUrl: getEnv().APP_URL,
  };
}
