// Puerto de correo. Agnóstico de plantillas: el módulo pasa un id de plantilla y datos; el
// adaptador los convierte en asunto y texto con un `MailRenderer` (hoy texto plano desde es-PE,
// src/ui/emails/render-text.ts; React Email llega en E5).
import type { Locale } from '../context';

export const MAIL_TEMPLATES = ['identity.invitation'] as const;
export type MailTemplate = (typeof MAIL_TEMPLATES)[number];

export interface MailMessage {
  readonly to: readonly string[];
  readonly template: MailTemplate;
  readonly data: Readonly<Record<string, string | number>>;
  readonly tenantId: string | null;
  readonly locale: Locale;
  readonly idempotencyKey?: string;
}

export interface RenderedMail {
  readonly subject: string;
  readonly text: string;
}

export type MailRenderer = (message: MailMessage) => RenderedMail;

export interface Mailer {
  send(message: MailMessage): Promise<{ messageId: string }>;
}
