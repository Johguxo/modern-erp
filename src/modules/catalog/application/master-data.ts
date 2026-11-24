// Casos de uso genéricos de los datos maestros (productos, equipos y centros de costo): permisos,
// "antes y después", auditoría de lo que cambió y estado activo. Cada entidad los envuelve en su
// propio caso de uso (un archivo por caso de uso).
import { recordAudit, type AuditLog } from '@/modules/identity';
import { hasPermission, requireAnyPermission, requirePermission } from '@/shared/authorization';
import type { Ctx } from '@/shared/context';
import { NotFoundError } from '@/shared/errors';
import type { Page, Pagination } from '@/shared/pagination';
import type { ClientInfo } from '@/shared/ports/client-info';

import type { ListFilter, MasterRepository, MasterView, StatusFilter } from './ports';

export type MasterEntity = 'product' | 'equipment' | 'cost_center';

interface MasterDeps<V extends MasterView, F extends object> {
  readonly repo: MasterRepository<V, F>;
  readonly entity: MasterEntity;
  readonly audit: AuditLog;
  readonly client: ClientInfo;
}

/** Lectura: quien administra el catálogo o quien crea SOF. */
export function requireCatalogRead(ctx: Ctx): void {
  requireAnyPermission(ctx, ['catalog.manage', 'requests.create']);
}

export function requireCatalogWrite(ctx: Ctx): void {
  requirePermission(ctx, 'catalog.manage');
}

export async function listMaster<V extends MasterView, F extends object>(
  ctx: Ctx,
  input: Pagination & { readonly q: string | null; readonly status: StatusFilter },
  repo: MasterRepository<V, F>,
): Promise<Page<V>> {
  requireCatalogRead(ctx);
  // Quien solo crea SOF ve únicamente lo activo, sin importar el filtro que envíe.
  const status: StatusFilter = hasPermission(ctx, 'catalog.manage') ? input.status : 'active';
  const filter: ListFilter = { q: input.q, status };
  const { items, total } = await repo.list(ctx.tenantId, filter, input);
  return { items, total, page: input.page, pageSize: input.pageSize };
}

/** Campos que cambiaron: { campo: { from, to } }. Vacío si no cambió nada. */
export function diffFields<F extends object>(
  before: F,
  after: F,
): Record<string, { from: unknown; to: unknown }> {
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const key of Object.keys(after) as (keyof F & string)[]) {
    if (before[key] !== after[key]) changes[key] = { from: before[key], to: after[key] };
  }
  return changes;
}

export async function upsertMaster<V extends MasterView, F extends object>(
  ctx: Ctx,
  input: { readonly id?: string | undefined; readonly code: string; readonly fields: F },
  deps: MasterDeps<V, F>,
  fieldsOf: (view: V) => F,
): Promise<{ item: V; created: boolean; changed: boolean }> {
  requireCatalogWrite(ctx);
  const { repo, entity } = deps;

  if (input.id === undefined) {
    const item = await repo.create(ctx.tenantId, { ...input.fields, code: input.code });
    await recordAudit(
      ctx,
      {
        action: `${entity}.created`,
        entityType: entity,
        entityId: item.id,
        data: { code: item.code, values: input.fields },
      },
      deps,
    );
    return { item, created: true, changed: true };
  }

  const current = await repo.lockById(ctx.tenantId, input.id);
  if (!current) throw new NotFoundError({ message: `${entity} not found` });
  const changes = diffFields(fieldsOf(current), input.fields);
  if (Object.keys(changes).length === 0) return { item: current, created: false, changed: false };

  const item = await repo.update(ctx.tenantId, current.id, input.fields);
  await recordAudit(
    ctx,
    {
      action: `${entity}.updated`,
      entityType: entity,
      entityId: item.id,
      data: { code: item.code, changes },
    },
    deps,
  );
  return { item, created: false, changed: true };
}

export async function setMasterActive<V extends MasterView, F extends object>(
  ctx: Ctx,
  input: { readonly id: string; readonly active: boolean },
  deps: MasterDeps<V, F>,
): Promise<{ changed: boolean }> {
  requireCatalogWrite(ctx);
  const { repo, entity } = deps;
  const current = await repo.lockById(ctx.tenantId, input.id);
  if (!current) throw new NotFoundError({ message: `${entity} not found` });
  if (current.active === input.active) return { changed: false };

  await repo.setActive(ctx.tenantId, current.id, input.active);
  await recordAudit(
    ctx,
    {
      action: `${entity}.${input.active ? 'reactivated' : 'deactivated'}`,
      entityType: entity,
      entityId: current.id,
      data: { code: current.code },
    },
    deps,
  );
  return { changed: true };
}
