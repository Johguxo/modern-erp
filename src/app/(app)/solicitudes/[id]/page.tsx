import { notFound } from 'next/navigation';

import { withTenant } from '@/db';
import { createCatalogDeps, listEquipment } from '@/modules/catalog';
import { createGetRequestDetailDeps, getRequestDetail } from '@/modules/requests';
import { getRequestDetailContract } from '@/modules/requests/contracts';
import { isDomainError } from '@/shared/errors';
import { NoticeBanner } from '@/ui/base/notice-banner';
import { cn } from '@/ui/lib/utils';
import { messages } from '@/ui/messages/es-PE';

import { readOnlyCatalogExtras } from '../../../_lib/catalog';
import { readOnlyRequestsExtras } from '../../../_lib/requests';
import { requireCtx } from '../../../_lib/session';

import { CorrectionNotice } from './_detail/correction-notice';
import { SOON_NOTE_ID, soonNoteId } from './_detail/detail-actions';
import { DetailHeader } from './_detail/detail-header';
import { DetailItems } from './_detail/detail-items';
import { DocumentCard } from './_detail/document-card';
import { decidedNotice } from './_detail/decided-notice';
import { showsMobileBar } from './_detail/mobile-bar-rules';
import { MOBILE_BAR_SPACE, MobileDecisionBar } from './_detail/mobile-decision-bar';
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
  const { enviado, anulado, decision, reenviado, corregido } = await searchParams;
  const { ctx } = await requireCtx();
  if (!getRequestDetailContract.inputSchema.safeParse({ id }).success) notFound();

  const { detail, equipment } = await withTenant(ctx, async (tx) => {
    const found = await getRequestDetail(
      ctx,
      { id },
      createGetRequestDetailDeps(tx, readOnlyRequestsExtras(tx)),
    );
    // Los equipos activos solo hacen falta para el diálogo «Corregir una línea».
    const active = found.actions.includes('correct_line')
      ? await listEquipment(
          ctx,
          { q: null, status: 'active', page: 1, pageSize: 100 },
          createCatalogDeps(tx, readOnlyCatalogExtras()),
        )
      : null;
    return {
      detail: found,
      equipment: (active?.items ?? []).map((item) => ({
        id: item.id,
        label: `${item.code} · ${item.name}`,
      })),
    };
  }).catch((error: unknown) => {
    if (isDomainError(error) && (error.code === 'NOT_FOUND' || error.code === 'FORBIDDEN')) {
      notFound();
    }
    throw error;
  });

  const noteId = soonNoteId(detail.actions);
  // Tras enviar, el editor llega con ?enviado=1; tras anular, el diálogo con ?anulado=1.
  const notice =
    reenviado === '1' && detail.requesterId === ctx.userId && detail.status === 'in_approval'
      ? ({ tone: 'success', text: t.resubmittedNotice(detail.number) } as const)
      : enviado === '1' &&
          detail.number !== null &&
          detail.requesterId === ctx.userId &&
          detail.status === 'in_approval'
        ? ({ tone: 'success', text: t.submittedNotice(detail.number) } as const)
        : corregido === '1' &&
            detail.correctionNotice !== null &&
            (detail.status === 'in_approval' || detail.status === 'approved')
          ? ({ tone: 'success', text: t.correctLine.savedNotice(detail.number) } as const)
          : anulado === '1' && detail.status === 'cancelled' && detail.closedById === ctx.userId
            ? ({ tone: 'success', text: t.cancelledNotice(detail.number) } as const)
            : decidedNotice(
                decision,
                detail.status,
                detail.requesterId !== ctx.userId,
                detail.number,
              );

  const mobileBar = showsMobileBar(detail, ctx.readOnly);

  return (
    <div className={cn('flex flex-col gap-5', mobileBar && MOBILE_BAR_SPACE)}>
      <NoticeBanner notice={notice} className="mb-0" />
      <DetailHeader detail={detail} />
      {noteId ? (
        <p id={SOON_NOTE_ID} className="-mt-2 text-[13px] text-muted-foreground">
          {t.actions.soon}
        </p>
      ) : null}
      <div className="flex flex-wrap items-start gap-5">
        <div className="flex min-w-0 flex-[999_1_520px] flex-col gap-5">
          {detail.correctionNotice ? (
            <CorrectionNotice notice={detail.correctionNotice} status={detail.status} />
          ) : null}
          <DetailItems
            detail={detail}
            actions={detail.actions}
            readOnly={ctx.readOnly}
            noteId={noteId}
            equipment={equipment}
          />
          <DocumentCard detail={detail} readOnly={ctx.readOnly} noteId={noteId} />
        </div>
        <TimelinePanel
          detail={detail}
          timeZone={ctx.timezone}
          readOnly={ctx.readOnly}
          mobileBar={mobileBar}
        />
      </div>
      {mobileBar ? <MobileDecisionBar detail={detail} /> : null}
    </div>
  );
}
