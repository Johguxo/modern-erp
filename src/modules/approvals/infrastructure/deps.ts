// Fábrica de dependencias de approvals (ADR-005): la entrega la arma con la transacción de
// withTenant. Hoy la política es fija y no usa la base; recibe `tx` para que E4-H1 solo cambie el
// adaptador, sin tocar a quien la llama.
import type { DbExecutor } from '@/db';

import type { PreviewRouteDeps } from '../application/ports';

import { standardPolicySource } from './standard-policy-source';

export function createPreviewRouteDeps(tx: DbExecutor): PreviewRouteDeps {
  void tx;
  return { policies: standardPolicySource };
}
