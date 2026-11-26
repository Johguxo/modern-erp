// Tarjetas de resumen (prototipo Main.dc.html): Esperan mi aprobación · En aprobación · Aprobadas
// esta semana. Los conteos salen de lo visible para el usuario, sin pestaña ni búsqueda.
import { messages } from '@/ui/messages/es-PE';

const t = messages.inbox;

export interface InboxSummaryCounts {
  readonly awaitingMe: number;
  readonly inApproval: number;
  readonly approvedThisWeek: number;
}

const CARDS = [
  { key: 'awaitingMe', tone: 'text-status-pending-fg' },
  { key: 'inApproval', tone: 'text-primary' },
  { key: 'approvedThisWeek', tone: 'text-success' },
] as const satisfies readonly { key: keyof InboxSummaryCounts; tone: string }[];

export function InboxSummary({ summary }: { summary: InboxSummaryCounts }) {
  return (
    <section aria-label={t.summaryLabel} className="grid grid-cols-3 gap-3 sm:gap-4">
      {CARDS.map(({ key, tone }) => (
        <div key={key} className="min-w-0 rounded-xl border border-border bg-surface p-3 sm:p-5">
          <p className="text-xs text-muted-foreground sm:text-[13px]">{t.cards[key]}</p>
          <p className={`mt-2 font-heading text-3xl font-semibold sm:text-[34px] ${tone}`}>
            {summary[key]}
          </p>
        </div>
      ))}
    </section>
  );
}
