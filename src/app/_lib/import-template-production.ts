// Cableado real de la descarga de plantillas (E2-H3): la sesión sale de las cookies del request.
import { headers } from 'next/headers';

import type { ImportKind } from '@/modules/catalog';
import { cryptoIdGenerator } from '@/shared/adapters/crypto-id-generator';
import { REQUEST_ID_HEADER, resolveRequestId } from '@/shared/request-id';

import { createTemplateRoute } from './import-template';
import { sessionCtxResolver } from './session';
import { getSpreadsheetWriter } from './spreadsheet';

export function productionTemplateRoute(kind: ImportKind) {
  return createTemplateRoute(kind, {
    resolveCtx: async () => {
      const requestHeaders = await headers();
      return sessionCtxResolver({
        headers: requestHeaders,
        requestId: resolveRequestId(requestHeaders.get(REQUEST_ID_HEADER), cryptoIdGenerator),
      });
    },
    writer: getSpreadsheetWriter(),
  });
}
