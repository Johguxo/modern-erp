// Adaptador pino del puerto Logger: JSON a stdout, sin transports (los worker threads fallan
// con el bundling de Next). Redacta secretos y nunca registra parámetros de consultas SQL.
import pino, { type DestinationStream, type LevelWithSilent } from 'pino';

import { getEnv } from '../../env';
import type { LogFields, Logger } from '../ports/logger';

export const REDACT_PATHS = [
  'password',
  '*.password',
  'newPassword',
  '*.newPassword',
  'token',
  '*.token',
  '*.tokenHash',
  'secret',
  '*.secret',
  'authorization',
  '*.authorization',
  'cookie',
  '*.cookie',
  'headers.authorization',
  'headers.cookie',
];

interface SerializedError {
  type: string;
  message?: string;
  code?: string;
  constraint?: string;
  query?: string;
  stack?: string;
  cause?: SerializedError;
}

function field(value: object, key: string): string | undefined {
  const raw = (value as Record<string, unknown>)[key];
  return typeof raw === 'string' ? raw : undefined;
}

/**
 * Serializa errores sin datos sensibles. Los errores de Drizzle (DrizzleQueryError) incluyen la
 * consulta y sus parámetros en `message`: se registra la consulta, nunca los parámetros.
 */
export function serializeError(error: unknown, depth = 0): SerializedError | undefined {
  if (typeof error !== 'object' || error === null) {
    if (error === undefined) return undefined;
    // Primitivo (alguien lanzó un string o un número): se registra tal cual.
    return { type: typeof error, message: JSON.stringify(error) ?? typeof error };
  }
  const type = error instanceof Error ? error.name : 'Object';
  const query = field(error, 'query');
  const result: SerializedError = {
    type,
    message: query === undefined ? field(error, 'message') : undefined,
    code: field(error, 'code'),
    constraint: field(error, 'constraint_name') ?? field(error, 'constraint'),
    query,
    stack: query === undefined ? field(error, 'stack') : undefined,
  };
  const cause = (error as { cause?: unknown }).cause;
  if (cause !== undefined && depth < 5) result.cause = serializeError(cause, depth + 1);
  return result;
}

function defaultLevel(nodeEnv: string): LevelWithSilent {
  if (nodeEnv === 'test') return 'silent';
  return nodeEnv === 'production' ? 'info' : 'debug';
}

function wrap(instance: pino.Logger): Logger {
  return {
    debug: (fields, message) => instance.debug(fields, message),
    info: (fields, message) => instance.info(fields, message),
    warn: (fields, message) => instance.warn(fields, message),
    error: (fields, message) => instance.error(fields, message),
    child: (bindings: LogFields) => wrap(instance.child(bindings)),
  };
}

export function createLogger(options: {
  level: LevelWithSilent;
  destination?: DestinationStream;
  base?: LogFields;
}): Logger {
  const instance = pino(
    {
      level: options.level,
      base: { service: 'linkus', ...options.base },
      timestamp: pino.stdTimeFunctions.isoTime,
      redact: { paths: REDACT_PATHS, censor: '[redacted]' },
      serializers: { err: serializeError, error: serializeError },
    },
    options.destination,
  );
  return wrap(instance);
}

const globalForLogger = globalThis as typeof globalThis & { __linkusLogger?: Logger };

/** Logger del proceso, perezoso (lee LOG_LEVEL del entorno validado). */
export function getLogger(): Logger {
  if (!globalForLogger.__linkusLogger) {
    const env = getEnv();
    globalForLogger.__linkusLogger = createLogger({
      level: env.LOG_LEVEL ?? defaultLevel(env.NODE_ENV),
    });
  }
  return globalForLogger.__linkusLogger;
}
