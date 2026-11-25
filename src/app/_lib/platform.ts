// Composición de la consola de plataforma (E1-H4, ADR-007): extras de la entrega (Mailer, APP_URL,
// reloj, logger, cliente, afterCommit) y los pasos de alta de un cliente.
import { getEnv } from '@/env';
import { defaultWarehouseSetupStep } from '@/modules/catalog';
import {
  createPlatformDeps,
  type PlatformDeps,
  type TenantSetupStepFactory,
} from '@/modules/identity';
import { documentSequenceSetupStep, type DocumentSequenceConfig } from '@/modules/requests';

import { getMailer } from './mailer';
import type { SharedDeps } from './pipeline';

/** Lo que el alta del cliente puede configurar en los pasos (hoy: la secuencia SOF). */
export interface TenantSetupOptions {
  readonly sequence?: DocumentSequenceConfig;
}

/**
 * Pasos extra al crear un cliente, dentro de la misma transacción. Cada historia agrega el suyo:
 * almacén por defecto (E2-H1), secuencia SOF (E3-H1, con el prefijo y el correlativo del alta) y
 * política "SOF estándar" (E4-H1).
 */
export function tenantSetupSteps(options: TenantSetupOptions = {}): TenantSetupStepFactory[] {
  return [defaultWarehouseSetupStep, documentSequenceSetupStep(options.sequence)];
}

export function platformDeps(shared: SharedDeps, options: TenantSetupOptions = {}): PlatformDeps {
  return createPlatformDeps(
    {
      clock: shared.clock,
      logger: shared.logger,
      client: shared.client,
      afterCommit: shared.afterCommit,
      mailer: getMailer(),
      appUrl: getEnv().APP_URL,
    },
    tenantSetupSteps(options),
  );
}
