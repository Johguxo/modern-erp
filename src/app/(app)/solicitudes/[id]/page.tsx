import { notFound } from 'next/navigation';

import { withTenant } from '@/db';
import { createGetRequestDetailDeps, getRequestDetail } from '@/modules/requests';
import { getRequestDetailContract } from '@/modules/requests/contracts';
import { isDomainError } from '@/shared/errors';
import { NoticeBanner } from '@/ui/base/notice-banner';
import { messages } from '@/ui/messages/es-PE';

import { readOnlyRequestsExtras } from '../../../_lib/requests';
import { requireCtx } from '../../../_lib/session';

import { SOON_NOTE_ID, soonNoteId } from './_detail/detail-actions';
import { DetailHeader } from './_detail/detail-header';
import { DetailItems } from './_detail/detail-items';
import { DocumentCard } from './_detail/document-card';
import { TimelinePanel } from './_detail/timeline-panel';

const t = messages.requests.detail;

// Detalle del SOF (E3-H4, pantalla 3): ítems, documento, línea de tiempo y acciones. Quien no puede
// ver la solicitud (otro tenant, borrador ajeno, id inválido o sin permisos) recibe 404 y no se
// entera de que existe.
export default async function RequestPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const { enviado, anulado } = await searchParams;
  const { ctx } = await requireCtx();
  if (!getRequestDetailContract.inputSchema.safeParse({ id }).success) notFound();

  const detail = await withTenant(ctx, (tx) =>
    getRequestDetail(ctx, { id }, createGetRequestDetailDeps(tx, readOnlyRequestsExtras())),
  ).catch((error: unknown) => {
    if (isDomainError(error) && (error.code === 'NOT_FOUND' || error.code === 'FORBIDDEN')) {
      notFound();
    }
    throw error;
  });

  const noteId = soonNoteId(detail.actions);
  // Tras enviar, el editor llega con ?enviado=1; tras anular, el diálogo con ?anulado=1.
  const notice =
    enviado === '1' &&
    detail.number !== null &&
    detail.requesterId === ctx.userId &&
    detail.status === 'in_approval'
      ? ({ tone: 'success', text: t.submittedNotice(detail.number) } as const)
      : anulado === '1' && detail.status === 'cancelled' && detail.closedById === ctx.userId
        ? ({ tone: 'success', text: t.cancelledNotice(detail.number) } as const)
        : undefined;

  return (
    <div className="flex flex-col gap-5">
      <NoticeBanner notice={notice} className="mb-0" />
      <DetailHeader detail={detail} />
      {noteId ? (
        <p id={SOON_NOTE_ID} className="-mt-2 text-[13px] text-muted-foreground">
          {t.actions.soon}
        </p>
      ) : null}
      <div className="flex flex-wrap items-start gap-5">
        <div className="flex min-w-0 flex-[999_1_520px] flex-col gap-5">
          <DetailItems
            detail={detail}
            actions={detail.actions}
            readOnly={ctx.readOnly}
            noteId={noteId}
          />
          <DocumentCard detail={detail} readOnly={ctx.readOnly} noteId={noteId} />
        </div>
        <TimelinePanel detail={detail} timeZone={ctx.timezone} readOnly={ctx.readOnly} />
      </div>
    </div>
  );
}
