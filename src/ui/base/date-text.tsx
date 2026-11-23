import { formatDateTime, toIsoString, type DateVariant } from '@/ui/format/date';

export function DateText({
  value,
  timeZone,
  variant = 'datetime',
  className,
}: {
  value: string | Date;
  /** Zona horaria del tenant (ctx.timezone), por ejemplo America/Lima. */
  timeZone: string;
  variant?: DateVariant;
  className?: string;
}) {
  return (
    <time dateTime={toIsoString(value)} className={className}>
      {formatDateTime(value, timeZone, variant)}
    </time>
  );
}
