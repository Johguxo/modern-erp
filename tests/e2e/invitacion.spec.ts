// E1-H3 · Invitar y aceptar, en escritorio y en celular (390×844): el admin invita desde
// /configuracion/usuarios, el correo llega a Mailpit con /invitacion/<token> y el invitado crea su
// cuenta (o se une con su contraseña). Requiere el servidor con MAILPIT_URL=http://127.0.0.1:54324.
//
// Límite de Supabase local: 30 inicios de sesión cada 5 min por IP. El admin inicia sesión una vez
// por proyecto y cada prueba reutiliza sus cookies; aceptar inicia una sesión más por prueba.
import { randomUUID } from 'node:crypto';

import type { BrowserContext, Page } from '@playwright/test';

import { messages } from '../../src/ui/messages/es-PE';

import { createAccounts, expect, signIn, test, type Account, type Accounts } from './fixtures/auth';
import { invitationPathFrom, waitForMail } from './fixtures/mailpit';

type Cookies = Awaited<ReturnType<BrowserContext['cookies']>>;

const t = messages.invitation;
const u = messages.users;

let admins: Accounts;
let admin: Account;
let adminCookies: Cookies;

test.beforeAll(async ({ browser }) => {
  admins = createAccounts();
  admin = await admins.create('single');
  const context = await browser.newContext();
  const page = await context.newPage();
  await signIn(page, admin, /\/bandeja$/);
  adminCookies = await context.cookies();
  await context.close();
});

test.afterAll(async () => {
  await admins.cleanup();
});

const tenantName = () => admin.tenants[0]?.name ?? '';

/** Con la sesión del admin, invita a `email` y espera el aviso de enviado. */
async function invite(page: Page, email: string) {
  await page.context().addCookies(adminCookies);
  await page.goto('/configuracion/usuarios');
  await page.getByRole('button', { name: u.invite }).click();
  const dialog = page.getByRole('dialog', { name: u.inviteTitle });
  await dialog.getByLabel(messages.auth.email).fill(email);
  await dialog.getByRole('button', { name: u.inviteSubmit }).click();
  await expect(page.getByRole('status').filter({ hasText: u.notices.invited })).toBeVisible();
  await expect(
    page.getByRole('region', { name: u.pendingTitle }).getByText(email, { exact: true }),
  ).toBeVisible();
  // design-tokens.md: botones de al menos 44 px, también en 390 px y sin scroll horizontal.
  const item = page
    .getByRole('region', { name: u.pendingTitle })
    .getByRole('listitem')
    .filter({ hasText: email });
  for (const name of [u.resend, u.cancelInvitation]) {
    const box = await item.getByRole('button', { name }).boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  }
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ),
  ).toBeLessThanOrEqual(0);
}

test('admin invita → el correo llega a Mailpit con el enlace → crea su cuenta y entra a /bandeja', async ({
  page,
  request,
  accounts,
}) => {
  const email = `e2e-inv-${randomUUID().slice(0, 8)}@test.linkus.pe`;
  accounts.trackEmail(email);

  await invite(page, email);
  const mail = await waitForMail(request, email);
  expect(mail.subject).toBe(messages.emails.invitation.subject({ tenantName: tenantName() }));
  expect(mail.text).toContain('7 días');
  const path = invitationPathFrom(mail);

  // El invitado abre el enlace sin sesión.
  await page.context().clearCookies();
  await page.goto(path);
  await expect(page.getByRole('heading', { level: 1, name: t.title(tenantName()) })).toBeVisible();
  await expect(page.getByText(t.invitedEmail(email))).toBeVisible();
  await page.getByLabel(t.fullName).fill('Invitada E2E');
  await page.getByLabel(messages.auth.password).fill('Clave-de-prueba-123');
  await page.getByRole('button', { name: t.submitNewAccount }).click();

  await expect(page).toHaveURL(/\/bandeja$/);
  await expect(page.getByRole('heading', { level: 1, name: messages.inbox.title })).toBeVisible();

  // El enlace ya usado muestra el mismo mensaje que uno inválido.
  await page.goto(path);
  await expect(page.getByRole('heading', { level: 1, name: t.invalidTitle })).toBeVisible();
  await expect(page.getByText(messages.errors.reasons.invitation_invalid())).toBeVisible();
});

test('usuario existente acepta con su contraseña → se une y luego aparece en /elegir-empresa', async ({
  page,
  request,
  accounts,
}) => {
  const existing = await accounts.create('single');

  await invite(page, existing.email);
  const path = invitationPathFrom(await waitForMail(request, existing.email));

  await page.context().clearCookies();
  await page.goto(path);
  await expect(page.getByText(t.passwordHint)).toBeVisible();
  await expect(page.getByLabel(messages.auth.email)).toHaveValue(existing.email);
  await expect(page.getByLabel(t.fullName)).toHaveCount(0);
  await page.getByLabel(messages.auth.password).fill(existing.password);
  await page.getByRole('button', { name: t.submitJoin }).click();

  await expect(page).toHaveURL(/\/bandeja$/);
  // Ahora tiene dos empresas: la suya y la que lo invitó.
  await page.goto('/elegir-empresa');
  await expect(
    page.getByRole('heading', { level: 1, name: messages.auth.chooseTenantTitle }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: tenantName() })).toBeVisible();
  await expect(page.getByRole('button', { name: existing.tenants[0]?.name })).toBeVisible();
});

test('enlace inválido → mensaje genérico, sin formulario, y la página no se indexa ni envía Referer', async ({
  page,
}) => {
  const fake = 'A'.repeat(43);

  const response = await page.goto(`/invitacion/${fake}`);

  expect(response?.status()).toBe(200);
  await expect(page.getByRole('heading', { level: 1, name: t.invalidTitle })).toBeVisible();
  await expect(page.getByText(messages.errors.reasons.invitation_invalid())).toBeVisible();
  await expect(page.getByLabel(messages.auth.password)).toHaveCount(0);
  await expect(page.locator('meta[name="referrer"]')).toHaveAttribute('content', 'no-referrer');
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
});

test('enlace con formato raro (no 43 caracteres) → el mismo mensaje genérico', async ({ page }) => {
  await page.goto('/invitacion/abc');

  await expect(page.getByRole('heading', { level: 1, name: t.invalidTitle })).toBeVisible();
  await expect(page.getByText(messages.errors.reasons.invitation_invalid())).toBeVisible();
});
