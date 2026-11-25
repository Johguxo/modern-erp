// Campo con etiqueta real y su mensaje de error (anunciado y enlazado con aria-describedby).
import type { ReactNode } from 'react';

import { Label } from '@/ui/components/label';
import { cn } from '@/ui/lib/utils';

export function Field({
  label,
  htmlFor,
  error,
  errorId,
  required,
  className,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string | undefined;
  errorId: string;
  required?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-1.5', className)}>
      <Label htmlFor={htmlFor} className="text-[13px] font-semibold text-status-neutral-fg">
        <span>
          {label}
          {required ? <span aria-hidden="true"> *</span> : null}
        </span>
      </Label>
      {children}
      {error ? (
        <p id={errorId} className="text-[13px] text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
