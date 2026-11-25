// Contrato del alta de cliente en la consola (E1-H4 + E3-H1): el de identity más el prefijo y el
// correlativo inicial de la secuencia SOF. Se compone aquí, en la entrega, para que identity no
// dependa de requests (ADR-007).
import { platformCreateTenantContract } from '@/modules/identity/contracts';
import { sequenceSetupFieldsSchema } from '@/modules/requests/contracts';

export const inputSchema = platformCreateTenantContract.inputSchema.extend(
  sequenceSetupFieldsSchema.shape,
);

export const outputSchema = platformCreateTenantContract.outputSchema;
