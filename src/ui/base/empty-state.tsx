import type { ReactNode } from 'react';

import { cn } from '@/ui/lib/utils';

export function EmptyState({
  title,
  description,
  action,
  className,
}: {
  title: string;
  description?: string;
  /** Acción principal (por ejemplo, "Crear la primera"). */
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-xl border border-dashed border-border-strong bg-surface px-6 py-12 text-center',
        className,
      )}
    >
      <p className="font-heading text-lg font-semibold text-foreground">{title}</p>
      {description ? <p className="mt-1 max-w-md text-muted-foreground">{description}</p> : null}
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  );
}
