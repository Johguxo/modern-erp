// Puertos de la gestión de usuarios (E1-H3). Las implementaciones Drizzle (infrastructure/) usan la
// transacción de withTenant (RLS) y además filtran por tenantId (primera defensa).
import type { Role } from '@/shared/permissions';
import type { AfterCommit } from '@/shared/ports/after-commit';
import type { ClientInfo } from '@/shared/ports/client-info';
import type { Clock } from '@/shared/ports/clock';
import type { Logger } from '@/shared/ports/logger';
import type { Mailer } from '@/shared/ports/mailer';

import type { Entitlements } from './entitlements';

export type MemberStatus = 'active' | 'disabled';

export interface MemberRecord {
  readonly membershipId: string;
  readonly userId: string;
  readonly fullName: string;
  readonly email: string;
  readonly roles: readonly Role[];
  /** 'active' solo si la membresía y el usuario están activos. */
  readonly status: MemberStatus;
  /** Estado propio de la membresía (lo que se edita aquí). */
  readonly membershipStatus: MemberStatus;
}

export interface MemberRepository {
  list(tenantId: string): Promise<MemberRecord[]>;
  findById(tenantId: string, membershipId: string): Promise<MemberRecord | null>;
  findByEmail(tenantId: string, email: string): Promise<MemberRecord | null>;
  updateRoles(tenantId: string, membershipId: string, roles: readonly Role[]): Promise<void>;
  updateStatus(tenantId: string, membershipId: string, status: MemberStatus): Promise<void>;
}

export interface InvitationRecord {
  readonly id: string;
  readonly email: string;
  readonly roles: readonly Role[];
  readonly expiresAt: Date;
  readonly acceptedAt: Date | null;
  readonly invitedByName: string | null;
}

export interface InvitationRepository {
  /** Pendientes y sin vencer, más recientes primero. */
  listLive(tenantId: string, now: Date): Promise<InvitationRecord[]>;
  /** La invitación no aceptada del correo (puede estar vencida o anulada). */
  findPendingByEmail(tenantId: string, email: string): Promise<InvitationRecord | null>;
  findPendingById(tenantId: string, invitationId: string): Promise<InvitationRecord | null>;
  create(input: {
    tenantId: string;
    email: string;
    roles: readonly Role[];
    tokenHash: string;
    expiresAt: Date;
    invitedBy: string;
  }): Promise<string>;
  /**
   * Nuevo token y vencimiento (y roles), sobre la misma fila. NotFoundError si ya no está
   * pendiente (p. ej. se aceptó entre la lectura y el UPDATE).
   */
  renew(
    tenantId: string,
    invitationId: string,
    input: { roles: readonly Role[]; tokenHash: string; expiresAt: Date; invitedBy: string },
  ): Promise<void>;
  /**
   * Anula: vence ahora (sin migración; accepted_at solo lo escribe aceptar). NotFoundError si ya
   * no está pendiente.
   */
  expire(tenantId: string, invitationId: string, now: Date): Promise<void>;
}

/** Bloqueos por tenant (pg_advisory_xact_lock), hasta el fin de la transacción. */
export interface TenantLocks {
  /** Cupos del plan: invitar, renovar una vencida, reactivar, aceptar. */
  seats(tenantId: string): Promise<void>;
  /** Último admin: editar roles y desactivar. */
  admins(tenantId: string): Promise<void>;
}

export interface TenantDirectory {
  tenantName(tenantId: string): Promise<string>;
}

export type ActorType = 'user' | 'platform_admin' | 'system' | 'external';

export interface AuditEntry {
  readonly tenantId: string | null;
  readonly actorUserId: string | null;
  readonly actorType: ActorType;
  readonly action: string;
  readonly entityType: string;
  readonly entityId: string | null;
  readonly data: Readonly<Record<string, unknown>>;
  readonly ip: string | null;
  readonly userAgent: string | null;
}

/** audit_events: solo insert (CLAUDE.md regla 7). */
export interface AuditLog {
  record(entry: AuditEntry): Promise<void>;
}

/** Todo lo que usan los casos de uso de gestión de usuarios; cada uno toma lo que necesita. */
export interface UserAdminDeps {
  readonly members: MemberRepository;
  readonly invitations: InvitationRepository;
  readonly locks: TenantLocks;
  readonly tenants: TenantDirectory;
  readonly audit: AuditLog;
  readonly entitlements: Entitlements;
  readonly mailer: Mailer;
  readonly clock: Clock;
  readonly logger: Logger;
  readonly client: ClientInfo;
  readonly afterCommit: AfterCommit;
  /** APP_URL, para armar el enlace del correo. */
  readonly appUrl: string;
}
