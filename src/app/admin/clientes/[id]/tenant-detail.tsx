'use client';

// Detalle de un cliente en la consola (E1-H4): suscripción (plan, estado, límite de usuarios),
// uso, invitaciones pendientes e invitar a un administrador.
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import type { PlanOption, TenantDetail } from '@/modules/identity';
import type { SequenceView } from '@/modules/requests';
import {
  platformInviteTenantAdminContract,
  platformUpdateSubscriptionContract,
  SUBSCRIPTION_STATUSES,
} from '@/modules/identity/contracts';
import { Button } from '@/ui/components/button';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/ui/components/form';
import { Input } from '@/ui/components/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/ui/components/select';
import { applyActionError } from '@/ui/forms/apply-action-error';
import { FormError } from '@/ui/forms/form-error';
import { useZodForm } from '@/ui/forms/use-zod-form';
import { formatDateTime } from '@/ui/format/date';
import { messages } from '@/ui/messages/es-PE';

import { DocumentSequenceForm } from '../../../_components/document-sequence-form';
import {
  inviteTenantAdminAction,
  updateDocumentSequenceAction,
  updateSubscriptionAction,
} from '../actions';
import { MaxUsersInput } from '../max-users-input';
import { SubscriptionBadge } from '../subscription-badge';

const t = messages.admin;
const f = t.form;

export type DetailNotice = 'created' | 'createdEmailFailed';
type Notice = { readonly tone: 'success' | 'warning'; readonly text: string };

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

function initialNoticeOf(notice: DetailNotice | undefined): Notice | undefined {
  if (notice === 'created') return { tone: 'success', text: t.notices.created };
  if (notice === 'createdEmailFailed')
    return { tone: 'warning', text: t.notices.createdEmailFailed };
  return undefined;
}

export function TenantDetailView({
  tenant,
  plans,
  sequence,
  initialNotice,
}: {
  tenant: TenantDetail;
  plans: readonly PlanOption[];
  sequence: SequenceView | null;
  initialNotice?: DetailNotice;
}) {
  const router = useRouter();
  const [notice, setNotice] = useState<Notice | undefined>(() => initialNoticeOf(initialNotice));
  const done = (next: Notice) => {
    setNotice(next);
    router.refresh();
  };
  const subscription = tenant.subscription;
  // El plan actual puede estar retirado: se muestra igual para no perderlo al guardar.
  const planOptions =
    subscription && !plans.some((p) => p.code === subscription.planCode)
      ? [...plans, { code: subscription.planCode, name: subscription.planName, maxUsers: null }]
      : plans;

  return (
    <>
      <NoticeBanner notice={notice} />
      <div className="grid gap-6 lg:grid-cols-2">
        <section
          aria-labelledby="subscription-title"
          className="rounded-xl border border-border bg-surface p-4 md:p-6"
        >
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 id="subscription-title" className="text-lg font-semibold">
              {t.detail.subscriptionTitle}
            </h2>
            <SubscriptionBadge status={subscription?.status ?? null} />
          </div>
          <SubscriptionForm
            tenantId={tenant.tenantId}
            plans={planOptions}
            current={subscription}
            onDone={done}
          />
        </section>

        <section
          aria-labelledby="users-title"
          className="rounded-xl border border-border bg-surface p-4 md:p-6"
        >
          <h2 id="users-title" className="mb-2 text-lg font-semibold">
            {t.detail.usersTitle}
          </h2>
          <p className="mb-4 text-muted-foreground">
            {t.detail.usage(tenant.activeMembers, subscription?.userLimit ?? null)}
          </p>
          <h3 className="mb-2 font-semibold">{t.detail.invitationsTitle}</h3>
          {tenant.invitations.length === 0 ? (
            <p className="mb-4 text-muted-foreground">{t.detail.invitationsEmpty}</p>
          ) : (
            <ul className="mb-4 divide-y divide-border rounded-md border border-border">
              {tenant.invitations.map((invitation) => (
                <li key={invitation.invitationId} className="px-3 py-2">
                  <p className="font-medium break-all">{invitation.email}</p>
                  <p className="text-sm text-muted-foreground">
                    {invitation.expired
                      ? t.detail.expired
                      : t.detail.expires(formatDateTime(invitation.expiresAt, tenant.timezone))}
                  </p>
                </li>
              ))}
            </ul>
          )}
          <InviteAdminForm tenantId={tenant.tenantId} onDone={done} />
        </section>

        {sequence ? (
          <section
            aria-labelledby="sequence-title"
            className="rounded-xl border border-border bg-surface p-4 md:p-6 lg:col-span-2"
          >
            <h2 id="sequence-title" className="mb-1 text-lg font-semibold">
              {messages.sequence.title}
            </h2>
            <p className="mb-4 text-muted-foreground">{messages.sequence.description}</p>
            <div className="max-w-xl">
              <DocumentSequenceForm
                sequence={sequence}
                onSave={(values) =>
                  updateDocumentSequenceAction({ tenantId: tenant.tenantId, ...values })
                }
              />
            </div>
          </section>
        ) : null}
      </div>
    </>
  );
}

function SubscriptionForm({
  tenantId,
  plans,
  current,
  onDone,
}: {
  tenantId: string;
  plans: readonly PlanOption[];
  current: TenantDetail['subscription'];
  onDone: (notice: Notice) => void;
}) {
  const form = useZodForm(platformUpdateSubscriptionContract.inputSchema, {
    tenantId,
    planCode: current?.planCode ?? plans[0]?.code ?? '',
    status: current?.status ?? 'active',
    maxUsers: current?.maxUsersOverride == null ? '' : String(current.maxUsersOverride),
  });

  const onSubmit = form.handleSubmit(async (values) => {
    const result = await updateSubscriptionAction(values);
    if (!result.ok) {
      applyActionError(form.setError, result.error);
      return;
    }
    onDone({
      tone: 'success',
      text: result.data.changed ? t.notices.saved : t.notices.unchanged,
    });
  });

  return (
    <Form {...form}>
      <form onSubmit={(event) => void onSubmit(event)} className="flex flex-col gap-4" noValidate>
        <FormError message={form.formState.errors.root?.server?.message} />
        <FormField
          control={form.control}
          name="planCode"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{f.plan}</FormLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={f.select} />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {plans.map((plan) => (
                    <SelectItem key={plan.code} value={plan.code}>
                      {f.planOption(plan.name, plan.maxUsers)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="status"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{f.status}</FormLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={f.select} />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {SUBSCRIPTION_STATUSES.map((status) => (
                    <SelectItem key={status} value={status}>
                      {messages.status[`subscription_${status}`]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormDescription>{f.statusHint}</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="maxUsers"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{f.maxUsers}</FormLabel>
              <FormControl>
                <MaxUsersInput {...field} />
              </FormControl>
              <FormDescription>{f.maxUsersHint}</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <div>
          <Button type="submit" disabled={form.formState.isSubmitting}>
            {f.save}
          </Button>
        </div>
      </form>
    </Form>
  );
}

function InviteAdminForm({
  tenantId,
  onDone,
}: {
  tenantId: string;
  onDone: (notice: Notice) => void;
}) {
  const form = useZodForm(platformInviteTenantAdminContract.inputSchema, {
    tenantId,
    email: '',
  });

  const onSubmit = form.handleSubmit(async (values) => {
    const result = await inviteTenantAdminAction(values);
    if (!result.ok) {
      applyActionError(form.setError, result.error);
      return;
    }
    form.reset({ tenantId, email: '' });
    onDone(
      result.data.emailSent
        ? { tone: 'success', text: t.notices.invited }
        : { tone: 'warning', text: t.notices.emailFailed },
    );
  });

  return (
    <Form {...form}>
      <form
        onSubmit={(event) => void onSubmit(event)}
        className="flex flex-col gap-3 border-t border-border pt-4"
        noValidate
        aria-labelledby="invite-admin-title"
      >
        <h3 id="invite-admin-title" className="font-semibold">
          {t.detail.inviteTitle}
        </h3>
        <p className="text-sm text-muted-foreground">{t.detail.inviteDescription}</p>
        <FormError message={form.formState.errors.root?.server?.message} />
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{messages.auth.email}</FormLabel>
              <FormControl>
                <Input type="email" autoComplete="off" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div>
          <Button type="submit" variant="outline" disabled={form.formState.isSubmitting}>
            {t.detail.inviteSubmit}
          </Button>
        </div>
      </form>
    </Form>
  );
}
