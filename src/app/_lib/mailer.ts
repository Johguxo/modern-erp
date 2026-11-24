// Mailer del proceso web (E1-H3): elige el adaptador según el entorno y le pasa el renderer de
// texto plano de es-PE. Perezoso: `next build` compila sin .env.local.
import { getEnv } from '@/env';
import { createMailer } from '@/shared/adapters/mailers';
import { getLogger } from '@/shared/adapters/pino-logger';
import type { Mailer } from '@/shared/ports/mailer';
import { renderEmailText } from '@/ui/emails/render-text';

let cached: Mailer | undefined;

export function getMailer(): Mailer {
  if (!cached) {
    const env = getEnv();
    cached = createMailer(
      { from: env.MAIL_FROM, resendApiKey: env.RESEND_API_KEY, mailpitUrl: env.MAILPIT_URL },
      { render: renderEmailText, logger: getLogger() },
    );
  }
  return cached;
}
