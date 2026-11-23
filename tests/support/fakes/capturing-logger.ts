// Logger que guarda cada entrada en memoria. Los hijos comparten la misma lista.
import type { LogFields, Logger } from '@/shared/ports/logger';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  readonly level: LogLevel;
  readonly fields: LogFields;
  readonly message: string;
  /** Campos acumulados de child() (por ejemplo, requestId). */
  readonly bindings: LogFields;
}

export class CapturingLogger implements Logger {
  constructor(
    readonly entries: LogEntry[] = [],
    private readonly bindings: LogFields = {},
  ) {}

  debug(fields: LogFields, message: string): void {
    this.push('debug', fields, message);
  }

  info(fields: LogFields, message: string): void {
    this.push('info', fields, message);
  }

  warn(fields: LogFields, message: string): void {
    this.push('warn', fields, message);
  }

  error(fields: LogFields, message: string): void {
    this.push('error', fields, message);
  }

  child(bindings: LogFields): Logger {
    return new CapturingLogger(this.entries, { ...this.bindings, ...bindings });
  }

  find(message: string): LogEntry | undefined {
    return this.entries.find((entry) => entry.message === message);
  }

  private push(level: LogLevel, fields: LogFields, message: string): void {
    this.entries.push({ level, fields, message, bindings: this.bindings });
  }
}
