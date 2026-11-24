// Composición de la consola de plataforma (E1-H4, ADR-007): extras de la entrega (Mailer, APP_URL,
// reloj, logger, cliente, afterCommit) y los pasos de alta de un cliente.
import { getEnv } from '@/env';
import { defaultWarehouseSetupStep } from '@/modules/catalog';
import {
  createPlatformDeps,
  type PlatformDeps,
  type TenantSetupStepFactory,
} from '@/modules/identity';

import { getMailer } from './mailer';
import type { SharedDeps } from './pipeline';

/**
 * Pasos extra al crear un cliente, dentro de la misma transacción. Cada historia agrega el suyo:
 * almacén por defecto (E2-H1, ya registrado), secuencia SOF (E3-H1) y política "SOF estándar" (E4-H1).
 */
export const tenantSetupSteps: readonly TenantSetupStepFactory[] = [defaultWarehouseSetupStep];

export function platformDeps(shared: SharedDeps): PlatformDeps {
  return createPlatformDeps(
    {
      clock: shared.clock,
      logger: shared.logger,
      client: shared.client,
      afterCommit: shared.afterCommit,
      mailer: getMailer(),
      appUrl: getEnv().APP_URL,
    },
    tenantSetupSteps,
  );
}
