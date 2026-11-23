// Pastilla de estado: siempre con texto, nunca solo color (design-tokens.md).
import { cn } from '@/ui/lib/utils';
import { messages } from '@/ui/messages/es-PE';

export type BadgeStatus = keyof typeof messages.status;

export type StatusTone =
  'pending' | 'in-approval' | 'approved' | 'external' | 'rejected' | 'neutral';

const TONE_BY_STATUS: Record<BadgeStatus, StatusTone> = {
  draft: 'neutral',
  in_approval: 'in-approval',
  changes_requested: 'pending',
  approved: 'approved',
  delivered: 'approved',
  rejected: 'rejected',
  cancelled: 'neutral',
  awaiting_my_approval: 'pending',
  awaiting_external: 'external',
};

const TONE_CLASSES: Record<StatusTone, string> = {
  pending: 'bg-status-pending-bg text-status-pending-fg',
  'in-approval': 'bg-status-in-approval-bg text-status-in-approval-fg',
  approved: 'bg-status-approved-bg text-status-approved-fg',
  external: 'bg-status-external-bg text-status-external-fg',
  rejected: 'bg-status-rejected-bg text-status-rejected-fg',
  neutral: 'bg-status-neutral-bg text-status-neutral-fg',
};

export function statusTone(status: BadgeStatus): StatusTone {
  return TONE_BY_STATUS[status];
}

export function StatusBadge({ status, className }: { status: BadgeStatus; className?: string }) {
  const tone = statusTone(status);
  return (
    <span
      data-tone={tone}
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap',
        TONE_CLASSES[tone],
        className,
      )}
    >
      {messages.status[status]}
    </span>
  );
}
