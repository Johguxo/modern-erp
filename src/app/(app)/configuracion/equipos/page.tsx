import { notFound } from 'next/navigation';

import { withTenant } from '@/db';
import { createCatalogDeps, listEquipment } from '@/modules/catalog';
import { hasPermission } from '@/shared/authorization';

import { readOnlyCatalogExtras } from '../../../_lib/catalog';
import { requireCtx } from '../../../_lib/session';
import { parseListParams } from '../_catalog/list-params';

import { EquipmentManager } from './equipment-manager';

// Equipos del catálogo (E2-H2). Sin catalog.manage → 404 (no revela que existe).
export default async function EquipmentPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { ctx } = await requireCtx();
  if (!hasPermission(ctx, 'catalog.manage')) notFound();

  const params = parseListParams(await searchParams);
  const page = await withTenant(ctx, (tx) =>
    listEquipment(ctx, params, createCatalogDeps(tx, readOnlyCatalogExtras())),
  );
  return (
    <EquipmentManager
      items={[...page.items]}
      total={page.total}
      params={params}
      readOnly={ctx.readOnly}
    />
  );
}
