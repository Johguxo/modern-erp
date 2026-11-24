'use client';

// Casillas de roles (uno o varios) para React Hook Form.
import type { Control, FieldPath, FieldValues } from 'react-hook-form';

import { ASSIGNABLE_ROLES } from '@/modules/identity/contracts';
import { Checkbox } from '@/ui/components/checkbox';
import { FormField, FormItem, FormMessage } from '@/ui/components/form';
import { Label } from '@/ui/components/label';
import { messages } from '@/ui/messages/es-PE';

type AssignableRole = (typeof ASSIGNABLE_ROLES)[number];

export function RolesField<T extends FieldValues>({
  control,
  name,
}: {
  control: Control<T>;
  name: FieldPath<T>;
}) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => {
        const value = (field.value ?? []) as AssignableRole[];
        const toggle = (role: AssignableRole, checked: boolean) =>
          field.onChange(checked ? [...value, role] : value.filter((r) => r !== role));
        return (
          <FormItem>
            <fieldset className="flex flex-col gap-1">
              <legend className="mb-1 text-sm font-medium">{messages.users.rolesLabel}</legend>
              {ASSIGNABLE_ROLES.map((role) => {
                const id = `${String(name)}-${role}`;
                return (
                  <div key={role} className="flex min-h-11 items-center gap-3">
                    <Checkbox
                      id={id}
                      checked={value.includes(role)}
                      onCheckedChange={(checked) => toggle(role, checked === true)}
                      onBlur={field.onBlur}
                    />
                    <Label htmlFor={id} className="font-normal">
                      {messages.roles[role]}
                    </Label>
                  </div>
                );
              })}
            </fieldset>
            <FormMessage />
          </FormItem>
        );
      }}
    />
  );
}
