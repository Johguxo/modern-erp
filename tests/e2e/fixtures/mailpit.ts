// E1-H3 · Lectura de correos en Mailpit (Supabase local) por su API HTTP. Solo local: el servidor
// de la app debe correr con MAILPIT_URL=http://127.0.0.1:54324 para que el Mailer envíe aquí.
import { expect, type APIRequestContext } from '@playwright/test';

export const MAILPIT = 'http://127.0.0.1:54324';

interface MailpitSummary {
  readonly ID: string;
  readonly Subject: string;
}

export interface ReceivedMail {
  readonly subject: string;
  readonly text: string;
}

/** Último correo enviado a `email` (espera a que llegue). */
export async function waitForMail(
  request: APIRequestContext,
  email: string,
  options: { subject?: string } = {},
): Promise<ReceivedMail> {
  let mail: ReceivedMail | undefined;
  await expect
    .poll(
      async () => {
        const search = await request.get(
          `${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`,
        );
        if (!search.ok()) return undefined;
        const body = (await search.json()) as { messages?: MailpitSummary[] };
        const summary = body.messages?.find(
          (m) => !options.subject || m.Subject === options.subject,
        );
        if (!summary) return undefined;
        const message = (await (
          await request.get(`${MAILPIT}/api/v1/message/${summary.ID}`)
        ).json()) as { Subject: string; Text: string };
        mail = { subject: message.Subject, text: message.Text };
        return mail;
      },
      {
        message: `no llegó el correo a ${email} (¿el servidor corre con MAILPIT_URL?)`,
        timeout: 15_000,
      },
    )
    .toBeTruthy();
  if (!mail) throw new Error('correo no encontrado');
  return mail;
}

/** Ruta `/invitacion/<token>` del enlace del correo de invitación. */
export function invitationPathFrom(mail: ReceivedMail): string {
  const match = /https?:\/\/[^\s]+(\/invitacion\/[A-Za-z0-9_-]{43})/.exec(mail.text);
  if (!match?.[1]) throw new Error(`el correo no trae el enlace de invitación:\n${mail.text}`);
  return match[1];
}
