import { notFound } from 'next/navigation';
import { z } from 'zod';

import { hasPermission } from '@/shared/authorization';
import { isDomainError } from '@/shared/errors';

import { requireCtx } from '../../../../_lib/session';
import { EditorHeader } from '../../_editor/editor-header';
import { loadEditorData, type EditorData } from '../../_editor/load-editor-data';
import { RequestEditor } from '../../_editor/request-editor';

// Editar un borrador (E3-H2) o una solicitud con «Cambios solicitados» (E4-H2). Solo el
// solicitante y solo en esos estados: cualquier otro caso (otro usuario, otro tenant, ya enviado,
// id inválido, sin permiso) es 404 y no revela que existe.
export default async function EditRequestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { ctx, email } = await requireCtx();
  if (!z.uuid().safeParse(id).success) notFound();
  if (!hasPermission(ctx, 'requests.create')) notFound();

  const data: EditorData = await loadEditorData(ctx, id).catch((error: unknown) => {
    if (isDomainError(error) && error.code === 'NOT_FOUND') notFound();
    throw error;
  });
  const draft = data.draft;
  if (!draft) notFound();

  return (
    <>
      <EditorHeader mode={draft.status === 'changes_requested' ? 'changes' : 'edit'} />
      <RequestEditor
        initial={draft}
        costCenters={data.costCenters}
        equipment={data.equipment}
        route={data.route}
        currency={data.currency}
        requesterEmail={email}
        readOnly={ctx.readOnly}
      />
    </>
  );
}
