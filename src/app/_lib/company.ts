// Composición de la configuración de la empresa (E1-H5): Storage de logos y lo que trae SharedDeps.
// La marca del menú se lee una vez por request con withTenant (RLS).
import { cache } from 'react';

import { withTenant } from '@/db';
import {
  createSettingsDeps,
  getCompanyBrand,
  type CompanyBrandView,
  type SettingsExtras,
} from '@/modules/identity';
import { cryptoIdGenerator } from '@/shared/adapters/crypto-id-generator';
import { getLogger } from '@/shared/adapters/pino-logger';
import type { Ctx } from '@/shared/context';
import { UNKNOWN_CLIENT } from '@/shared/ports/client-info';

import { getBrandStorage } from './file-storage';
import type { SharedDeps } from './pipeline';

export function settingsExtras(shared: SharedDeps): SettingsExtras {
  return {
    storage: getBrandStorage(),
    ids: shared.ids,
    logger: shared.logger,
    client: shared.client,
    afterCommit: shared.afterCommit,
  };
}

/** Para lecturas desde Server Components (sin auditoría ni tareas después del commit). */
export function readOnlySettingsExtras(): SettingsExtras {
  return {
    storage: getBrandStorage(),
    ids: cryptoIdGenerator,
    logger: getLogger(),
    client: UNKNOWN_CLIENT,
    afterCommit: () => undefined,
  };
}

/**
 * Marca del menú lateral, una vez por request. Es un adorno: si falla (p. ej. falta la fila de
 * tenant_settings), se registra y el menú sigue sin marca, en vez de tumbar toda la app.
 */
export const getTenantBrand = cache(async (ctx: Ctx): Promise<CompanyBrandView | null> => {
  try {
    return await withTenant(ctx, (tx) =>
      getCompanyBrand(ctx, createSettingsDeps(tx, readOnlySettingsExtras())),
    );
  } catch (error) {
    getLogger().warn({ err: error, tenantId: ctx.tenantId }, 'tenant brand unavailable');
    return null;
  }
});
