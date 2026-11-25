import { notFound } from 'next/navigation';

import { withTenant } from '@/db';
import { createCatalogDeps, listProducts } from '@/modules/catalog';
import { hasPermission } from '@/shared/authorization';

import { getTenantBrand } from '../../../_lib/company';
import { readOnlyCatalogExtras } from '../../../_lib/catalog';
import { requireCtx } from '../../../_lib/session';
import { parseListParams } from '../_catalog/list-params';
import { redirectIfOutOfRange } from '../_catalog/redirect-out-of-range';

import { ProductsManager } from './products-manager';

// Productos del catálogo (E2-H2). Sin catalog.manage → 404 (no revela que existe).
export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { ctx } = await requireCtx();
  if (!hasPermission(ctx, 'catalog.manage')) notFound();

  const params = parseListParams(await searchParams);
  const [page, brand] = await Promise.all([
    withTenant(ctx, (tx) =>
      listProducts(ctx, params, createCatalogDeps(tx, readOnlyCatalogExtras())),
    ),
    getTenantBrand(ctx),
  ]);
  redirectIfOutOfRange('/configuracion/productos', params, page.total);
  return (
    <ProductsManager
      items={[...page.items]}
      total={page.total}
      params={params}
      tenantCurrency={brand?.currency ?? 'PEN'}
      readOnly={ctx.readOnly}
    />
  );
}
