// Puertos de la importación del catálogo (E2-H3). Las implementaciones Drizzle usan la transacción
// de withTenant (RLS) y filtran SIEMPRE por tenantId. El job y el upsert comparten esa transacción.
import type { AuditLog } from '@/modules/identity';
import type { AfterCommit } from '@/shared/ports/after-commit';
import type { ClientInfo } from '@/shared/ports/client-info';
import type { Clock } from '@/shared/ports/clock';
import type { JobQueue } from '@/shared/ports/job-queue';

import type { ImportKind } from '../domain/import';
import type { Currency } from '../domain/money';

import type { EquipmentFields, ProductFields } from './ports';

export interface UpsertManyResult {
  readonly created: number;
  readonly updated: number;
  /** Ya existían con los mismos datos: no se tocan (ni updated_at). */
  readonly unchanged: number;
}

/**
 * Upsert en bloque por (tenant_id, code). Solo cambia los campos editables: nunca `active` (un
 * inactivo sigue inactivo), ni `code`, ni `tenant_id`. Los códigos de `rows` no se repiten.
 */
export interface BulkUpsertRepository<F extends object> {
  upsertManyByCode(
    tenantId: string,
    rows: readonly (F & { readonly code: string })[],
  ): Promise<UpsertManyResult>;
}

export type ImportJobStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface ImportJobRecord {
  readonly id: string;
  readonly kind: ImportKind;
  readonly status: ImportJobStatus;
  readonly createdBy: string | null;
  /** Filas sin validar; null cuando el trabajo ya terminó. */
  readonly payload: unknown;
  readonly summary: unknown;
  readonly errors: unknown;
  readonly createdAt: Date;
  readonly finishedAt: Date | null;
}

export interface ImportJobRepository {
  /** Trabajo `pending` con su payload. */
  create(
    tenantId: string,
    input: { kind: ImportKind; createdBy: string; payload: unknown },
  ): Promise<{ id: string }>;
  /** SELECT … FOR UPDATE: un solo proceso trabaja el job. */
  lockById(tenantId: string, id: string): Promise<ImportJobRecord | null>;
  findById(tenantId: string, id: string): Promise<ImportJobRecord | null>;
  /** completed, con el resumen y los errores; borra el payload. */
  complete(
    tenantId: string,
    id: string,
    result: { summary: unknown; errors: unknown },
  ): Promise<void>;
  /** failed, con la razón en el resumen; borra el payload. */
  fail(tenantId: string, id: string, reason: string): Promise<void>;
}

interface AuditDeps {
  readonly audit: AuditLog;
  readonly client: ClientInfo;
}

/** Lo que usa la vista previa (la web). */
export interface ImportReadDeps {
  /** Moneda de la empresa: la de los precios que vienen sin moneda. */
  readonly tenantCurrency: (tenantId: string) => Promise<Currency>;
}

export interface ImportCreateDeps extends ImportReadDeps, AuditDeps {
  readonly importJobs: ImportJobRepository;
  readonly queue: JobQueue;
  readonly afterCommit: AfterCommit;
}

/** Lo que usa el worker. */
export interface ImportProcessDeps extends AuditDeps {
  readonly importJobs: ImportJobRepository;
  readonly products: BulkUpsertRepository<ProductFields>;
  readonly equipment: BulkUpsertRepository<EquipmentFields>;
}

export interface ImportQueryDeps {
  readonly importJobs: ImportJobRepository;
  readonly clock: Clock;
}
