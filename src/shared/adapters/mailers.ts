// Adaptadores del puerto Mailer (E1-H3): Resend en producción (texto simple), Mailpit en local
// (API HTTP de Supabase local) y, sin ninguno configurado, uno que registra un error y falla.
// La plantilla se convierte en asunto y texto con el MailRenderer que recibe la fábrica.
import { Resend } from 'resend';

import type { Logger } from '../ports/logger';
import type { Mailer, MailMessage, MailRenderer } from '../ports/mailer';

export interface MailAddress {
  readonly email: string;
  readonly name: string;
}

/** `"Nombre <correo>"` (formato de MAIL_FROM, validado en env.ts) → nombre y correo. */
export function parseMailFrom(value: string): MailAddress {
  const match = /^(.*)<([^<>\s@]+@[^<>\s@]+)>$/.exec(value.trim());
  if (!match?.[2]) throw new Error('MAIL_FROM debe tener el formato "Nombre <correo>".');
  return { name: (match[1] ?? '').trim().replace(/^"|"$/g, ''), email: match[2] };
}

export interface MailerConfig {
  readonly from: string;
  readonly resendApiKey?: string;
  readonly mailpitUrl?: string;
}

export interface MailerDeps {
  readonly render: MailRenderer;
  readonly logger: Logger;
  /** Inyectable para pruebas. */
  readonly fetch?: typeof fetch;
}

export function createResendMailer(
  config: { apiKey: string; from: string },
  deps: MailerDeps,
): Mailer {
  const resend = new Resend(config.apiKey);
  return {
    async send(message) {
      const { subject, text } = deps.render(message);
      const { data, error } = await resend.emails.send(
        { from: config.from, to: [...message.to], subject, text },
        message.idempotencyKey ? { idempotencyKey: message.idempotencyKey } : undefined,
      );
      if (error || !data) {
        throw Object.assign(new Error('Resend send failed'), { cause: error });
      }
      return { messageId: data.id };
    },
  };
}

export function createMailpitMailer(config: { url: string; from: string }, deps: MailerDeps): Mailer {
  const from = parseMailFrom(config.from);
  const doFetch = deps.fetch ?? fetch;
  const endpoint = new URL('/api/v1/send', config.url).toString();
  return {
    async send(message: MailMessage) {
      const { subject, text } = deps.render(message);
      const response = await doFetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          From: { Email: from.email, Name: from.name },
          To: message.to.map((email) => ({ Email: email })),
          Subject: subject,
          Text: text,
        }),
      });
      if (!response.ok) throw new Error(`Mailpit send failed with status ${response.status}`);
      const body = (await response.json().catch(() => ({}))) as { ID?: unknown };
      return { messageId: typeof body.ID === 'string' ? body.ID : 'mailpit' };
    },
  };
}

/** Sin proveedor configurado: no envía, deja un error en el log y falla (la UI avisa). */
export function createUnconfiguredMailer(deps: Pick<MailerDeps, 'logger'>): Mailer {
  return {
    send(message) {
      deps.logger.error(
        { template: message.template, tenantId: message.tenantId },
        'mailer not configured: set RESEND_API_KEY or MAILPIT_URL',
      );
      return Promise.reject(new Error('Mailer not configured'));
    },
  };
}

/** Resend si hay RESEND_API_KEY; si no, Mailpit si hay MAILPIT_URL; si no, ninguno. */
export function mailerKind(config: MailerConfig): 'resend' | 'mailpit' | 'none' {
  if (config.resendApiKey) return 'resend';
  if (config.mailpitUrl) return 'mailpit';
  return 'none';
}

export function createMailer(config: MailerConfig, deps: MailerDeps): Mailer {
  switch (mailerKind(config)) {
    case 'resend':
      return createResendMailer({ apiKey: config.resendApiKey ?? '', from: config.from }, deps);
    case 'mailpit':
      return createMailpitMailer({ url: config.mailpitUrl ?? '', from: config.from }, deps);
    case 'none':
      return createUnconfiguredMailer(deps);
  }
}
