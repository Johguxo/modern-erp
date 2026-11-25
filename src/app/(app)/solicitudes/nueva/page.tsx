import { notFound } from 'next/navigation';

import { hasPermission } from '@/shared/authorization';

import { getTenantBrand } from '../../../_lib/company';
import { requireCtx } from '../../../_lib/session';
import { EditorHeader } from '../_editor/editor-header';
import { loadEditorData } from '../_editor/load-editor-data';
import { RequestEditor } from '../_editor/request-editor';

// Nuevo SOF (E3-H2). Sin requests.create → 404 (no revela que existe).
export default async function NewRequestPage() {
  const { ctx, email } = await requireCtx();
  if (!hasPermission(ctx, 'requests.create')) notFound();

  const [data, brand] = await Promise.all([loadEditorData(ctx), getTenantBrand(ctx)]);
  return (
    <>
      <EditorHeader mode="new" />
      <RequestEditor
        initial={null}
        costCenters={data.costCenters}
        equipment={data.equipment}
        route={data.route}
        currency={brand?.currency ?? 'PEN'}
        requesterEmail={email}
        readOnly={ctx.readOnly}
      />
    </>
  );
}
