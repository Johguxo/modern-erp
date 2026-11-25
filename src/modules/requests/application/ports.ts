// Puertos de requests (E3-H1). Las implementaciones Drizzle (infrastructure/) usan la transacción de
// withTenant (RLS) y además filtran SIEMPRE por tenantId (primera defensa).
import type { AuditLog, PlatformGuard } from '@/modules/identity';
import type { Ctx } from '@/shared/context';
import type { ClientInfo } from '@/shared/ports/client-info';
import type { Clock } from '@/shared/ports/clock';

import type { Currency } from '../domain/money';
import type { SequenceState } from '../domain/numbering';
import type { Request, RequestLine } from '../domain/request';
import type { RequestStatus } from '../domain/request-state-machine';

export type DocType = 'SOF';

// ── Catálogo (lo que requests necesita de otro módulo) ───────────────────────────────────────

export interface CatalogProduct {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly unit: string;
  /** Texto con 4 decimales; null si el producto no tiene precio de referencia. */
  readonly referencePrice: string | null;
  readonly currency: Currency | null;
}

export interface CatalogRefIds {
  readonly productIds: readonly string[];
  readonly equipmentIds: readonly string[];
  readonly costCenterIds: readonly string[];
}

export interface CatalogRefsFound {
  readonly products: readonly CatalogProduct[];
  /** Ids activos del tenant (los demás no existen, están inactivos o son de otro tenant). */
  readonly equipmentIds: readonly string[];
  readonly costCenterIds: readonly string[];
}

export interface CatalogLookup {
  refs(ctx: Ctx, ids: CatalogRefIds): Promise<CatalogRefsFound>;
  /** Almacén por defecto del tenant. */
  defaultWarehouseId(ctx: Ctx): Promise<string>;
}

/** Moneda de la empresa (tenant_settings.currency). */
export interface TenantCurrency {
  currencyOf(tenantId: string): Promise<Currency>;
}

/**
 * Arranca la aprobación del documento enviado, dentro de la misma transacción del envío: si lanza,
 * el envío completo se revierte (no queda número consumido). En E3-H1 la implementación está
 * vacía; E4-H2 la reemplaza por la del motor de aprobaciones.
 */
export interface ApprovalStarter {
  start(
    ctx: Ctx,
    input: { readonly requestId: string; readonly docType: DocType; readonly totalAmount: string },
  ): Promise<void>;
}

// ── Solicitudes ──────────────────────────────────────────────────────────────────────────────

export interface RequestWithLines {
  readonly request: Request;
  readonly lines: readonly RequestLine[];
}

export interface HeaderInsert {
  readonly tenantId: string;
  readonly requesterId: string;
  readonly costCenterId: string | null;
  readonly warehouseId: string;
  readonly equipmentId: string | null;
  readonly reason: string | null;
  readonly currency: Currency;
  readonly totalAmount: string;
}

export interface LineInsert {
  readonly lineNo: number;
  readonly productId: string;
  readonly productCode: string;
  readonly description: string;
  readonly unit: string;
  readonly equipmentId: string | null;
  readonly quantity: string;
  readonly unitPrice: string;
  readonly subtotal: string;
  readonly notes: string | null;
}

export interface HeaderPatch {
  readonly costCenterId?: string | null;
  readonly equipmentId?: string | null;
  readonly reason?: string | null;
  readonly totalAmount?: string;
  readonly status?: RequestStatus;
  readonly number?: string;
  readonly submittedAt?: Date;
}

export interface RequestRepository {
  /** Inserta el encabezado (borrador, versión 1) y sus líneas (`line_no` 1..n). */
  create(header: HeaderInsert, lines: readonly LineInsert[]): Promise<RequestWithLines>;
  find(tenantId: string, id: string): Promise<RequestWithLines | null>;
  /** SELECT … FOR UPDATE del encabezado (y lectura de sus líneas): serializa envíos y ediciones. */
  lockById(tenantId: string, id: string): Promise<RequestWithLines | null>;
  /** Borra y reinserta las líneas (solo con la solicitud en borrador). */
  replaceLines(
    tenantId: string,
    requestId: string,
    lines: readonly LineInsert[],
  ): Promise<RequestLine[]>;
  /**
   * `update … where id and tenant_id and version = :v` y `version = version + 1`.
   * ConflictError stale_version si ninguna fila coincide.
   */
  updateHeader(
    tenantId: string,
    id: string,
    expectedVersion: number,
    patch: HeaderPatch,
  ): Promise<Request>;
}

// ── Secuencia de numeración ──────────────────────────────────────────────────────────────────

export interface SequenceRepository {
  find(tenantId: string, docType: DocType): Promise<SequenceState | null>;
  /** SELECT … FOR UPDATE de la fila: un solo envío numera a la vez por tenant y tipo. */
  lockForUpdate(tenantId: string, docType: DocType): Promise<SequenceState | null>;
  update(
    tenantId: string,
    docType: DocType,
    patch: {
      readonly prefix?: string;
      readonly nextNumber?: number;
      readonly lastIssuedNumber?: number;
    },
  ): Promise<void>;
}

// ── Dependencias por caso de uso ─────────────────────────────────────────────────────────────

interface AuditDeps {
  readonly audit: AuditLog;
  readonly client: ClientInfo;
}

export interface DraftDeps extends AuditDeps {
  readonly requests: RequestRepository;
  readonly catalog: CatalogLookup;
  readonly currency: TenantCurrency;
}

export interface SubmitDeps extends DraftDeps {
  readonly sequences: SequenceRepository;
  readonly approvals: ApprovalStarter;
  readonly clock: Clock;
}

export interface GetRequestDeps {
  readonly requests: RequestRepository;
}

export interface SequenceDeps extends AuditDeps {
  readonly sequences: SequenceRepository;
}

/** Todo lo que arma la entrega para requests, sobre la transacción de withTenant. */
export type RequestsDeps = SubmitDeps & SequenceDeps;

// ── Consola de plataforma (conexión dueño, ADR-007) ──────────────────────────────────────────

export interface PlatformSequenceUnitOfWork {
  readonly guard: PlatformGuard;
  readonly sequences: SequenceRepository;
  readonly audit: AuditLog;
}

export interface PlatformSequenceStore {
  transaction<T>(fn: (uow: PlatformSequenceUnitOfWork) => Promise<T>): Promise<T>;
}

export interface PlatformSequenceDeps {
  readonly store: PlatformSequenceStore;
  readonly client: ClientInfo;
}
