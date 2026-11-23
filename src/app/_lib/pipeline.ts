// Núcleo común de action() y route(): ctx → permiso → validación → transacción → salida.
// Sin Next ni base de datos directa: todo llega por `deps`, así se prueba con fakes.
import type { DbTransaction } from '@/db';
import { hasPermission } from '@/shared/authorization';
import type { Ctx } from '@/shared/context';
import type { Contract } from '@/shared/contract';
import {
  ForbiddenError,
  UnauthenticatedError,
  ValidationError,
  type ErrorCode,
} from '@/shared/errors';
import type { Permission } from '@/shared/permissions';
import type { Clock } from '@/shared/ports/clock';
import type { IdGenerator } from '@/shared/ports/id-generator';
import type { Logger } from '@/shared/ports/logger';
import type { ActionResult } from '@/shared/result';
import { issuesToFieldErrors } from '@/shared/validation';
import { configureZodMessages } from '@/ui/messages/zod-error-map';
import type { z } from 'zod';

import type { CtxResolver } from './ctx-resolver';
import { errorOf, toActionError } from './error-response';

configureZodMessages();

/** Dependencias compartidas que el handler pasa a las fábricas de los módulos. */
export interface SharedDeps {
  readonly clock: Clock;
  readonly ids: IdGenerator;
  readonly logger: Logger;
}

export interface HandlerArgs<I> {
  readonly ctx: Ctx;
  readonly input: I;
  readonly tx: DbTransaction;
  readonly shared: SharedDeps;
}

export type Handler<C extends Contract> = (
  args: HandlerArgs<z.output<C['inputSchema']>>,
) => Promise<z.input<C['outputSchema']>>;

export interface PipelineDeps {
  readonly resolveCtx: CtxResolver;
  /** withTenant en producción; un fake en pruebas unitarias. */
  readonly runInTenant: <T>(ctx: Ctx, fn: (tx: DbTransaction) => Promise<T>) => Promise<T>;
  readonly clock: Clock;
  readonly ids: IdGenerator;
  readonly logger: Logger;
}

export interface PipelineRequest {
  readonly name: string;
  readonly headers: Headers;
  readonly requestId: string;
  readonly rawInput: unknown;
}

/**
 * Ejecuta una acción. `permission: null` exige solo sesión. El caso de uso vuelve a revisar el
 * permiso con requirePermission (ADR-002); este es un corte temprano que no toca la base.
 */
export async function runPipeline<C extends Contract>(
  deps: PipelineDeps,
  contract: C,
  permission: Permission | null,
  handler: Handler<C>,
  request: PipelineRequest,
): Promise<ActionResult<z.output<C['outputSchema']>>> {
  const { requestId } = request;
  const started = Date.now();
  let logger = deps.logger.child({ requestId, action: request.name });
  let outcome: ErrorCode | 'OK' = 'OK';

  try {
    const ctx = await deps.resolveCtx({ headers: request.headers, requestId });
    if (!ctx) throw new UnauthenticatedError();
    logger = logger.child({ tenantId: ctx.tenantId, userId: ctx.userId });

    if (permission && !hasPermission(ctx, permission)) {
      throw new ForbiddenError({ message: `Missing permission: ${permission}` });
    }

    const parsed = contract.inputSchema.safeParse(request.rawInput);
    if (!parsed.success) {
      // Nunca se registra el input (puede tener datos personales): solo las rutas.
      throw new ValidationError({
        fieldErrors: issuesToFieldErrors(parsed.error.issues),
        message: `Invalid input: ${parsed.error.issues.map((i) => i.path.join('.')).join(', ')}`,
      });
    }

    const shared: SharedDeps = { clock: deps.clock, ids: deps.ids, logger };
    const data = await deps.runInTenant(ctx, async (tx) => {
      const output = await handler({
        ctx,
        input: parsed.data as z.output<C['inputSchema']>,
        tx,
        shared,
      });
      // Dentro de la transacción: si la salida no cumple el contrato (bug), se revierte y el
      // usuario puede reintentar sin duplicar datos. También descarta campos de más.
      return contract.outputSchema.parse(output) as z.output<C['outputSchema']>;
    });
    return { ok: true, data };
  } catch (error) {
    const actionError = toActionError(error, requestId, logger);
    outcome = actionError.code;
    return { ok: false, error: actionError };
  } finally {
    logger.info({ outcome, durationMs: Date.now() - started }, 'action finished');
  }
}

export { errorOf };
