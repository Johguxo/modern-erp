// Server actions sin ctx (login, recuperar, restablecer, cerrar sesión, elegir empresa; ADR-006).
// Validan con Zod y traducen errores igual que action(); la protección CSRF la da Next.
import { headers } from 'next/headers';
import type { z } from 'zod';

import { cryptoIdGenerator } from '@/shared/adapters/crypto-id-generator';
import { getLogger } from '@/shared/adapters/pino-logger';
import type { Contract } from '@/shared/contract';
import { REQUEST_ID_HEADER, resolveRequestId } from '@/shared/request-id';
import type { ActionResult } from '@/shared/result';

import { clientInfoFromHeaders } from './client-info';
import { runPublicPipeline, type PublicHandler } from './pipeline';

export function publicAction<C extends Contract>(
  contract: C,
  handler: PublicHandler<C>,
  options: { name?: string } = {},
): (input: z.input<C['inputSchema']>) => Promise<ActionResult<z.output<C['outputSchema']>>> {
  return async (input) => {
    const requestHeaders = await headers();
    const requestId = resolveRequestId(requestHeaders.get(REQUEST_ID_HEADER), cryptoIdGenerator);
    return runPublicPipeline({ logger: getLogger() }, contract, handler, {
      name: options.name || handler.name || 'publicAction',
      headers: requestHeaders,
      requestId,
      rawInput: input,
      client: clientInfoFromHeaders(requestHeaders),
    });
  };
}
