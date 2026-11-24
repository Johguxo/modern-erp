// UserAdminDeps en memoria (E1-H3): repositorios de miembros e invitaciones por tenant, bloqueos y
// auditoría registrados, Entitlements configurable, Mailer que puede fallar y afterCommit que
// guarda las tareas para correrlas "después del commit" con `runAfterCommit()`.
import type { UserAdminDeps, UserCapacity } from '@/modules/identity';
import type {
  AuditEntry,
  InvitationRecord,
  MemberRecord,
  MemberStatus,
} from '@/modules/identity/application/user-admin-ports';
import { NotFoundError } from '@/shared/errors';
import type { Role } from '@/shared/permissions';
import type { AfterCommitTask } from '@/shared/ports/after-commit';
import type { MailMessage } from '@/shared/ports/mailer';

import { CapturingLogger } from './capturing-logger';
import { FixedClock } from './fixed-clock';

export interface StoredInvitation extends InvitationRecord {
  readonly tenantId: string;
  readonly tokenHash: string;
  readonly invitedBy: string;
}

export interface StoredMember extends MemberRecord {
  readonly tenantId: string;
}

export interface InMemoryUserAdmin {
  readonly deps: UserAdminDeps;
  readonly clock: FixedClock;
  readonly logger: CapturingLogger;
  readonly members: StoredMember[];
  readonly invitations: StoredInvitation[];
  readonly audit: AuditEntry[];
  readonly sent: MailMessage[];
  readonly locks: string[];
  readonly capacityCalls: string[];
  setCapacity(capacity: UserCapacity): void;
  failMailer(fail?: boolean): void;
  addMember(
    tenantId: string,
    member: Partial<MemberRecord> & { userId: string; roles: readonly Role[] },
  ): StoredMember;
  addInvitation(
    tenantId: string,
    invitation: Partial<StoredInvitation> & { email: string },
  ): StoredInvitation;
  /** Corre las tareas registradas con afterCommit y combina sus salidas (como el pipeline). */
  runAfterCommit(): Promise<Record<string, unknown>>;
}

const notPending = () => new NotFoundError({ message: 'Pending invitation not found' });

let counter = 0;
const nextId = (prefix: string) => {
  counter += 1;
  return `${prefix}-${counter}`;
};

export function createInMemoryUserAdmin(
  options: { clock?: FixedClock; appUrl?: string } = {},
): InMemoryUserAdmin {
  const clock = options.clock ?? new FixedClock();
  const logger = new CapturingLogger();
  const members: StoredMember[] = [];
  const invitations: StoredInvitation[] = [];
  const audit: AuditEntry[] = [];
  const sent: MailMessage[] = [];
  const locks: string[] = [];
  const capacityCalls: string[] = [];
  const tasks: AfterCommitTask[] = [];
  let capacity: UserCapacity = { allowed: true, limit: 10, used: 1 };
  let mailerFails = false;

  const replace = <T extends { id?: string; membershipId?: string }>(
    list: T[],
    index: number,
    value: T,
  ) => {
    list.splice(index, 1, value);
  };

  const pending = (tenantId: string) =>
    invitations.filter((i) => i.tenantId === tenantId && i.acceptedAt === null);

  const deps: UserAdminDeps = {
    members: {
      list: (tenantId) => Promise.resolve(members.filter((m) => m.tenantId === tenantId)),
      findById: (tenantId, membershipId) =>
        Promise.resolve(
          members.find((m) => m.tenantId === tenantId && m.membershipId === membershipId) ?? null,
        ),
      findByEmail: (tenantId, email) =>
        Promise.resolve(members.find((m) => m.tenantId === tenantId && m.email === email) ?? null),
      updateRoles(tenantId, membershipId, roles) {
        const index = members.findIndex(
          (m) => m.tenantId === tenantId && m.membershipId === membershipId,
        );
        const current = members[index];
        if (current) replace(members, index, { ...current, roles: [...roles] });
        return Promise.resolve();
      },
      updateStatus(tenantId, membershipId, status: MemberStatus) {
        const index = members.findIndex(
          (m) => m.tenantId === tenantId && m.membershipId === membershipId,
        );
        const current = members[index];
        if (current) replace(members, index, { ...current, membershipStatus: status, status });
        return Promise.resolve();
      },
    },
    invitations: {
      listLive: (tenantId, now) =>
        Promise.resolve(pending(tenantId).filter((i) => i.expiresAt.getTime() > now.getTime())),
      findPendingByEmail: (tenantId, email) =>
        Promise.resolve(pending(tenantId).find((i) => i.email === email) ?? null),
      findPendingById: (tenantId, id) =>
        Promise.resolve(pending(tenantId).find((i) => i.id === id) ?? null),
      create(input) {
        const id = nextId('inv');
        invitations.push({
          id,
          tenantId: input.tenantId,
          email: input.email,
          roles: [...input.roles],
          tokenHash: input.tokenHash,
          expiresAt: input.expiresAt,
          acceptedAt: null,
          invitedBy: input.invitedBy,
          invitedByName: null,
        });
        return Promise.resolve(id);
      },
      // Como el repositorio Drizzle: solo una fila pendiente; si no, NotFoundError.
      renew(tenantId, id, input) {
        const index = invitations.findIndex(
          (i) => i.tenantId === tenantId && i.id === id && i.acceptedAt === null,
        );
        const current = invitations[index];
        if (!current) return Promise.reject(notPending());
        replace(invitations, index, { ...current, ...input, roles: [...input.roles] });
        return Promise.resolve();
      },
      expire(tenantId, id, now) {
        const index = invitations.findIndex(
          (i) => i.tenantId === tenantId && i.id === id && i.acceptedAt === null,
        );
        const current = invitations[index];
        if (!current) return Promise.reject(notPending());
        replace(invitations, index, { ...current, expiresAt: now });
        return Promise.resolve();
      },
    },
    locks: {
      seats: (tenantId) => {
        locks.push(`seats:${tenantId}`);
        return Promise.resolve();
      },
      admins: (tenantId) => {
        locks.push(`admins:${tenantId}`);
        return Promise.resolve();
      },
    },
    tenants: { tenantName: () => Promise.resolve('Genrent') },
    audit: {
      record: (entry) => {
        audit.push(entry);
        return Promise.resolve();
      },
    },
    entitlements: {
      canAddUser: (tenantId) => {
        capacityCalls.push(tenantId);
        return Promise.resolve(capacity);
      },
      hasFeature: () => Promise.resolve(true),
      isReadOnly: () => Promise.resolve(false),
    },
    mailer: {
      send: (message) => {
        if (mailerFails) return Promise.reject(new Error('smtp down'));
        sent.push(message);
        return Promise.resolve({ messageId: nextId('msg') });
      },
    },
    clock,
    logger,
    client: { ip: '203.0.113.7', userAgent: 'vitest' },
    afterCommit: (task) => tasks.push(task),
    appUrl: options.appUrl ?? 'http://localhost:3000',
  };

  return {
    deps,
    clock,
    logger,
    members,
    invitations,
    audit,
    sent,
    locks,
    capacityCalls,
    setCapacity(next) {
      capacity = next;
    },
    failMailer(fail = true) {
      mailerFails = fail;
    },
    addMember(tenantId, member) {
      const stored: StoredMember = {
        tenantId,
        membershipId: member.membershipId ?? nextId('m'),
        userId: member.userId,
        fullName: member.fullName ?? `User ${member.userId}`,
        email: member.email ?? `${member.userId}@genrent.pe`,
        roles: member.roles,
        status: member.status ?? 'active',
        membershipStatus: member.membershipStatus ?? member.status ?? 'active',
      };
      members.push(stored);
      return stored;
    },
    addInvitation(tenantId, invitation) {
      const stored: StoredInvitation = {
        id: invitation.id ?? nextId('inv'),
        tenantId,
        email: invitation.email,
        roles: invitation.roles ?? ['requester'],
        tokenHash: invitation.tokenHash ?? 'old-hash',
        expiresAt: invitation.expiresAt ?? new Date(clock.now().getTime() + 86_400_000),
        acceptedAt: invitation.acceptedAt ?? null,
        invitedBy: invitation.invitedBy ?? 'someone-else',
        invitedByName: invitation.invitedByName ?? null,
      };
      invitations.push(stored);
      return stored;
    },
    async runAfterCommit() {
      let merged: Record<string, unknown> = {};
      for (const task of tasks.splice(0)) {
        const patch = await task();
        if (patch) merged = { ...merged, ...patch };
      }
      return merged;
    },
  };
}
