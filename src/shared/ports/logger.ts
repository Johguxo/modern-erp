// Puerto de logger estructurado. Adaptador: src/shared/adapters/pino-logger.ts.
export type LogFields = Readonly<Record<string, unknown>>;

export interface Logger {
  debug(fields: LogFields, message: string): void;
  info(fields: LogFields, message: string): void;
  warn(fields: LogFields, message: string): void;
  error(fields: LogFields, message: string): void;
  /** Logger hijo que agrega campos fijos (por ejemplo, requestId) a cada línea. */
  child(bindings: LogFields): Logger;
}
