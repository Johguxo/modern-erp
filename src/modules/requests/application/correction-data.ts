// Lo que el detalle lee del `data` de los eventos de corrección (E4-H4). El motor lo guarda como
// jsonb; aquí se valida con Zod y, si no encaja (datos viejos o raros), se ignora sin romper la
// pantalla.
import { z } from 'zod';

import type { TimelineItem } from '../domain/request-timeline';

/** Los campos de una línea que el aviso sabe describir. */
const DECIMAL = /^-?\d+(\.\d+)?$/;
const decimal = z.string().regex(DECIMAL);

const factsSchema = z.object({
  productCode: z.string().nullish(),
  equipmentId: z.string().nullish(),
  quantity: decimal.nullish(),
  unitPrice: decimal.nullish(),
  notes: z.string().nullish(),
});
export type CorrectionFacts = z.infer<typeof factsSchema>;

const lineCorrectedSchema = z.object({
  lineNo: z.number().int(),
  changeType: z.enum(['update', 'add', 'remove']),
  changedFields: z.array(z.string()).default([]),
  before: factsSchema.nullish(),
  after: factsSchema.nullish(),
  reconfirmation: z.boolean().default(false),
});
export type LineCorrectedData = z.infer<typeof lineCorrectedSchema>;

const reconfirmationSchema = z.object({ lineNos: z.array(z.number().int()) });

export function parseLineCorrected(data: unknown): LineCorrectedData | null {
  const parsed = lineCorrectedSchema.safeParse(data);
  return parsed.success ? parsed.data : null;
}

/** El tipo de cambio de un ítem `line_corrected`; null en los demás o si el dato no encaja. */
export function changeTypeOf(
  item: Pick<TimelineItem, 'kind' | 'data'>,
): LineCorrectedData['changeType'] | null {
  return item.kind === 'line_corrected'
    ? (parseLineCorrected(item.data)?.changeType ?? null)
    : null;
}

/** Los números de línea que nombra un ítem de corrección; vacío en los demás ítems. */
export function lineNosOf(item: Pick<TimelineItem, 'kind' | 'data'>): number[] {
  if (item.kind === 'line_corrected') {
    const data = parseLineCorrected(item.data);
    return data ? [data.lineNo] : [];
  }
  if (item.kind === 'reconfirmation_requested') {
    const parsed = reconfirmationSchema.safeParse(item.data);
    return parsed.success ? parsed.data.lineNos : [];
  }
  return [];
}

/**
 * La última corrección de la ronda vigente: después del último envío o reenvío. Una corrección de
 * una ronda anterior (el SOF volvió por «Cambios solicitados») no se anuncia.
 */
export function lastCorrectionOfRound(items: readonly TimelineItem[]): TimelineItem | null {
  let start = 0;
  items.forEach((item, index) => {
    if (item.kind === 'submitted' || item.kind === 'resubmitted') start = index;
  });
  for (let index = items.length - 1; index >= start; index -= 1) {
    const item = items[index];
    if (item?.kind === 'line_corrected') return item;
  }
  return null;
}
