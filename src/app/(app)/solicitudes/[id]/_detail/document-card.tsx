// Tarjeta «Documento»: el PDF se genera al aprobarse (E5-H1); hasta entonces el botón está
// deshabilitado.
import { FileTextIcon } from 'lucide-react';

import type { RequestDetail } from '@/modules/requests';
import { messages } from '@/ui/messages/es-PE';

import { ActionButton } from './action-button';

const t = messages.requests.detail.document;

export function DocumentCard({
  detail,
  readOnly,
  noteId,
}: {
  detail: RequestDetail;
  readOnly: boolean;
  noteId?: string;
}) {
  return (
    <section
      aria-label={t.title}
      className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface px-5 py-4"
    >
      <FileTextIcon aria-hidden="true" className="size-[22px] text-primary" />
      <p className="min-w-0 flex-[1_1_200px]">
        <strong>{t.fileName(detail.number)}</strong>
        <span className="text-muted-foreground"> · {t.hint}</span>
      </p>
      <ActionButton
        action="download_pdf"
        requestId={detail.id}
        readOnly={readOnly}
        noteId={noteId}
      />
    </section>
  );
}
