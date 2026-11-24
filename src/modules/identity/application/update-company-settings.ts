// Guardar nombre visible, color principal y moneda (E1-H5). Bloquea la fila para leer el "antes"
// sin carreras, conserva el logo y audita solo lo que cambió (nada si no cambió nada).
import { requirePermission } from '@/shared/authorization';
import type { Ctx } from '@/shared/context';
import { NotFoundError } from '@/shared/errors';

import type { Brand } from '../domain/company-brand';

import { recordAudit } from './audit';
import type { Currency, SettingsDeps } from './settings-ports';

export interface UpdateCompanySettingsInput {
  /** null = usar el nombre legal. */
  readonly displayName: string | null;
  /** #RRGGBB, o null = color por defecto. */
  readonly primaryColor: string | null;
  readonly currency: Currency;
}

export async function updateCompanySettings(
  ctx: Ctx,
  input: UpdateCompanySettingsInput,
  deps: Pick<SettingsDeps, 'settings' | 'audit' | 'client'>,
): Promise<{ changed: boolean }> {
  requirePermission(ctx, 'settings.manage');
  const current = await deps.settings.lock(ctx.tenantId);
  if (!current) throw new NotFoundError({ message: 'Tenant settings not found' });

  const before = {
    displayName: current.brand.displayName ?? null,
    primaryColor: current.brand.primaryColor ?? null,
    currency: current.currency,
  };
  const after = {
    displayName: input.displayName,
    primaryColor: input.primaryColor,
    currency: input.currency,
  };
  const changes = Object.fromEntries(
    (Object.keys(after) as (keyof typeof after)[])
      .filter((field) => before[field] !== after[field])
      .map((field) => [field, { from: before[field], to: after[field] }]),
  );
  if (Object.keys(changes).length === 0) return { changed: false };

  const brand: Brand = { ...current.brand };
  if (input.displayName === null) delete brand.displayName;
  else brand.displayName = input.displayName;
  if (input.primaryColor === null) delete brand.primaryColor;
  else brand.primaryColor = input.primaryColor;

  await deps.settings.update(ctx.tenantId, { brand, currency: input.currency });
  await recordAudit(
    ctx,
    {
      action: 'tenant_settings.updated',
      entityType: 'tenant_settings',
      entityId: ctx.tenantId,
      data: { changes },
    },
    deps,
  );
  return { changed: true };
}
