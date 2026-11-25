// Cambiar el prefijo y el siguiente número del SOF (settings.manage). El siguiente número no puede
// quedar por debajo del último emitido. Lee con FOR UPDATE para no pisar un envío en curso.
import { recordAudit } from '@/modules/identity';
import { requirePermission } from '@/shared/authorization';
import type { Ctx } from '@/shared/context';
import { NotFoundError } from '@/shared/errors';

import type { SequenceDeps } from './ports';
import { SOF, planSequenceChange, type SequenceChangeInput } from './sequence-change';
import { toSequenceView, type SequenceView } from './views';

export async function updateDocumentSequence(
  ctx: Ctx,
  input: SequenceChangeInput,
  deps: SequenceDeps,
): Promise<{ sequence: SequenceView; changed: boolean }> {
  requirePermission(ctx, 'settings.manage');

  const current = await deps.sequences.lockForUpdate(ctx.tenantId, SOF);
  if (!current) throw new NotFoundError({ message: 'Document sequence not found' });

  const { patch, changes } = planSequenceChange(current, input);
  if (Object.keys(changes).length === 0) {
    return { sequence: toSequenceView(current), changed: false };
  }

  await deps.sequences.update(ctx.tenantId, SOF, patch);
  await recordAudit(
    ctx,
    {
      action: 'document_sequence.updated',
      entityType: 'document_sequence',
      entityId: null,
      data: { docType: SOF, changes },
    },
    deps,
  );
  return { sequence: toSequenceView({ ...current, ...patch }), changed: true };
}
