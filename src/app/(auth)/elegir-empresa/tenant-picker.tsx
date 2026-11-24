'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { Button } from '@/ui/components/button';
import { FormError } from '@/ui/forms/form-error';

import { selectTenantAction } from '../actions';

export function TenantPicker({
  tenants,
}: {
  tenants: readonly { tenantId: string; tenantName: string }[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  const choose = (tenantId: string) =>
    startTransition(async () => {
      const result = await selectTenantAction({ tenantId });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      router.replace('/bandeja');
      router.refresh();
    });

  return (
    <div className="flex flex-col gap-2">
      <FormError message={error} />
      <ul className="flex flex-col gap-2">
        {tenants.map((tenant) => (
          <li key={tenant.tenantId}>
            <Button
              type="button"
              variant="outline"
              className="w-full justify-start"
              disabled={pending}
              onClick={() => choose(tenant.tenantId)}
            >
              {tenant.tenantName}
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
