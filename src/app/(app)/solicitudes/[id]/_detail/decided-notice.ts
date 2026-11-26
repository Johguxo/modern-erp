// Aviso tras decidir (?decision=<resultado>), separado de la página para probarlo sin DOM.
import type { RequestStatus } from '@/modules/requests';
import { messages } from '@/ui/messages/es-PE';

const t = messages.requests.detail;

type Outcome = keyof typeof t.decidedNotice;

/** Estado en que debe estar la solicitud para que el resultado de la URL sea creíble. */
const STATUS_OF_OUTCOME: Record<Outcome, RequestStatus> = {
  approved: 'approved',
  rejected: 'rejected',
  changes_requested: 'changes_requested',
  advanced: 'in_approval',
  partial: 'in_approval',
};

/** Solo valores conocidos, para quien no es el dueño y si coinciden con el estado actual. */
export function decidedNotice(
  param: string | string[] | undefined,
  status: RequestStatus,
  notOwner: boolean,
  number: string | null,
) {
  if (!notOwner || typeof param !== 'string') return undefined;
  const outcome = (Object.keys(STATUS_OF_OUTCOME) as Outcome[]).find((key) => key === param);
  if (outcome === undefined || STATUS_OF_OUTCOME[outcome] !== status) return undefined;
  return { tone: 'success', text: t.decidedNotice[outcome](number) } as const;
}
