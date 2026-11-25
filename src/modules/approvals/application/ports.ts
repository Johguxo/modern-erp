// Puertos de approvals. E4-H1 cambia el adaptador de PolicySource (de la política fija a la base).
import type { Ctx } from '@/shared/context';

import type { ApprovalPolicy, DocType } from '../domain/route-preview';

export interface PolicySource {
  /** La política que aplicaría hoy a un documento de ese tipo, filtrada por `ctx.tenantId`. */
  activeFor(ctx: Ctx, docType: DocType): Promise<ApprovalPolicy>;
}

export interface PreviewRouteDeps {
  readonly policies: PolicySource;
}
