// Aviso de resultado de una acción (éxito o advertencia) sobre una lista.
import { FormError } from '@/ui/forms/form-error';
import { cn } from '@/ui/lib/utils';

export type Notice = { readonly tone: 'success' | 'warning'; readonly text: string };

/** `className` reemplaza el margen inferior por defecto (p. ej. `mb-0` dentro de un `gap`). */
export function NoticeBanner({
  notice,
  className,
}: {
  notice: Notice | undefined;
  className?: string;
}) {
  if (!notice) return null;
  if (notice.tone === 'warning')
    return <FormError className={cn('mb-4', className)} message={notice.text} />;
  return (
    <p
      role="status"
      className={cn(
        'mb-4 rounded-md border border-border bg-surface px-3 py-2 text-foreground',
        className,
      )}
    >
      {notice.text}
    </p>
  );
}
