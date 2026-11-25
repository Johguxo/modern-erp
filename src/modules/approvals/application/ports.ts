// Puertos de approvals. E4-H1 cambia el adaptador de PolicySource (de la política fija a la base).
import type { Ctx } from '@/shared/context';

import type { ApprovalPolicy, DocType } from '../domain/route-preview';

export interface PolicySource {
  /** La política que aplicaría hoy a un documento de ese tipo, filtrada por `ctx.tenantId`; `total` permite aplicar `min_amount` (E4-H1). */
  activeFor(
    ctx: Ctx,
    query: { readonly docType: DocType; readonly total: string | null },
  ): Promise<ApprovalPolicy>;
}

export interface PreviewRouteDeps {
  readonly policies: PolicySource;
}
