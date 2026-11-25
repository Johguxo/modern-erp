// Secuencia SOF de un cliente, desde la consola (ADR-007). La conexión es la del dueño (sin RLS):
// se repite la revisión de SuperAdmin dentro de la transacción y se filtra por el tenantId dado.
import { assertPlatformAdmin } from '@/modules/identity';
import type { PlatformCtx } from '@/shared/context';
import { NotFoundError } from '@/shared/errors';

import type { PlatformSequenceDeps } from './ports';
import { SOF } from './sequence-change';
import { toSequenceView, type SequenceView } from './views';

export function platformGetDocumentSequence(
  ctx: PlatformCtx,
  input: { readonly tenantId: string },
  deps: PlatformSequenceDeps,
): Promise<SequenceView> {
  return deps.store.transaction(async (uow) => {
    await assertPlatformAdmin(uow.guard, ctx);
    const sequence = await uow.sequences.find(input.tenantId, SOF);
    if (!sequence) throw new NotFoundError({ message: 'Document sequence not found' });
    return toSequenceView(sequence);
  });
}
