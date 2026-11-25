'use client';

// Tarjeta «Numeración de SOF» de /configuracion/empresa (E3-H1). En solo lectura queda deshabilitada.
import type { SequenceView } from '@/modules/requests';
import { messages } from '@/ui/messages/es-PE';

import { DocumentSequenceForm } from '../../../_components/document-sequence-form';

import { updateDocumentSequenceAction } from './actions';

const t = messages.sequence;

export function SequenceCard({
  sequence,
  readOnly,
}: {
  sequence: SequenceView;
  readOnly: boolean;
}) {
  return (
    <section
      aria-labelledby="sequence-title"
      className="rounded-xl border border-border bg-surface p-4 md:p-6"
    >
      <h2 id="sequence-title" className="mb-1 text-lg font-semibold">
        {t.title}
      </h2>
      <p className="mb-4 text-muted-foreground">{t.description}</p>
      <DocumentSequenceForm
        sequence={sequence}
        readOnly={readOnly}
        onSave={(values) => updateDocumentSequenceAction(values)}
      />
    </section>
  );
}
