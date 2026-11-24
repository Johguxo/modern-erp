// Subir y quitar el logo de la empresa (E1-H5). El tipo se detecta por los primeros bytes (sin
// SVG) y la ruta la arma el servidor. Orden: subir a Storage, guardar la ruta y auditar; el logo
// anterior se borra después del commit (si falla, queda un archivo huérfano inofensivo).
import { requirePermission } from '@/shared/authorization';
import type { Ctx } from '@/shared/context';
import { NotFoundError, ValidationError } from '@/shared/errors';

import {
  detectImageType,
  LOGO_CONTENT_TYPES,
  logoKey,
  MAX_LOGO_BYTES,
  type Brand,
} from '../domain/company-brand';

import { recordAudit } from './audit';
import type { SettingsDeps } from './settings-ports';

function scheduleRemoval(ctx: Ctx, key: string, deps: SettingsDeps): void {
  deps.afterCommit(async () => {
    try {
      await deps.storage.remove({ tenantId: ctx.tenantId, key });
    } catch (error) {
      deps.logger.warn({ err: error, key }, 'old logo removal failed');
    }
  });
}

export async function uploadCompanyLogo(
  ctx: Ctx,
  input: { bytes: Uint8Array },
  deps: SettingsDeps,
): Promise<{ logoUrl: string }> {
  requirePermission(ctx, 'settings.manage');
  if (input.bytes.byteLength > MAX_LOGO_BYTES) {
    throw new ValidationError({
      reason: 'logo_too_large',
      fieldErrors: { logo: ['logo_too_large'] },
      message: `Logo too large (${input.bytes.byteLength} bytes)`,
    });
  }
  const type = detectImageType(input.bytes);
  if (!type) {
    throw new ValidationError({
      reason: 'logo_invalid_type',
      fieldErrors: { logo: ['logo_invalid_type'] },
      message: 'Logo is not PNG, JPEG or WebP',
    });
  }

  const current = await deps.settings.lock(ctx.tenantId);
  if (!current) throw new NotFoundError({ message: 'Tenant settings not found' });

  const key = logoKey(deps.ids.newId(), type);
  await deps.storage.put({
    tenantId: ctx.tenantId,
    key,
    body: input.bytes,
    contentType: LOGO_CONTENT_TYPES[type],
  });
  const previous = current.brand.logoPath ?? null;
  await deps.settings.update(ctx.tenantId, {
    brand: { ...current.brand, logoPath: key },
    currency: current.currency,
  });
  await recordAudit(
    ctx,
    {
      action: 'tenant_settings.logo_updated',
      entityType: 'tenant_settings',
      entityId: ctx.tenantId,
      data: {
        from: previous,
        to: key,
        contentType: LOGO_CONTENT_TYPES[type],
        sizeBytes: input.bytes.byteLength,
      },
    },
    deps,
  );
  if (previous) scheduleRemoval(ctx, previous, deps);
  return { logoUrl: deps.storage.publicUrl({ tenantId: ctx.tenantId, key }) };
}

export async function removeCompanyLogo(
  ctx: Ctx,
  _input: Record<string, never>,
  deps: SettingsDeps,
): Promise<{ changed: boolean }> {
  requirePermission(ctx, 'settings.manage');
  const current = await deps.settings.lock(ctx.tenantId);
  if (!current) throw new NotFoundError({ message: 'Tenant settings not found' });
  const previous = current.brand.logoPath;
  if (!previous) return { changed: false };

  const brand: Brand = { ...current.brand };
  delete brand.logoPath;
  await deps.settings.update(ctx.tenantId, { brand, currency: current.currency });
  await recordAudit(
    ctx,
    {
      action: 'tenant_settings.logo_removed',
      entityType: 'tenant_settings',
      entityId: ctx.tenantId,
      data: { from: previous },
    },
    deps,
  );
  scheduleRemoval(ctx, previous, deps);
  return { changed: true };
}
