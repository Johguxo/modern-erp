'use client';

// Campo "Límite de usuarios" (E1-H4): vacío = el del plan. El contrato lo convierte a número.
import type { ComponentProps } from 'react';

import { Input } from '@/ui/components/input';

export function MaxUsersInput({
  value,
  onChange,
  ...props
}: Omit<ComponentProps<typeof Input>, 'value' | 'onChange'> & {
  value: unknown;
  onChange: (value: string) => void;
}) {
  return (
    <Input
      {...props}
      type="number"
      inputMode="numeric"
      min={1}
      value={typeof value === 'string' || typeof value === 'number' ? value : ''}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}
