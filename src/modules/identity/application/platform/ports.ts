// Puertos de la consola de plataforma (E1-H4, ADR-007). La implementación usa la conexión dueño
// (getDbAdmin, sin RLS): toda consulta filtra por un tenantId explícito y toda escritura corre en
// una transacción que vuelve a revisar platform_admins y se audita.
import type { AfterCommit } from '@/shared/ports/after-commit';
import type { ClientInfo } from '@/shared/ports/client-info';
import type { Clock } from '@/shared/ports/clock';
import type { Logger } from '@/shared/ports/logger';
import type { Mailer } from '@/shared/ports/mailer';

import type { PlanLimits, SubscriptionStatus } from '../../domain/entitlements';
import type { Entitlements } from '../entitlements';
import type {
  AuditLog,
  InvitationRepository,
  MemberRepository,
  TenantDirectory,
  TenantLocks,
} from '../user-admin-ports';

export interface PlanRecord {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly active: boolean;
  readonly maxUsers: number | null;
}

export interface SubscriptionRecord {
  readonly id: string;
  readonly planId: string;
  readonly planCode: string;
  readonly planName: string;
  readonly status: SubscriptionStatus;
  /** jsonb tal cual; se valida con planOverridesSchema. */
  readonly overrides: unknown;
  readonly planLimits: PlanLimits;
}

export interface TenantSummaryRecord {
  readonly tenantId: string;
  readonly name: string;
  readonly slug: string;
  /** Vigente (no cancelada), o null. */
  readonly subscription: SubscriptionRecord | null;
  readonly activeMembers: number;
  readonly liveInvitations: number;
}

export interface TenantInvitationRecord {
  readonly invitationId: string;
  readonly email: string;
  readonly expiresAt: Date;
}

export interface TenantDetailRecord extends Omit<TenantSummaryRecord, 'subscription'> {
  readonly currency: 'PEN' | 'USD';
  readonly createdAt: Date;
  /** La vigente, o la última cancelada. */
  readonly subscription: SubscriptionRecord | null;
  /** Invitaciones no aceptadas (incluye vencidas), más recientes primero. */
  readonly invitations: readonly TenantInvitationRecord[];
}

/**
 * Paso extra al crear un cliente, dentro de la misma transacción. Lo agregan otras historias:
 * almacén por defecto (E2-H1), secuencia SOF (E3-H1) y política "SOF estándar" (E4-H1).
 */
export interface TenantSetupStep {
  run(input: { readonly tenantId: string }): Promise<void>;
}

export interface PlatformUnitOfWork {
  isPlatformAdmin(userId: string): Promise<boolean>;
  findPlan(code: string): Promise<PlanRecord | null>;
  /** ValidationError slug_taken si el slug ya existe. */
  insertTenant(input: { name: string; slug: string }): Promise<string>;
  insertSettings(input: { tenantId: string; currency: 'PEN' | 'USD' }): Promise<void>;
  insertSubscription(input: {
    tenantId: string;
    planId: string;
    status: SubscriptionStatus;
    overrides: Readonly<Record<string, unknown>>;
  }): Promise<string>;
  /** SELECT … FOR UPDATE del tenant: false si no existe. */
  lockTenant(tenantId: string): Promise<boolean>;
  /** La vigente si hay; si no, la más reciente (cancelada); null si nunca tuvo. */
  latestSubscription(
    tenantId: string,
  ): Promise<(SubscriptionRecord & { endsAt: Date | null }) | null>;
  updateSubscription(
    tenantId: string,
    subscriptionId: string,
    input: {
      planId: string;
      status: SubscriptionStatus;
      overrides: Readonly<Record<string, unknown>>;
      endsAt: Date | null;
    },
  ): Promise<void>;
  /** Primer SuperAdmin (script): usuario de la plataforma por correo. */
  findUserByEmail(email: string): Promise<{ id: string; authUserId: string | null } | null>;
  createUser(input: { authUserId: string; email: string; fullName: string }): Promise<string>;
  /** true si se agregó; false si ya era SuperAdmin. */
  grantPlatformAdmin(userId: string): Promise<boolean>;
  readonly setupSteps: readonly TenantSetupStep[];
  readonly members: MemberRepository;
  readonly invitations: InvitationRepository;
  readonly locks: TenantLocks;
  readonly tenants: TenantDirectory;
  readonly audit: AuditLog;
  readonly entitlements: Entitlements;
}

export interface PlatformStore {
  listTenants(): Promise<TenantSummaryRecord[]>;
  getTenant(tenantId: string, now: Date): Promise<TenantDetailRecord | null>;
  listPlans(): Promise<PlanRecord[]>;
  transaction<T>(fn: (uow: PlatformUnitOfWork) => Promise<T>): Promise<T>;
}

export interface PlatformDeps {
  readonly store: PlatformStore;
  readonly mailer: Mailer;
  readonly clock: Clock;
  readonly logger: Logger;
  readonly client: ClientInfo;
  readonly afterCommit: AfterCommit;
  /** APP_URL, para armar el enlace del correo. */
  readonly appUrl: string;
}
