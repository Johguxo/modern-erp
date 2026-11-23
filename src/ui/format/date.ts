// Fechas en es-PE con la zona horaria del tenant (UTC en la base; ADR-003). Sin dependencias:
// Intl.DateTimeFormat resuelve la zona.
export type DateVariant = 'date' | 'datetime';

function toDate(value: string | Date): Date {
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) {
    throw new Error('Expected a valid date');
  }
  return date;
}

export function formatDateTime(
  value: string | Date,
  timeZone: string,
  variant: DateVariant = 'datetime',
): string {
  return new Intl.DateTimeFormat('es-PE', {
    timeZone,
    dateStyle: 'medium',
    ...(variant === 'datetime' ? { timeStyle: 'short' } : {}),
  }).format(toDate(value));
}

export function toIsoString(value: string | Date): string {
  return toDate(value).toISOString();
}
