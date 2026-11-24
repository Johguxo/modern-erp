// Puertos de aceptar una invitación (E1-H3, ADR-004 §8). Aún no hay ctx ni tenant activo: la
// implementación usa la conexión dueño (getDbAdmin), acotada por token_hash, y audita la escritura.
import type { Role } from '@/shared/permissions';

import type { AuditLog } from './user-admin-ports';

export interface AcceptableInvitation {
  readonly id: string;
  readonly tenantId: string;
  readonly email: string;
  readonly roles: readonly Role[];
  readonly expiresAt: Date;
  readonly acceptedAt: Date | null;
}

export interface Account {
  readonly userId: string;
  readonly authUserId: string | null;
  readonly status: 'active' | 'disabled';
}

export interface InvitationPreviewRecord {
  readonly invitation: AcceptableInvitation;
  readonly tenantName: string;
  /** Usuario de la plataforma con el correo de la invitación, si existe. */
  readonly account: Account | null;
}

/** Operaciones dentro de la transacción de aceptar (conexión dueño). */
export interface AcceptUnitOfWork {
  /**
   * Bloqueo de cupos del tenant (el mismo que invitar, reenviar y reactivar). Se toma ANTES de
   * lockInvitation: invitar/reenviar toman cupos y luego actualizan la fila; el orden inverso
   * produce un deadlock (40P01).
   */
  lockSeats(tenantId: string): Promise<void>;
  /** SELECT … FOR UPDATE por token_hash: dos aceptaciones simultáneas se serializan. */
  lockInvitation(tokenHash: string): Promise<AcceptableInvitation | null>;
  findAccount(email: string): Promise<Account | null>;
  createUser(input: { email: string; fullName: string; authUserId: string }): Promise<string>;
  linkAuthUser(userId: string, authUserId: string): Promise<void>;
  findMembership(
    tenantId: string,
    userId: string,
  ): Promise<{ id: string; status: 'active' | 'disabled' } | null>;
  createMembership(input: {
    tenantId: string;
    userId: string;
    roles: readonly Role[];
  }): Promise<string>;
  reactivateMembership(
    tenantId: string,
    membershipId: string,
    roles: readonly Role[],
  ): Promise<void>;
  markAccepted(invitationId: string, now: Date): Promise<void>;
  readonly audit: AuditLog;
}

export interface InvitationAcceptStore {
  /** Invitación no aceptada con ese hash (puede estar vencida), su empresa y la cuenta del correo. */
  preview(tokenHash: string): Promise<InvitationPreviewRecord | null>;
  transaction<T>(fn: (uow: AcceptUnitOfWork) => Promise<T>): Promise<T>;
}
