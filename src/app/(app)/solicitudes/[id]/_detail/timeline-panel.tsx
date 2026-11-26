// Panel «Línea de tiempo» con los botones de acción (DetalleSOF.dc.html). Cada paso lleva su estado
// en texto para lectores de pantalla; el color y el ícono son solo apoyo.
import { BanIcon, CheckIcon, EllipsisIcon, XIcon } from 'lucide-react';
import type { ReactNode } from 'react';

import type { RequestAction, RequestDetail, TimelineItemView } from '@/modules/requests';
import { DateText } from '@/ui/base/date-text';
import { cn } from '@/ui/lib/utils';
import { messages } from '@/ui/messages/es-PE';

import { ActionButton } from './action-button';
import { panelActions, SOON_NOTE_ID, soonNoteId } from './detail-actions';

const t = messages.requests.detail;

function Marker({ item }: { item: TimelineItemView }) {
  if (item.state === 'upcoming') {
    return (
      <span
        aria-hidden="true"
        className="absolute top-0 -left-[13px] size-6 rounded-full border-2 border-border-strong bg-surface"
      />
    );
  }
  const tone = {
    done: 'bg-status-approved-bg text-status-approved-fg',
    pending: 'bg-status-pending-bg text-status-pending-fg',
    stopped:
      item.kind === 'rejected'
        ? 'bg-status-rejected-bg text-status-rejected-fg'
        : 'bg-status-neutral-bg text-status-neutral-fg',
  }[item.state];
  const Icon =
    item.state === 'done'
      ? CheckIcon
      : item.state === 'pending'
        ? EllipsisIcon
        : item.kind === 'rejected'
          ? XIcon
          : BanIcon;
  return (
    <span
      aria-hidden="true"
      className={cn(
        'absolute top-0 -left-[15px] flex size-7 items-center justify-center rounded-full',
        tone,
      )}
    >
      <Icon className="size-4" strokeWidth={3} />
    </span>
  );
}

function stepHint(item: TimelineItemView, timeZone: string): ReactNode {
  if (item.state === 'pending') return t.timeline.hints.approvalPending;
  if (item.state === 'upcoming') {
    return item.kind === 'delivery'
      ? t.timeline.hints.deliveryUpcoming
      : t.timeline.hints.approvalUpcoming;
  }
  const date = item.at ? <DateText value={item.at} timeZone={timeZone} /> : null;
  if (item.actorName && date) {
    return (
      <>
        {item.actorName} · {date}
      </>
    );
  }
  return item.actorName ?? date;
}

export function TimelinePanel({
  detail,
  timeZone,
  readOnly,
}: {
  detail: RequestDetail;
  timeZone: string;
  readOnly: boolean;
}) {
  const panel = panelActions(detail.actions);
  const noteId = soonNoteId(detail.actions);
  const soon = noteId !== undefined;
  const decisions: RequestAction[] = panel.filter((a) => a === 'request_changes' || a === 'reject');
  const others = panel.filter((a) => a !== 'approve' && !decisions.includes(a));

  return (
    <aside
      aria-labelledby="detail-timeline-title"
      className="flex min-w-0 flex-[1_1_300px] flex-col gap-4 rounded-xl border border-border bg-surface p-5"
    >
      <h2 id="detail-timeline-title" className="text-base font-semibold">
        {t.timeline.title}
      </h2>
      <ol className="m-0 flex list-none flex-col p-0">
        {detail.timeline.map((item, index) => {
          const last = index === detail.timeline.length - 1;
          return (
            <li
              key={`${item.kind}-${index}`}
              className={cn(
                'relative ml-3.5 border-l-2 pl-[18px]',
                last ? 'border-transparent' : 'pb-[18px]',
                !last && item.state === 'done' ? 'border-success/40' : !last && 'border-border',
              )}
            >
              <Marker item={item} />
              <p className="text-sm font-semibold">
                <span className="sr-only">{t.timeline.states[item.state]}: </span>
                {t.timeline.steps[item.kind]}
              </p>
              <p className="mt-0.5 text-[13px] text-muted-foreground">{stepHint(item, timeZone)}</p>
            </li>
          );
        })}
      </ol>

      {panel.length > 0 ? (
        <div role="group" aria-label={t.actions.label} className="flex flex-col gap-2">
          {panel.includes('approve') ? (
            <ActionButton
              action="approve"
              requestId={detail.id}
              readOnly={readOnly}
              large
              noteId={noteId}
            />
          ) : null}
          {decisions.length > 0 ? (
            <div className="grid grid-cols-2 gap-2">
              {decisions.map((action) => (
                <ActionButton
                  key={action}
                  action={action}
                  requestId={detail.id}
                  readOnly={readOnly}
                  noteId={noteId}
                />
              ))}
            </div>
          ) : null}
          {others.map((action, index) => (
            <ActionButton
              key={action}
              action={action}
              requestId={detail.id}
              readOnly={readOnly}
              large={index === 0 && !panel.includes('approve')}
              noteId={noteId}
            />
          ))}
          {soon ? (
            <p id={SOON_NOTE_ID} className="text-[13px] text-muted-foreground">
              {t.actions.soon}
            </p>
          ) : null}
        </div>
      ) : null}
    </aside>
  );
}
