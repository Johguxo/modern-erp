// Migas, título, subtítulo y estado del detalle (DetalleSOF.dc.html).
import Link from 'next/link';

import type { RequestDetail } from '@/modules/requests';
import { StatusBadge } from '@/ui/base/status-badge';
import { formatMoney } from '@/ui/format/money';
import { messages } from '@/ui/messages/es-PE';

const t = messages.requests.detail;

export function DetailHeader({ detail }: { detail: RequestDetail }) {
  const number = detail.number ?? t.draftNumber;
  const subtitle = [
    detail.requesterName,
    detail.equipmentLabel,
    detail.costCenterLabel,
    t.totalOf(formatMoney(detail.totalAmount, detail.currency)),
  ].filter((part): part is string => part !== null);

  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <nav aria-label={t.breadcrumbLabel} className="mb-1 text-[13px] text-muted-foreground">
          <ol className="m-0 flex list-none flex-wrap items-center gap-x-1.5 p-0">
            <li>
              <Link href="/bandeja" className="text-primary hover:text-primary-hover">
                {t.breadcrumbInbox}
              </Link>
            </li>
            <li aria-hidden="true">/</li>
            <li aria-current="page">{number}</li>
          </ol>
        </nav>
        <h1 className="text-2xl font-semibold tracking-tight break-words text-foreground md:text-3xl">
          {t.title(detail.number, detail.reason)}
        </h1>
        <p className="mt-1.5 text-muted-foreground">{subtitle.join(' · ')}</p>
      </div>
      <StatusBadge status={detail.displayStatus} className="px-3.5 py-1.5 text-[13px]" />
    </header>
  );
}
