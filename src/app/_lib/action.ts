// Helper de server actions. Uso, en un archivo "use server":
//   export const submitRequestAction = action(submitRequestContract, 'requests.create',
//     ({ ctx, input, tx, shared }) => submitRequest(ctx, input, createRequestsDeps(tx, shared)));
// La acción devuelve ActionResult: nunca lanza al cliente (salvo redirect/notFound de Next).
// No llames a redirect() ni notFound() dentro del handler: corren dentro de la transacción y la
// revierten. Devuelve el resultado y redirige en el cliente (o en la página) según `ok`.
import { headers } from 'next/headers';
import type { z } from 'zod';

import { withTenant } from '@/db';
import { cryptoIdGenerator } from '@/shared/adapters/crypto-id-generator';
import { getLogger } from '@/shared/adapters/pino-logger';
import { systemClock } from '@/shared/adapters/system-clock';
import type { Contract } from '@/shared/contract';
import type { Permission } from '@/shared/permissions';
import { REQUEST_ID_HEADER, resolveRequestId } from '@/shared/request-id';
import type { ActionResult } from '@/shared/result';

import { unconfiguredCtxResolver } from './ctx-resolver';
import { runPipeline, type Handler, type PipelineDeps } from './pipeline';

export function createAction(deps: () => PipelineDeps) {
  return function action<C extends Contract>(
    contract: C,
    permission: Permission | null,
    handler: Handler<C>,
    options: { name?: string } = {},
  ): (input: z.input<C['inputSchema']>) => Promise<ActionResult<z.output<C['outputSchema']>>> {
    return async (input) => {
      const requestHeaders = await headers();
      const resolved = deps();
      const requestId = resolveRequestId(requestHeaders.get(REQUEST_ID_HEADER), resolved.ids);
      return runPipeline(resolved, contract, permission, handler, {
        name: options.name || handler.name || 'action',
        headers: requestHeaders,
        requestId,
        rawInput: input,
      });
    };
  };
}

/** Dependencias reales. E1-H2 reemplaza unconfiguredCtxResolver por el resolver con sesión. */
export function productionPipelineDeps(): PipelineDeps {
  return {
    resolveCtx: unconfiguredCtxResolver,
    runInTenant: withTenant,
    clock: systemClock,
    ids: cryptoIdGenerator,
    logger: getLogger(),
  };
}

export const action = createAction(productionPipelineDeps);
