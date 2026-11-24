import { cn } from '@/ui/lib/utils';

/** Error general del formulario (root.server): visible y anunciado a lectores de pantalla. */
export function FormError({ message, className }: { message?: string; className?: string }) {
  if (!message) return null;
  return (
    <p
      role="alert"
      className={cn(
        'rounded-md border border-warning-border bg-warning-bg px-3 py-2 text-warning-text',
        className,
      )}
    >
      {message}
    </p>
  );
}
