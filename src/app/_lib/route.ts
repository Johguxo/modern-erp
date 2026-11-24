// Helper de route handlers de api/v1, con el mismo núcleo que action(). Uso:
//   export const POST = route(createThingContract, 'catalog.manage', handler, { successStatus: 201 });
// Respuesta: { data } o { error }, con cabeceras x-request-id y Cache-Control: no-store.

import { getEnv } from '@/env';
import { HTTP_STATUS_BY_CODE } from '@/shared/errors';
import type { Permission } from '@/shared/permissions';
import { REQUEST_ID_HEADER, resolveRequestId } from '@/shared/request-id';
import type { ApiErrorBody, ApiSuccessBody } from '@/shared/result';
import type { Contract } from '@/shared/contract';

import { productionPipelineDeps } from './action';
import { errorOf, runPipeline, type Handler, type PipelineDeps } from './pipeline';

const SAFE_METHODS = new Set(['GET', 'HEAD']);

function json(body: ApiSuccessBody<unknown> | ApiErrorBody, status: number, requestId: string) {
  return Response.json(body, {
    status,
    headers: { [REQUEST_ID_HEADER]: requestId, 'Cache-Control': 'no-store' },
  });
}

async function readInput(request: Request): Promise<{ ok: true; value: unknown } | { ok: false }> {
  if (SAFE_METHODS.has(request.method)) {
    return { ok: true, value: Object.fromEntries(new URL(request.url).searchParams) };
  }
  let text: string;
  try {
    text = await request.text();
  } catch {
    return { ok: false };
  }
  if (text.trim() === '') return { ok: true, value: {} };
  try {
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch {
    return { ok: false };
  }
}

export function createRoute(deps: () => PipelineDeps, appUrl: () => string) {
  return function route<C extends Contract>(
    contract: C,
    permission: Permission | null,
    handler: Handler<C>,
    options: { name?: string; successStatus?: 200 | 201 } = {},
  ): (request: Request) => Promise<Response> {
    return async (request) => {
      const resolved = deps();
      const requestId = resolveRequestId(request.headers.get(REQUEST_ID_HEADER), resolved.ids);

      // La sesión va por cookie: en métodos que cambian datos se exige el mismo origen (CSRF).
      if (!SAFE_METHODS.has(request.method)) {
        const origin = request.headers.get('origin');
        if (origin !== new URL(appUrl()).origin) {
          return json({ error: errorOf('FORBIDDEN', requestId) }, 403, requestId);
        }
      }

      const input = await readInput(request);
      if (!input.ok) {
        return json({ error: errorOf('BAD_REQUEST', requestId) }, 400, requestId);
      }

      const result = await runPipeline(resolved, contract, permission, handler, {
        name: options.name ?? `${request.method} ${new URL(request.url).pathname}`,
        headers: request.headers,
        requestId,
        rawInput: input.value,
        // GET/HEAD son lectura; el resto, escritura (bloqueada en solo lectura).
        access: SAFE_METHODS.has(request.method) ? 'read' : 'write',
      });
      if (result.ok) return json({ data: result.data }, options.successStatus ?? 200, requestId);
      return json({ error: result.error }, HTTP_STATUS_BY_CODE[result.error.code], requestId);
    };
  };
}

export const route = createRoute(productionPipelineDeps, () => getEnv().APP_URL);
