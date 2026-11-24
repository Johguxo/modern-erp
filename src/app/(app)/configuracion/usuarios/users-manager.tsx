'use client';

// /configuracion/usuarios (E1-H3): miembros (nombre, correo, roles, estado) e invitaciones
// pendientes. En solo lectura las acciones quedan deshabilitadas (el servidor igual las bloquea).
import type { ColumnDef } from '@tanstack/react-table';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import type { ListMembersOutput, MemberListItem } from '@/modules/identity';
import type { Role } from '@/shared/permissions';
import { DataTable } from '@/ui/base/data-table';
import { PageHeader } from '@/ui/base/page-header';
import { StatusBadge } from '@/ui/base/status-badge';
import { Button } from '@/ui/components/button';
import { FormError } from '@/ui/forms/form-error';
import { formatDateTime } from '@/ui/format/date';
import { messages } from '@/ui/messages/es-PE';

import { cancelInvitationAction, reactivateMemberAction, resendInvitationAction } from './actions';
import { DisableDialog, EditRolesDialog, InviteDialog, type Notice } from './member-dialogs';

const t = messages.users;

function roleLabels(roles: readonly Role[]): string {
  return roles.map((role) => messages.roles[role]).join(', ');
}

function NoticeBanner({ notice }: { notice: Notice | undefined }) {
  if (!notice) return null;
  if (notice.tone === 'warning') return <FormError className="mb-4" message={notice.text} />;
  return (
    <p
      role="status"
      className="mb-4 rounded-md border border-border bg-surface px-3 py-2 text-foreground"
    >
      {notice.text}
    </p>
  );
}

export function UsersManager({
  data,
  readOnly,
  timeZone,
}: {
  data: ListMembersOutput;
  readOnly: boolean;
  timeZone: string;
}) {
  const router = useRouter();
  const [notice, setNotice] = useState<Notice>();
  const [pending, startTransition] = useTransition();

  const done = (next: Notice) => {
    setNotice(next);
    router.refresh();
  };

  /** Acción de un clic (reenviar, anular, reactivar): el error se muestra arriba. */
  const run = (
    call: () => Promise<{ ok: true; data: object } | { ok: false; error: { message: string } }>,
    success: (data: object) => Notice,
  ) =>
    startTransition(async () => {
      const result = await call();
      if (!result.ok) {
        setNotice({ tone: 'warning', text: result.error.message });
        return;
      }
      done(success(result.data));
    });

  const columns: ColumnDef<MemberListItem, unknown>[] = [
    {
      id: 'name',
      header: t.columns.name,
      cell: ({ row }) => (
        <span className="font-medium">
          {row.original.fullName}
          {row.original.isSelf ? (
            <span className="ml-2 text-xs text-muted-foreground">({t.you})</span>
          ) : null}
        </span>
      ),
    },
    { id: 'email', header: t.columns.email, cell: ({ row }) => row.original.email },
    { id: 'roles', header: t.columns.roles, cell: ({ row }) => roleLabels(row.original.roles) },
    {
      id: 'status',
      header: t.columns.status,
      cell: ({ row }) => (
        <StatusBadge status={row.original.status === 'active' ? 'user_active' : 'user_disabled'} />
      ),
    },
    {
      id: 'actions',
      header: t.columns.actions,
      cell: ({ row }) => {
        const member = row.original;
        return (
          <div className="flex flex-wrap gap-2">
            <EditRolesDialog member={member} disabled={readOnly} onDone={done} />
            {member.membershipStatus === 'active' ? (
              member.isSelf ? null : (
                <DisableDialog member={member} disabled={readOnly} onDone={done} />
              )
            ) : (
              <Button
                variant="outline"
                disabled={readOnly || pending}
                onClick={() =>
                  run(
                    () => reactivateMemberAction({ membershipId: member.membershipId }),
                    () => ({ tone: 'success', text: t.notices.reactivated }),
                  )
                }
              >
                {t.reactivate}
              </Button>
            )}
          </div>
        );
      },
    },
  ];

  return (
    <>
      <PageHeader
        title={t.title}
        description={`${t.description} ${t.seats(data.seats.used, data.seats.limit)}`}
        actions={<InviteDialog disabled={readOnly} onDone={done} />}
      />
      <NoticeBanner notice={notice} />
      <DataTable columns={columns} data={[...data.members]} />

      <section aria-labelledby="pending-invitations" className="mt-8">
        <h2 id="pending-invitations" className="mb-3 text-lg font-semibold">
          {t.pendingTitle}
        </h2>
        {data.invitations.length === 0 ? (
          <p className="text-muted-foreground">{t.pendingEmpty}</p>
        ) : (
          <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
            {data.invitations.map((invitation) => (
              <li
                key={invitation.invitationId}
                className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="font-medium break-all">{invitation.email}</p>
                  <p className="text-sm text-muted-foreground">
                    {roleLabels(invitation.roles)} ·{' '}
                    {t.expires(formatDateTime(invitation.expiresAt, timeZone))}
                    {invitation.invitedByName ? ` · ${t.invitedBy(invitation.invitedByName)}` : ''}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button
                    variant="outline"
                    disabled={readOnly || pending}
                    onClick={() =>
                      run(
                        () => resendInvitationAction({ invitationId: invitation.invitationId }),
                        (result) =>
                          'emailSent' in result && result.emailSent
                            ? { tone: 'success', text: t.notices.resent }
                            : { tone: 'warning', text: t.notices.emailFailed },
                      )
                    }
                  >
                    {t.resend}
                  </Button>
                  <Button
                    variant="outline"
                    disabled={readOnly || pending}
                    onClick={() =>
                      run(
                        () => cancelInvitationAction({ invitationId: invitation.invitationId }),
                        () => ({ tone: 'success', text: t.notices.cancelled }),
                      )
                    }
                  >
                    {t.cancelInvitation}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
