// tenant_settings de la empresa activa (E1-H5) con la transacción de withTenant: RLS y filtro
// explícito por tenantId. app_user solo puede actualizar brand, currency y otras columnas de
// ajustes (grants de 0002); tenants.name es de solo lectura.
import { eq } from 'drizzle-orm';

import type { DbExecutor } from '@/db';
import { tenantSettings, tenants } from '@/db/schema';

import type { Currency, SettingsRepository } from '../application/settings-ports';
import { parseBrand } from '../domain/company-brand';

const toCurrency = (value: string): Currency => (value === 'USD' ? 'USD' : 'PEN');

export function createDrizzleSettingsRepository(db: DbExecutor): SettingsRepository {
  return {
    async get(tenantId) {
      const [row] = await db
        .select({
          legalName: tenants.name,
          currency: tenantSettings.currency,
          brand: tenantSettings.brand,
        })
        .from(tenantSettings)
        .innerJoin(tenants, eq(tenants.id, tenantSettings.tenantId))
        .where(eq(tenantSettings.tenantId, tenantId))
        .limit(1);
      if (!row) return null;
      return {
        legalName: row.legalName,
        currency: toCurrency(row.currency),
        brand: parseBrand(row.brand),
      };
    },

    async lock(tenantId) {
      const [row] = await db
        .select({ currency: tenantSettings.currency, brand: tenantSettings.brand })
        .from(tenantSettings)
        .where(eq(tenantSettings.tenantId, tenantId))
        .for('update')
        .limit(1);
      if (!row) return null;
      return { currency: toCurrency(row.currency), brand: parseBrand(row.brand) };
    },

    async update(tenantId, input) {
      await db
        .update(tenantSettings)
        .set({ brand: input.brand, currency: input.currency })
        .where(eq(tenantSettings.tenantId, tenantId));
    },
  };
}
