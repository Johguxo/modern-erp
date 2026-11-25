// E1-H4 · Consola de SuperAdmin, en escritorio y en celular (390×844): el SuperAdmin crea un
// cliente, la invitación llega a Mailpit, el admin del cliente crea su cuenta y entra a su empresa
// vacía; luego el SuperAdmin suspende la suscripción y el cliente queda en solo lectura. Quien no
// es SuperAdmin recibe 404. Requiere el servidor con MAILPIT_URL=http://127.0.0.1:54324.
// Inicios de sesión por proyecto: SuperAdmin 1, invitado 1 (al aceptar), usuario normal 1.
import { randomUUID } from 'node:crypto';

import { messages } from '../../src/ui/messages/es-PE';

import { expect, signIn, test } from './fixtures/auth';
import { invitationPathFrom, waitForMail } from './fixtures/mailpit';

const a = messages.admin;
const f = a.form;
const q = messages.sequence;

test('SuperAdmin crea un cliente → el admin invitado entra a su empresa → al suspender queda en solo lectura', async ({
  page,
  browser,
  request,
  accounts,
}) => {
  const superadmin = await accounts.create('superadmin');
  const tag = randomUUID().replaceAll('-', '').slice(0, 8);
  const name = `E2E Cliente ${tag}`;
  const slug = `e2e-cliente-${tag}`;
  const email = `e2e-adm-${tag}@test.linkus.pe`;
  accounts.trackTenantSlug(slug);
  accounts.trackEmail(email);

  await signIn(page, superadmin, /\/admin\/clientes$/);
  await expect(page.getByText(a.consoleBanner)).toBeVisible();

  // Alta: el slug se propone desde el nombre.
  await page.getByRole('link', { name: a.newTenant, exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/clientes\/nuevo$/);
  await page.getByLabel(f.name).fill(name);
  await expect(page.getByLabel(f.slug)).toHaveValue(slug);
  await page.getByLabel(f.maxUsers).fill('5');
  // Numeración del SOF (E3-H1): por defecto SOF-0001; se continúa el correlativo del cliente.
  await expect(page.getByTestId('sequence-preview')).toContainText('SOF-0001');
  await page.getByLabel(q.prefix, { exact: true }).fill('gr-');
  await page.getByLabel(q.nextNumber, { exact: true }).fill('500');
  await expect(page.getByTestId('sequence-preview')).toContainText('GR-0500');
  await page.getByLabel(f.adminEmail).fill(email);
  await page.getByRole('button', { name: f.create }).click();

  await expect(page).toHaveURL(/\/admin\/clientes\/[0-9a-f-]{36}\?aviso=created$/);
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: a.notices.created })).toBeVisible();
  const detailUrl = page.url().split('?')[0] ?? '';

  // Detalle: la numeración del alta, editable (el siguiente número puede subir).
  await expect(page.getByRole('heading', { name: q.title })).toBeVisible();
  await expect(page.getByLabel(q.prefix, { exact: true })).toHaveValue('GR-');
  await expect(page.getByLabel(q.nextNumber, { exact: true })).toHaveValue('500');
  await page.getByLabel(q.nextNumber, { exact: true }).fill('600');
  await expect(page.getByTestId('sequence-preview')).toContainText('GR-0600');
  await page.getByRole('button', { name: q.save }).click();
  await expect(page.getByRole('status').filter({ hasText: q.notices.saved })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel(q.nextNumber, { exact: true })).toHaveValue('600');
  await expect(page.getByTestId('sequence-preview')).toContainText('GR-0600');

  // Lista: plan, estado y usuarios activos / límite (con la invitación pendiente aparte).
  await page.getByRole('link', { name: a.back }).click();
  const row = page.getByRole('row').filter({ hasText: name });
  await expect(row).toContainText(messages.status.subscription_active);
  await expect(row).toContainText(a.usage(0, 5));
  await expect(row).toContainText(a.pendingInvitations(1));
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ),
  ).toBeLessThanOrEqual(0);

  // El admin del cliente acepta la invitación (otro navegador) y entra a su empresa vacía.
  const path = invitationPathFrom(await waitForMail(request, email));
  const invitee = await browser.newContext();
  try {
    const inviteePage = await invitee.newPage();
    await inviteePage.goto(path);
    await inviteePage.getByLabel(messages.invitation.fullName).fill('Admin Cliente E2E');
    await inviteePage.getByLabel(messages.auth.password).fill('Clave-de-prueba-123');
    await inviteePage.getByRole('button', { name: messages.invitation.submitNewAccount }).click();
    await expect(inviteePage).toHaveURL(/\/bandeja$/);
    await expect(inviteePage.getByText(messages.readOnly.banner)).toHaveCount(0);

    // El SuperAdmin suspende la suscripción.
    await page.goto(detailUrl);
    await page.getByLabel(f.status).click();
    await page.getByRole('option', { name: messages.status.subscription_suspended }).click();
    await page.getByRole('button', { name: f.save }).click();
    await expect(page.getByRole('status').filter({ hasText: a.notices.saved })).toBeVisible();
    await expect(page.getByText(a.detail.usage(1, 5))).toBeVisible();

    // El cliente queda en solo lectura.
    await inviteePage.reload();
    await expect(
      inviteePage.getByRole('status').filter({ hasText: messages.readOnly.banner }),
    ).toBeVisible();
  } finally {
    await invitee.close();
  }
});

test('un usuario sin SuperAdmin no llega a la consola (404)', async ({ page, accounts }) => {
  const account = await accounts.create('single');
  await signIn(page, account, /\/bandeja$/);

  for (const path of ['/admin/clientes', '/admin/clientes/nuevo']) {
    const response = await page.goto(path);
    expect(response?.status()).toBe(404);
    await expect(page.getByText(a.consoleBanner)).toHaveCount(0);
  }
});
