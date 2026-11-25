// Store de la consola para la secuencia SOF (ADR-007): conexión dueño acotada. Cada transacción
// expone la revisión de SuperAdmin, la secuencia y la auditoría sobre la misma conexión; los casos
// de uso repiten la revisión antes de escribir y filtran por el tenantId explícito.
import type { DbExecutor } from '@/db';
import { createAuditLogFor, createPlatformGuardFor } from '@/modules/identity';

import type { PlatformSequenceStore } from '../application/ports';

import { createDrizzleDocumentSequenceRepository } from './drizzle-document-sequence-repository';

export function createDrizzleRequestsPlatformStore(db: DbExecutor): PlatformSequenceStore {
  return {
    transaction: (fn) =>
      db.transaction((tx) =>
        fn({
          guard: createPlatformGuardFor(tx),
          sequences: createDrizzleDocumentSequenceRepository(tx),
          audit: createAuditLogFor(tx),
        }),
      ),
  };
}
