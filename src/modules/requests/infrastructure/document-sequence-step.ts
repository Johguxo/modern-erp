// Paso de alta del tenant (E3-H1): crea la secuencia SOF dentro de la misma transacción de la consola
// (getDbAdmin, sin RLS). Solo inserta en el tenant recibido y es idempotente (onConflictDoNothing).
import { documentSequences } from '@/db/schema';
import type { TenantSetupStepFactory } from '@/modules/identity';

import { DEFAULT_SOF_SEQUENCE } from '../domain/numbering';

export interface DocumentSequenceConfig {
  /** Incluye el separador ("SOF-"). */
  readonly prefix: string;
  /** Correlativo inicial (G2): el primer SOF enviado sale con este número. */
  readonly nextNumber: number;
}

const DEFAULT_CONFIG: DocumentSequenceConfig = {
  prefix: DEFAULT_SOF_SEQUENCE.prefix,
  nextNumber: DEFAULT_SOF_SEQUENCE.nextNumber,
};

export function documentSequenceSetupStep(
  config: DocumentSequenceConfig = DEFAULT_CONFIG,
): TenantSetupStepFactory {
  return (db) => ({
    async run({ tenantId }) {
      await db
        .insert(documentSequences)
        .values({
          tenantId,
          docType: DEFAULT_SOF_SEQUENCE.docType,
          prefix: config.prefix,
          nextNumber: config.nextNumber,
          padding: DEFAULT_SOF_SEQUENCE.padding,
        })
        .onConflictDoNothing();
    },
  });
}
