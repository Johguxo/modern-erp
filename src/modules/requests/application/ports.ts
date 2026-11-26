// Puertos de requests (E3-H1). Las implementaciones Drizzle (infrastructure/) usan la transacción de
// withTenant (RLS) y además filtran SIEMPRE por tenantId (primera defensa).
import type { AuditLog, PlatformGuard } from '@/modules/identity';
import type { Ctx } from '@/shared/context';
import type { ClientInfo } from '@/shared/ports/client-info';
import type { Clock } from '@/shared/ports/clock';

import type { DecisionKind, DecisionOutcome } from '../domain/decision';
import type { InboxScope, InboxTab } from '../domain/inbox';
import type { Currency } from '../domain/money';
import type { SequenceState } from '../domain/numbering';
import type { Request, RequestLine } from '../domain/request';
import type { ApprovalTimelineEntry } from '../domain/request-timeline';
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
 * Arranca la aprobación del documento enviado o reenviado, dentro de la misma transacción del
 * envío: si lanza, el envío completo se revierte (no queda número consumido). Lo implementa el motor
 * de `approvals` (E4-H2); `round` es 1 al enviar y sube con cada reenvío.
 */
export interface ApprovalStarter {
  start(
    ctx: Ctx,
    input: {
      readonly requestId: string;
      readonly docType: DocType;
      readonly totalAmount: string;
      /** Quien envía: nunca queda como aprobador de su propia solicitud. */
      readonly requesterId: string;
    },
  ): Promise<{ readonly round: number }>;
}

/**
 * Cierra la aprobación del documento anulado, dentro de la misma transacción de la anulación: si
 * lanza, la anulación completa se revierte. El motor de `approvals` (E4-H2) cierra los pasos
 * abiertos y escribe el evento `cancelled`.
 */
export interface ApprovalCanceller {
  cancel(ctx: Ctx, input: { readonly requestId: string; readonly comment: string }): Promise<void>;
}

/**
 * Decide un paso de aprobación dentro de la transacción de la decisión, con la solicitud ya
 * bloqueada. Lo implementa el motor de `approvals` (E4-H2): aplica `any`/`all`, avanza o cierra la
 * ronda y escribe los eventos. Lanza `step_already_decided`, `not_an_approver` o
 * `approval_not_started` según el caso.
 */
export interface ApprovalDecider {
  decide(
    ctx: Ctx,
    input: {
      readonly requestId: string;
      /** El paso que el usuario vio pendiente. */
      readonly stepId: string;
      readonly kind: DecisionKind;
      readonly comment: string | null;
    },
  ): Promise<{ readonly outcome: DecisionOutcome }>;
}

/**
 * Aprobador asignado (bandeja y visibilidad, E3-H3). Lo implementa el motor de `approvals`
 * (E4-H2). Si las listas crecen mucho, el adaptador pasa a una subconsulta (ver el plan de E3-H3,
 * riesgos).
 */
export interface ApprovalAssignments {
  /** Solicitudes donde el usuario del ctx es aprobador asignado (cualquier paso). */
  assignedRequestIds(ctx: Ctx): Promise<readonly string[]>;
  /** ¿El usuario del ctx es aprobador asignado de esta solicitud (cualquier paso)? */
  isAssigned(ctx: Ctx, requestId: string): Promise<boolean>;
  /** Solicitudes cuyo paso pendiente actual es del usuario del ctx. */
  pendingRequestIds(ctx: Ctx): Promise<readonly string[]>;
  /** El paso pendiente del usuario del ctx en esa solicitud (para decidirlo); null si no tiene. */
  pendingStepId(ctx: Ctx, requestId: string): Promise<string | null>;
}

/**
 * Historial de la aprobación para la línea de tiempo (E4-H2). Lo implementa el motor de `approvals`.
 * E4-H3 lo reemplaza leyendo todos los eventos.
 */
/** Decisión que detuvo la ronda; se elimina junto con ApprovalHistory (E4-H3, paso 3). */
export interface StoppingDecision {
  readonly kind: 'reject' | 'request_changes';
  readonly actorId: string;
  readonly comment: string | null;
  readonly at: Date;
}

export interface ApprovalHistory {
  /**
   * La última decisión que detuvo la ronda (rechazo o pedido de cambios) de la solicitud; null si
   * no hay ninguna.
   */
  latestDecision(ctx: Ctx, requestId: string): Promise<StoppingDecision | null>;
}

/**
 * Línea de tiempo de la aprobación (E4-H3). Lo implementa el motor de `approvals`: eventos de todas
 * las rondas más el paso pendiente y los que esperan. La solicitud ya la revisó quien llama.
 */
export interface ApprovalTimeline {
  /** Los ítems en orden; null si la solicitud nunca se envió (no hay instancia). */
  getTimeline(ctx: Ctx, requestId: string): Promise<readonly ApprovalTimelineEntry[] | null>;
}

/** Nombres de otros módulos para mostrar en la bandeja (se resuelven en lote, solo las filas). */
export interface RequestLabels {
  /** id de usuario → nombre completo. Los ids sin nombre no aparecen. */
  userNames(ctx: Ctx, userIds: readonly string[]): Promise<ReadonlyMap<string, string>>;
  /** id → rótulo del equipo («CODE · Nombre») y del centro de costo (su nombre), activos o no. */
  areaLabels(
    ctx: Ctx,
    ids: { readonly equipmentIds: readonly string[]; readonly costCenterIds: readonly string[] },
  ): Promise<{
    readonly equipment: ReadonlyMap<string, string>;
    readonly costCenters: ReadonlyMap<string, string>;
  }>;
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
  /** Aprobación del último paso (E4-H2). */
  readonly approvedAt?: Date;
  /** Cierre por anulación (fecha, autor y comentario, E3-H5) o por rechazo (solo la fecha). */
  readonly closedAt?: Date;
  readonly closedBy?: string;
  readonly closeComment?: string;
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

// ── Consulta de la bandeja (E3-H3) ───────────────────────────────────────────────────────────

/** Fila de la bandeja: solo columnas de `requests` (los nombres se resuelven aparte). */
export interface InboxRow {
  readonly id: string;
  readonly docType: 'SOF';
  readonly number: string | null;
  readonly status: RequestStatus;
  readonly requesterId: string;
  readonly equipmentId: string | null;
  readonly costCenterId: string | null;
  readonly currency: Currency;
  /** Texto con 2 decimales. */
  readonly totalAmount: string;
  readonly updatedAt: Date;
}

export interface InboxVisibility {
  readonly tenantId: string;
  readonly scope: InboxScope;
  /** Solicitudes con el paso pendiente del usuario (para «Esperan mi aprobación»). */
  readonly pendingIds: readonly string[];
}

export interface InboxListQuery extends InboxVisibility {
  readonly tab: InboxTab;
  /** Texto en número o motivo (cada palabra); null = sin búsqueda. */
  readonly q: string | null;
  readonly page: number;
  readonly pageSize: number;
}

export interface InboxSummary {
  readonly awaitingMe: number;
  readonly inApproval: number;
  readonly approvedThisWeek: number;
}

export interface RequestQueryRepository {
  /** Página de lo visible, ordenada por `updated_at desc, id desc`. */
  list(query: InboxListQuery): Promise<{ items: InboxRow[]; total: number }>;
  /** Conteos sobre lo visible, sin pestaña ni búsqueda. `weekStart` es UTC. */
  summary(visibility: InboxVisibility, weekStart: Date): Promise<InboxSummary>;
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

/** Decidir un SOF (E4-H2): bloquea la solicitud, el motor decide el paso, actualiza y audita. */
export interface DecideDeps extends AuditDeps {
  readonly requests: RequestRepository;
  readonly assignments: ApprovalAssignments;
  readonly decider: ApprovalDecider;
  readonly clock: Clock;
}

/** Anular un SOF (E3-H5): bloquea, cambia el estado, cierra la aprobación y audita. */
export interface CancelDeps extends AuditDeps {
  readonly requests: RequestRepository;
  /** Aprobador asignado (E4-H2): ve el documento aunque no lo haya creado. */
  readonly assignments: ApprovalAssignments;
  readonly canceller: ApprovalCanceller;
  readonly clock: Clock;
}

export interface GetRequestDeps {
  readonly requests: RequestRepository;
  /** Aprobador asignado (E4-H2). */
  readonly assignments: ApprovalAssignments;
}

/** Detalle del SOF (E3-H4): lo de getRequest más los nombres a mostrar. */
export interface GetRequestDetailDeps extends GetRequestDeps {
  readonly labels: RequestLabels;
  readonly timeline: ApprovalTimeline;
}

export interface ListRequestsDeps {
  readonly queries: RequestQueryRepository;
  readonly assignments: ApprovalAssignments;
  readonly labels: RequestLabels;
  readonly clock: Clock;
}

export interface SequenceDeps extends AuditDeps {
  readonly sequences: SequenceRepository;
}

/** Todo lo que arma la entrega para requests, sobre la transacción de withTenant. */
export type RequestsDeps = SubmitDeps &
  SequenceDeps &
  Pick<GetRequestDeps, 'assignments'> &
  Pick<CancelDeps, 'canceller'> &
  Pick<DecideDeps, 'decider'>;

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
