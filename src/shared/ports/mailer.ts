// Puerto de correo. Agnóstico de plantillas: el módulo pasa un id de plantilla y datos; las
// plantillas (React Email) y el adaptador Resend llegan en E5.
import type { Locale } from '../context';

export interface MailMessage {
  readonly to: readonly string[];
  readonly template: string;
  readonly data: Readonly<Record<string, unknown>>;
  readonly tenantId: string | null;
  readonly locale: Locale;
  readonly idempotencyKey?: string;
}

export interface Mailer {
  send(message: MailMessage): Promise<{ messageId: string }>;
}
