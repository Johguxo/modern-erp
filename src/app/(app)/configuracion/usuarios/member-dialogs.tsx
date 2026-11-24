'use client';

// Diálogos de /configuracion/usuarios (E1-H3): invitar, editar roles y desactivar. Cada uno llama
// a su server action; los errores (último admin, límite del plan, solo lectura…) llegan en es-PE.
import { useState, useTransition } from 'react';

import type { MemberListItem } from '@/modules/identity';
import {
  ASSIGNABLE_ROLES,
  inviteUserContract,
  updateMemberRolesContract,
} from '@/modules/identity/contracts';
import { Button } from '@/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/ui/components/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/ui/components/form';
import { Input } from '@/ui/components/input';
import { applyActionError } from '@/ui/forms/apply-action-error';
import { FormError } from '@/ui/forms/form-error';
import { useZodForm } from '@/ui/forms/use-zod-form';
import { messages } from '@/ui/messages/es-PE';

import { disableMemberAction, inviteUserAction, updateMemberRolesAction } from './actions';
import { RolesField } from './roles-field';

const t = messages.users;
type AssignableRole = (typeof ASSIGNABLE_ROLES)[number];

export type Notice = { readonly tone: 'success' | 'warning'; readonly text: string };

export function InviteDialog({
  disabled,
  onDone,
}: {
  disabled: boolean;
  onDone: (notice: Notice) => void;
}) {
  const [open, setOpen] = useState(false);
  const form = useZodForm(inviteUserContract.inputSchema, { email: '', roles: ['requester'] });

  const onSubmit = form.handleSubmit(async (values) => {
    const result = await inviteUserAction(values);
    if (!result.ok) {
      applyActionError(form.setError, result.error);
      return;
    }
    form.reset();
    setOpen(false);
    onDone(
      result.data.emailSent
        ? { tone: 'success', text: t.notices.invited }
        : { tone: 'warning', text: t.notices.emailFailed },
    );
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button disabled={disabled}>{t.invite}</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t.inviteTitle}</DialogTitle>
          <DialogDescription>{t.inviteDescription}</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form
            onSubmit={(event) => void onSubmit(event)}
            className="flex flex-col gap-4"
            noValidate
          >
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
            <RolesField control={form.control} name="roles" />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                {t.cancel}
              </Button>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {t.inviteSubmit}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

export function EditRolesDialog({
  member,
  disabled,
  onDone,
}: {
  member: MemberListItem;
  disabled: boolean;
  onDone: (notice: Notice) => void;
}) {
  const [open, setOpen] = useState(false);
  const current = member.roles.filter((r): r is AssignableRole =>
    (ASSIGNABLE_ROLES as readonly string[]).includes(r),
  );
  const form = useZodForm(updateMemberRolesContract.inputSchema, {
    membershipId: member.membershipId,
    roles: current,
  });

  const onSubmit = form.handleSubmit(async (values) => {
    const result = await updateMemberRolesAction(values);
    if (!result.ok) {
      applyActionError(form.setError, result.error);
      return;
    }
    setOpen(false);
    onDone({ tone: 'success', text: t.notices.rolesSaved });
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) form.reset({ membershipId: member.membershipId, roles: current });
        setOpen(next);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" disabled={disabled}>
          {t.editRoles}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t.editRolesTitle(member.fullName)}</DialogTitle>
          <DialogDescription>{member.email}</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form
            onSubmit={(event) => void onSubmit(event)}
            className="flex flex-col gap-4"
            noValidate
          >
            <FormError message={form.formState.errors.root?.server?.message} />
            <RolesField control={form.control} name="roles" />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                {t.cancel}
              </Button>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {t.save}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

export function DisableDialog({
  member,
  disabled,
  onDone,
}: {
  member: MemberListItem;
  disabled: boolean;
  onDone: (notice: Notice) => void;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  const confirm = () =>
    startTransition(async () => {
      const result = await disableMemberAction({ membershipId: member.membershipId });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setOpen(false);
      onDone({ tone: 'success', text: t.notices.disabled });
    });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setError(undefined);
        setOpen(next);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" disabled={disabled}>
          {t.disable}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t.disableTitle(member.fullName)}</DialogTitle>
          <DialogDescription>{t.disableDescription}</DialogDescription>
        </DialogHeader>
        <FormError message={error} />
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            {t.cancel}
          </Button>
          <Button type="button" variant="destructive" disabled={pending} onClick={confirm}>
            {t.disable}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
