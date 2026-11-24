// Núcleo común de action() y route(): ctx → permiso → validación → transacción → salida.
// Sin Next ni base de datos directa: todo llega por `deps`, así se prueba con fakes.
import type { DbTransaction } from '@/db';
import { hasPermission } from '@/shared/authorization';
import type { Ctx, PlatformCtx } from '@/shared/context';
import type { Contract } from '@/shared/contract';
import {
  ForbiddenError,
  UnauthenticatedError,
  ValidationError,
  type ErrorCode,
} from '@/shared/errors';
import type { Permission } from '@/shared/permissions';
import type { AfterCommit, AfterCommitTask } from '@/shared/ports/after-commit';
import { UNKNOWN_CLIENT, type ClientInfo } from '@/shared/ports/client-info';
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
  /** IP y navegador para audit_events (fuera de Ctx; la IP es solo informativa). */
  readonly client: ClientInfo;
  /** Tareas después del commit (p. ej. enviar un correo); su resultado se suma a la salida. */
  readonly afterCommit: AfterCommit;
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
  /** 'write' (por defecto) se bloquea si el tenant está en solo lectura (ADR-006). */
  readonly access?: 'read' | 'write';
  readonly client?: ClientInfo;
}

/**
 * Corre las tareas de afterCommit en orden, ya confirmada la transacción. Una tarea que falla se
 * registra y no cambia el resultado (lo guardado no se revierte); lo que devuelven se combina con
 * la salida y se vuelve a validar con el contrato.
 */
async function runAfterCommit<T>(
  tasks: readonly AfterCommitTask[],
  data: T,
  outputSchema: z.ZodType,
  logger: Logger,
): Promise<T> {
  if (tasks.length === 0) return data;
  let merged: Record<string, unknown> = { ...(data as Record<string, unknown>) };
  for (const task of tasks) {
    try {
      const patch = await task();
      if (patch) merged = { ...merged, ...patch };
    } catch (error) {
      logger.error({ err: error }, 'after-commit task failed');
    }
  }
  const parsed = outputSchema.safeParse(merged);
  if (parsed.success) return parsed.data as T;
  logger.error({ issues: parsed.error.issues.length }, 'after-commit output rejected by contract');
  return data;
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

    if (ctx.readOnly && (request.access ?? 'write') === 'write') {
      throw new ForbiddenError({ reason: 'tenant_read_only', message: 'Tenant is read-only' });
    }

    const parsed = contract.inputSchema.safeParse(request.rawInput);
    if (!parsed.success) {
      // Nunca se registra el input (puede tener datos personales): solo las rutas.
      throw new ValidationError({
        fieldErrors: issuesToFieldErrors(parsed.error.issues),
        message: `Invalid input: ${parsed.error.issues.map((i) => i.path.join('.')).join(', ')}`,
      });
    }

    const tasks: AfterCommitTask[] = [];
    const shared: SharedDeps = {
      clock: deps.clock,
      ids: deps.ids,
      logger,
      client: request.client ?? UNKNOWN_CLIENT,
      afterCommit: (task) => tasks.push(task),
    };
    const committed = await deps.runInTenant(ctx, async (tx) => {
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
    const data = await runAfterCommit(tasks, committed, contract.outputSchema, logger);
    return { ok: true, data };
  } catch (error) {
    const actionError = toActionError(error, requestId, logger);
    outcome = actionError.code;
    return { ok: false, error: actionError };
  } finally {
    logger.info({ outcome, durationMs: Date.now() - started }, 'action finished');
  }
}

export interface PublicPipelineDeps {
  readonly logger: Logger;
}

export type PublicHandler<C extends Contract> = (args: {
  readonly input: z.output<C['inputSchema']>;
  readonly requestId: string;
  readonly logger: Logger;
  readonly client: ClientInfo;
}) => Promise<z.input<C['outputSchema']>>;

/**
 * Acciones sin ctx ni transacción (login, recuperar, restablecer, cerrar sesión, elegir empresa):
 * mismo requestId, validación, mensajes es-PE y logs que runPipeline (ADR-006).
 */
export async function runPublicPipeline<C extends Contract>(
  deps: PublicPipelineDeps,
  contract: C,
  handler: PublicHandler<C>,
  request: Omit<PipelineRequest, 'access'>,
): Promise<ActionResult<z.output<C['outputSchema']>>> {
  const { requestId } = request;
  const started = Date.now();
  const logger = deps.logger.child({ requestId, action: request.name });
  let outcome: ErrorCode | 'OK' = 'OK';
  try {
    const parsed = contract.inputSchema.safeParse(request.rawInput);
    if (!parsed.success) {
      throw new ValidationError({
        fieldErrors: issuesToFieldErrors(parsed.error.issues),
        message: `Invalid input: ${parsed.error.issues.map((i) => i.path.join('.')).join(', ')}`,
      });
    }
    const output = await handler({
      input: parsed.data as z.output<C['inputSchema']>,
      requestId,
      logger,
      client: request.client ?? UNKNOWN_CLIENT,
    });
    const data = contract.outputSchema.parse(output) as z.output<C['outputSchema']>;
    return { ok: true, data };
  } catch (error) {
    const actionError = toActionError(error, requestId, logger);
    outcome = actionError.code;
    return { ok: false, error: actionError };
  } finally {
    logger.info({ outcome, durationMs: Date.now() - started }, 'action finished');
  }
}

export interface PlatformPipelineDeps {
  /** Sesión de un SuperAdmin activo: 'anonymous' sin sesión, 'forbidden' si no es SuperAdmin. */
  readonly resolvePlatformCtx: (request: {
    readonly requestId: string;
  }) => Promise<PlatformCtx | 'anonymous' | 'forbidden'>;
  readonly clock: Clock;
  readonly ids: IdGenerator;
  readonly logger: Logger;
}

export type PlatformHandler<C extends Contract> = (args: {
  readonly ctx: PlatformCtx;
  readonly input: z.output<C['inputSchema']>;
  readonly shared: SharedDeps;
}) => Promise<z.input<C['outputSchema']>>;

/**
 * Acciones de la consola de plataforma (ADR-007): SuperAdmin → Zod → caso de uso → afterCommit.
 * No abre transacción: el caso de uso abre la suya con la conexión dueño (acotada y auditada).
 */
export async function runPlatformPipeline<C extends Contract>(
  deps: PlatformPipelineDeps,
  contract: C,
  handler: PlatformHandler<C>,
  request: Omit<PipelineRequest, 'access'>,
): Promise<ActionResult<z.output<C['outputSchema']>>> {
  const { requestId } = request;
  const started = Date.now();
  let logger = deps.logger.child({ requestId, action: request.name });
  let outcome: ErrorCode | 'OK' = 'OK';
  try {
    const resolved = await deps.resolvePlatformCtx({ requestId });
    if (resolved === 'anonymous') throw new UnauthenticatedError();
    if (resolved === 'forbidden') {
      throw new ForbiddenError({ message: 'Not a platform admin' });
    }
    const ctx = resolved;
    logger = logger.child({ userId: ctx.userId, platform: true });

    const parsed = contract.inputSchema.safeParse(request.rawInput);
    if (!parsed.success) {
      throw new ValidationError({
        fieldErrors: issuesToFieldErrors(parsed.error.issues),
        message: `Invalid input: ${parsed.error.issues.map((i) => i.path.join('.')).join(', ')}`,
      });
    }

    const tasks: AfterCommitTask[] = [];
    const shared: SharedDeps = {
      clock: deps.clock,
      ids: deps.ids,
      logger,
      client: request.client ?? UNKNOWN_CLIENT,
      afterCommit: (task) => tasks.push(task),
    };
    const output = await handler({
      ctx,
      input: parsed.data as z.output<C['inputSchema']>,
      shared,
    });
    const committed = contract.outputSchema.parse(output) as z.output<C['outputSchema']>;
    const data = await runAfterCommit(tasks, committed, contract.outputSchema, logger);
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
