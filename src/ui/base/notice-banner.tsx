// Aviso de resultado de una acción (éxito o advertencia) sobre una lista.
import { FormError } from '@/ui/forms/form-error';

export type Notice = { readonly tone: 'success' | 'warning'; readonly text: string };

export function NoticeBanner({ notice }: { notice: Notice | undefined }) {
  if (!notice) return null;
  if (notice.tone === 'warning') return <FormError className="mb-4" message={notice.text} />;
  return (
    <p
      role="status"
      className="mb-4 rounded-md border border-border bg-surface px-3 py-2 text-foreground"
    >
      {notice.text}
    </p>
  );
}
