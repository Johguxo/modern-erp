'use client';

// Formulario de los pasos de la política SOF (E4-H1): una tarjeta por paso, que se reordena con
// Subir y Bajar. Los avisos (rol sin miembros, usuarios desactivados) se recalculan en vivo con la
// misma función del servidor. En solo lectura queda deshabilitado (el servidor igual bloquea).
import { useState } from 'react';
import { useFieldArray } from 'react-hook-form';

import type { PolicyView } from '@/modules/approvals';
import {
  MAX_POLICY_STEPS,
  stepWarnings,
  updatePolicyStepsContract,
} from '@/modules/approvals/contracts';
import { TENANT_ROLES } from '@/shared/permissions';
import { Button } from '@/ui/components/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/ui/components/form';
import { Input } from '@/ui/components/input';
import { NativeSelect } from '@/ui/components/native-select';
import { applyActionError } from '@/ui/forms/apply-action-error';
import { FormError } from '@/ui/forms/form-error';
import { useZodForm } from '@/ui/forms/use-zod-form';
import { messages } from '@/ui/messages/es-PE';

import { updatePolicyStepsAction } from './actions';
import { UsersPicker } from './users-picker';

const t = messages.approvals;

function toFormValues(policy: PolicyView) {
  return {
    docType: policy.docType,
    version: policy.version,
    steps: policy.steps.map(({ name, approverType, role, userIds, rule, condition }) => ({
      name,
      approverType,
      role,
      userIds,
      rule,
      condition,
    })),
  };
}

function Warning({ children }: { children: string }) {
  return (
    <p className="rounded-md border border-warning-border bg-warning-bg px-3 py-2 text-[13px] text-warning-text">
      {children}
    </p>
  );
}

export function PolicyStepsForm({ policy, readOnly }: { policy: PolicyView; readOnly: boolean }) {
  const [view, setView] = useState(policy);
  const [notice, setNotice] = useState<string>();
  const form = useZodForm(updatePolicyStepsContract.inputSchema, toFormValues(policy));
  const { fields, append, remove, move } = useFieldArray({ control: form.control, name: 'steps' });
  const steps = form.watch('steps');

  const names = new Map<string, string>([
    ...view.inactiveUsers.map((user): [string, string] => [user.userId, user.name]),
    ...view.members.map((member): [string, string] => [member.userId, member.name]),
  ]);

  const onSubmit = form.handleSubmit(async (values) => {
    setNotice(undefined);
    const result = await updatePolicyStepsAction(values);
    if (!result.ok) {
      applyActionError(form.setError, result.error);
      return;
    }
    setView(result.data);
    form.reset(toFormValues(result.data));
    setNotice(t.saved);
  });

  const disabled = readOnly || form.formState.isSubmitting;

  return (
    <Form {...form}>
      <form
        onSubmit={(event) => void onSubmit(event)}
        className="flex max-w-3xl flex-col gap-4"
        noValidate
      >
        <p className="text-[13px] font-medium text-muted-foreground">{t.policyLabel(view.name)}</p>
        {notice ? (
          <p
            role="status"
            className="rounded-md border border-border bg-surface px-3 py-2 text-foreground"
          >
            {notice}
          </p>
        ) : null}
        <FormError message={form.formState.errors.root?.server?.message} />
        <fieldset disabled={readOnly} className="flex min-w-0 flex-col gap-4">
          <legend className="sr-only">{t.stepsLabel}</legend>
          {fields.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border bg-surface p-5 text-muted-foreground">
              {t.empty}
            </p>
          ) : (
            <ol className="flex flex-col gap-4">
              {fields.map((field, index) => {
                const step = steps[index];
                const warnings = step ? stepWarnings(step, view.members) : [];
                const errors = form.formState.errors.steps?.[index];
                return (
                  <li key={field.id}>
                    <fieldset className="flex min-w-0 flex-col gap-4 rounded-xl border border-border bg-surface p-4 md:p-5">
                      <legend className="px-1 text-base font-semibold">
                        {t.stepTitle(index + 1)}
                      </legend>
                      <FormField
                        control={form.control}
                        name={`steps.${index}.name`}
                        render={({ field: nameField }) => (
                          <FormItem>
                            <FormLabel>{t.name}</FormLabel>
                            <FormControl>
                              <Input {...nameField} placeholder={t.namePlaceholder} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <div className="grid gap-4 sm:grid-cols-2">
                        <FormField
                          control={form.control}
                          name={`steps.${index}.approverType`}
                          render={({ field: typeField }) => (
                            <FormItem>
                              <FormLabel>{t.approverType}</FormLabel>
                              <FormControl>
                                <NativeSelect {...typeField}>
                                  <option value="role">{t.approverTypes.role}</option>
                                  <option value="users">{t.approverTypes.users}</option>
                                </NativeSelect>
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name={`steps.${index}.rule`}
                          render={({ field: ruleField }) => (
                            <FormItem>
                              <FormLabel>{t.rule}</FormLabel>
                              <FormControl>
                                <NativeSelect {...ruleField}>
                                  <option value="any">{t.rules.any}</option>
                                  <option value="all">{t.rules.all}</option>
                                </NativeSelect>
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                      {step?.approverType === 'users' ? (
                        <FormField
                          control={form.control}
                          name={`steps.${index}.userIds`}
                          render={({ field: usersField }) => (
                            <FormItem>
                              <FormLabel>{t.users}</FormLabel>
                              <UsersPicker
                                members={view.members}
                                names={names}
                                value={usersField.value}
                                onChange={usersField.onChange}
                                disabled={disabled}
                                invalid={Boolean(errors?.userIds)}
                              />
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      ) : (
                        <FormField
                          control={form.control}
                          name={`steps.${index}.role`}
                          render={({ field: roleField }) => (
                            <FormItem>
                              <FormLabel>{t.role}</FormLabel>
                              <FormControl>
                                <NativeSelect
                                  name={roleField.name}
                                  ref={roleField.ref}
                                  onBlur={roleField.onBlur}
                                  value={roleField.value ?? ''}
                                  onChange={(event) =>
                                    roleField.onChange(event.target.value || null)
                                  }
                                >
                                  <option value="">{t.rolePlaceholder}</option>
                                  {TENANT_ROLES.map((role) => (
                                    <option key={role} value={role}>
                                      {messages.roles[role]}
                                    </option>
                                  ))}
                                </NativeSelect>
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      )}
                      {warnings.map((warning) =>
                        warning.type === 'role_without_members' ? (
                          <Warning key={warning.type}>
                            {t.warnings.roleWithoutMembers(
                              step?.role ? messages.roles[step.role] : '',
                            )}
                          </Warning>
                        ) : (
                          <Warning key={warning.type}>
                            {t.warnings.inactiveUsers(
                              warning.userIds.map((id) => names.get(id) ?? '').join(', '),
                            )}
                          </Warning>
                        ),
                      )}
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          disabled={disabled || index === 0}
                          onClick={() => move(index, index - 1)}
                        >
                          {t.moveUp}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          disabled={disabled || index === fields.length - 1}
                          onClick={() => move(index, index + 1)}
                        >
                          {t.moveDown}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          disabled={disabled}
                          onClick={() => remove(index)}
                        >
                          {t.remove}
                        </Button>
                      </div>
                    </fieldset>
                  </li>
                );
              })}
            </ol>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              variant="outline"
              disabled={disabled || fields.length >= MAX_POLICY_STEPS}
              onClick={() =>
                append({
                  name: '',
                  approverType: 'role',
                  role: null,
                  userIds: [],
                  rule: 'any',
                  condition: {},
                })
              }
            >
              {t.addStep}
            </Button>
            {fields.length >= MAX_POLICY_STEPS ? (
              <span className="text-[13px] text-muted-foreground">
                {t.maxSteps(MAX_POLICY_STEPS)}
              </span>
            ) : null}
          </div>
          <div>
            <Button type="submit" disabled={disabled}>
              {form.formState.isSubmitting ? t.saving : t.save}
            </Button>
          </div>
        </fieldset>
      </form>
    </Form>
  );
}
