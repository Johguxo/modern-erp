// Server actions de la consola de plataforma (ADR-007). Uso, en un archivo "use server":
//   export const createTenantAction = platformAction(platformCreateTenantContract,
//     ({ ctx, input, shared }) => createTenant(ctx, input, createPlatformDeps(platformExtras(shared))),
//     { name: 'platform.createTenant' });
// Solo SuperAdmins: sin sesión → UNAUTHENTICATED; el resto → FORBIDDEN genérico.
import { headers } from 'next/headers';
import type { z } from 'zod';

import { cryptoIdGenerator } from '@/shared/adapters/crypto-id-generator';
import { getLogger } from '@/shared/adapters/pino-logger';
import { systemClock } from '@/shared/adapters/system-clock';
import type { Contract } from '@/shared/contract';
import { REQUEST_ID_HEADER, resolveRequestId } from '@/shared/request-id';
import type { ActionResult } from '@/shared/result';

import { clientInfoFromHeaders } from './client-info';
import { runPlatformPipeline, type PlatformHandler, type PlatformPipelineDeps } from './pipeline';
import { resolvePlatformSession } from './session';

function productionPlatformDeps(): PlatformPipelineDeps {
  return {
    resolvePlatformCtx: async ({ requestId }) => {
      const resolved = await resolvePlatformSession(requestId);
      return typeof resolved === 'string' ? resolved : resolved.ctx;
    },
    clock: systemClock,
    ids: cryptoIdGenerator,
    logger: getLogger(),
  };
}

export function platformAction<C extends Contract>(
  contract: C,
  handler: PlatformHandler<C>,
  options: { name?: string } = {},
): (input: z.input<C['inputSchema']>) => Promise<ActionResult<z.output<C['outputSchema']>>> {
  return async (input) => {
    const requestHeaders = await headers();
    const deps = productionPlatformDeps();
    const requestId = resolveRequestId(requestHeaders.get(REQUEST_ID_HEADER), deps.ids);
    return runPlatformPipeline(deps, contract, handler, {
      name: options.name || handler.name || 'platformAction',
      headers: requestHeaders,
      requestId,
      rawInput: input,
      client: clientInfoFromHeaders(requestHeaders),
    });
  };
}
