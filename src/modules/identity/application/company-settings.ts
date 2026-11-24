// Lecturas de la configuración de la empresa (E1-H5): la pantalla /configuracion/empresa
// (settings.manage) y la marca del menú lateral (cualquier miembro). Lectura: también en solo
// lectura.
import { requirePermission } from '@/shared/authorization';
import type { Ctx } from '@/shared/context';
import { NotFoundError } from '@/shared/errors';

import type { Currency, SettingsDeps, SettingsRecord } from './settings-ports';

export interface CompanyBrandView {
  /** Nombre visible, o el nombre legal si no hay uno propio. */
  readonly displayName: string;
  readonly primaryColor: string | null;
  readonly logoUrl: string | null;
}

export interface CompanySettingsView extends CompanyBrandView {
  readonly legalName: string;
  /** El nombre visible guardado (null = se usa el legal). */
  readonly customDisplayName: string | null;
  readonly currency: Currency;
}

async function load(ctx: Ctx, deps: Pick<SettingsDeps, 'settings'>): Promise<SettingsRecord> {
  const record = await deps.settings.get(ctx.tenantId);
  if (!record) throw new NotFoundError({ message: 'Tenant settings not found' });
  return record;
}

function brandView(
  ctx: Ctx,
  record: SettingsRecord,
  deps: Pick<SettingsDeps, 'storage'>,
): CompanyBrandView {
  const { brand } = record;
  return {
    displayName: brand.displayName ?? record.legalName,
    primaryColor: brand.primaryColor ?? null,
    logoUrl: brand.logoPath
      ? deps.storage.publicUrl({ tenantId: ctx.tenantId, key: brand.logoPath })
      : null,
  };
}

/** Marca para el menú lateral: la ve cualquier miembro de la empresa. */
export async function getCompanyBrand(
  ctx: Ctx,
  deps: Pick<SettingsDeps, 'settings' | 'storage'>,
): Promise<CompanyBrandView> {
  return brandView(ctx, await load(ctx, deps), deps);
}

export async function getCompanySettings(
  ctx: Ctx,
  deps: Pick<SettingsDeps, 'settings' | 'storage'>,
): Promise<CompanySettingsView> {
  requirePermission(ctx, 'settings.manage');
  const record = await load(ctx, deps);
  return {
    ...brandView(ctx, record, deps),
    legalName: record.legalName,
    customDisplayName: record.brand.displayName ?? null,
    currency: record.currency,
  };
}
