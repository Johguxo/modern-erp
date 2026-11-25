// Secuencia de numeración del SOF del cliente activo (settings.manage).
import { requirePermission } from '@/shared/authorization';
import type { Ctx } from '@/shared/context';
import { NotFoundError } from '@/shared/errors';

import type { SequenceDeps } from './ports';
import { SOF } from './sequence-change';
import { toSequenceView, type SequenceView } from './views';

export async function getDocumentSequence(
  ctx: Ctx,
  deps: Pick<SequenceDeps, 'sequences'>,
): Promise<SequenceView> {
  requirePermission(ctx, 'settings.manage');
  const sequence = await deps.sequences.find(ctx.tenantId, SOF);
  if (!sequence) throw new NotFoundError({ message: 'Document sequence not found' });
  return toSequenceView(sequence);
}
