// Asunto y texto plano de cada plantilla de correo, con los textos de es-PE (E1-H3). Es el
// MailRenderer de los adaptadores de src/shared/adapters/mailers.ts. React Email llega en E5-H2.
import type { MailMessage, MailTemplate, RenderedMail } from '@/shared/ports/mailer';
import { messages } from '@/ui/messages/es-PE';

const RENDERERS: Record<MailTemplate, (data: MailMessage['data']) => RenderedMail> = {
  'identity.invitation': (data) => ({
    subject: messages.emails.invitation.subject(data),
    text: messages.emails.invitation.text(data),
  }),
};

export function renderEmailText(message: MailMessage): RenderedMail {
  return RENDERERS[message.template](message.data);
}
