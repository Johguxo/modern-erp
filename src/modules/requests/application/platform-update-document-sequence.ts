// Cambiar el prefijo y el siguiente número del SOF de un cliente, desde la consola (ADR-007): se
// repite la revisión de SuperAdmin dentro de la transacción, se filtra por el tenantId dado y se
// audita con actor_type 'platform_admin'. Misma regla que en la empresa: no bajar del último emitido.
import { assertPlatformAdmin, recordPlatformAudit } from '@/modules/identity';
import type { PlatformCtx } from '@/shared/context';
import { NotFoundError } from '@/shared/errors';

import type { PlatformSequenceDeps } from './ports';
import { SOF, planSequenceChange, type SequenceChangeInput } from './sequence-change';
import { toSequenceView, type SequenceView } from './views';

export function platformUpdateDocumentSequence(
  ctx: PlatformCtx,
  input: SequenceChangeInput & { readonly tenantId: string },
  deps: PlatformSequenceDeps,
): Promise<{ sequence: SequenceView; changed: boolean }> {
  return deps.store.transaction(async (uow) => {
    await assertPlatformAdmin(uow.guard, ctx);

    const current = await uow.sequences.lockForUpdate(input.tenantId, SOF);
    if (!current) throw new NotFoundError({ message: 'Document sequence not found' });

    const { patch, changes } = planSequenceChange(current, input);
    if (Object.keys(changes).length === 0) {
      return { sequence: toSequenceView(current), changed: false };
    }

    await uow.sequences.update(input.tenantId, SOF, patch);
    await recordPlatformAudit(
      ctx,
      input.tenantId,
      {
        action: 'document_sequence.updated',
        entityType: 'document_sequence',
        entityId: null,
        data: { docType: SOF, changes },
      },
      uow,
      deps,
    );
    return { sequence: toSequenceView({ ...current, ...patch }), changed: true };
  });
}
