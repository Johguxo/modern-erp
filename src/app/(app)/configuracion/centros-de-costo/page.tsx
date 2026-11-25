import { notFound } from 'next/navigation';

import { withTenant } from '@/db';
import { createCatalogDeps, listCostCenters } from '@/modules/catalog';
import { hasPermission } from '@/shared/authorization';

import { readOnlyCatalogExtras } from '../../../_lib/catalog';
import { requireCtx } from '../../../_lib/session';
import { parseListParams } from '../_catalog/list-params';
import { redirectIfOutOfRange } from '../_catalog/redirect-out-of-range';

import { CostCentersManager } from './cost-centers-manager';

// Centros de costo del catálogo (E2-H2). Sin catalog.manage → 404 (no revela que existe).
export default async function CostCentersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { ctx } = await requireCtx();
  if (!hasPermission(ctx, 'catalog.manage')) notFound();

  const params = parseListParams(await searchParams);
  const page = await withTenant(ctx, (tx) =>
    listCostCenters(ctx, params, createCatalogDeps(tx, readOnlyCatalogExtras())),
  );
  redirectIfOutOfRange('/configuracion/centros-de-costo', params, page.total);
  return (
    <CostCentersManager
      items={[...page.items]}
      total={page.total}
      params={params}
      readOnly={ctx.readOnly}
    />
  );
}
