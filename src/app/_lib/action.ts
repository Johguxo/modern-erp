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
import type { Ctx } from '@/shared/context';
import { UnauthenticatedError } from '@/shared/errors';
import type { Permission } from '@/shared/permissions';
import { REQUEST_ID_HEADER, resolveRequestId } from '@/shared/request-id';
import type { ActionResult } from '@/shared/result';

import { sessionCtxResolver } from './session';
import { clientInfoFromHeaders } from './client-info';
import { toActionError } from './error-response';
import { assertAllowed, runPipeline, type Handler, type PipelineDeps } from './pipeline';

export function createAction(deps: () => PipelineDeps) {
  return function action<C extends Contract>(
    contract: C,
    permission: Permission | null,
    handler: Handler<C>,
    /** access 'read' deja pasar en solo lectura; por defecto 'write' (ADR-006). */
    options: { name?: string; access?: 'read' | 'write' } = {},
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
        access: options.access ?? 'write',
        client: clientInfoFromHeaders(requestHeaders),
      });
    };
  };
}

/**
 * Trabajo previo a la transacción que no debe correr sin permiso (p. ej. leer y descomprimir un
 * archivo subido): resuelve la sesión, exige el permiso y que la empresa no esté en solo lectura, y
 * solo entonces corre `work` con el ctx. Devuelve ActionResult con los mismos errores que el
 * pipeline (sin sesión, sin permiso, solo lectura, errores de dominio de `work`).
 */
export function createPrepare(deps: () => PipelineDeps) {
  return async function prepare<T>(
    permission: Permission,
    name: string,
    work: (ctx: Ctx) => Promise<T>,
  ): Promise<ActionResult<T>> {
    const requestHeaders = await headers();
    const resolved = deps();
    const requestId = resolveRequestId(requestHeaders.get(REQUEST_ID_HEADER), resolved.ids);
    const logger = resolved.logger.child({ requestId, action: name });
    try {
      const ctx = await resolved.resolveCtx({ headers: requestHeaders, requestId });
      if (!ctx) throw new UnauthenticatedError();
      assertAllowed(ctx, permission, 'write');
      return { ok: true, data: await work(ctx) };
    } catch (error) {
      return { ok: false, error: toActionError(error, requestId, logger) };
    }
  };
}

/** Dependencias reales: el ctx sale de la sesión de Supabase + la cookie de empresa activa. */
export function productionPipelineDeps(): PipelineDeps {
  return {
    resolveCtx: sessionCtxResolver,
    runInTenant: withTenant,
    clock: systemClock,
    ids: cryptoIdGenerator,
    logger: getLogger(),
  };
}

export const action = createAction(productionPipelineDeps);
export const prepare = createPrepare(productionPipelineDeps);
