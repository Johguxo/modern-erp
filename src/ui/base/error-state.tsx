'use client';

import { Button } from '@/ui/components/button';
import { cn } from '@/ui/lib/utils';
import { messages } from '@/ui/messages/es-PE';

export function ErrorState({
  title = messages.states.errorTitle,
  description = messages.states.errorDescription,
  reference,
  onRetry,
  className,
}: {
  title?: string;
  description?: string;
  /** Código de referencia (requestId o digest), nunca el error técnico. */
  reference?: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-center justify-center rounded-xl border border-border bg-surface px-6 py-12 text-center',
        className,
      )}
    >
      <p className="font-heading text-lg font-semibold text-foreground">{title}</p>
      <p className="mt-1 max-w-md text-muted-foreground">{description}</p>
      {reference ? (
        <p className="mt-2 text-xs text-muted-2">
          {messages.errors.reference}: <span className="font-mono">{reference}</span>
        </p>
      ) : null}
      {onRetry ? (
        <Button className="mt-6" onClick={onRetry}>
          {messages.states.retry}
        </Button>
      ) : null}
    </div>
  );
}
