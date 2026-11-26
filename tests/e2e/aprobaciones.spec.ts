// E4-H1 · Políticas de aprobación, en escritorio y en celular (390×844): el admin edita los pasos
// (tipo de aprobador, usuarios, regla, orden), ve la advertencia de un rol sin miembros y aun así
// guarda; el cambio persiste al recargar y el editor del SOF muestra al aprobador elegido; sin pasos
// o con un paso sin aprobadores se muestra el error; un solicitante recibe 404 y en solo lectura
// todo queda deshabilitado.
// Inicios de sesión por proyecto: 4 (una prueba cada uno).
import type { Page } from '@playwright/test';

import { messages } from '../../src/ui/messages/es-PE';

import { expect, signIn, test, type Account } from './fixtures/auth';

const t = messages.approvals;

/** El menú visible según el ancho: lateral en escritorio, panel en el celular. */
async function openMenu(page: Page) {
  const isMobile = (page.viewportSize()?.width ?? 1280) < 768;
  if (isMobile) {
    await page.getByRole('button', { name: messages.nav.openMenu }).click();
    return page.getByRole('dialog');
  }
  return page.locator('aside');
}

/** Sin scroll horizontal de la página. */
async function expectNoPageOverflow(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

/** El fixture crea a cada usuario con el nombre «E2E <etiqueta>», la misma del correo. */
function fullNameOf(account: Account): string {
  return `E2E ${account.email.split('@')[0]?.slice(4)}`;
}

const stepGroup = (page: Page, n: number) =>
  page.getByRole('group', { name: t.stepTitle(n), exact: true });

test('el admin edita los pasos, ve la advertencia, guarda y el editor del SOF muestra la ruta', async ({
  page,
  accounts,
}) => {
  const admin = await accounts.create('single');
  const tenantId = admin.tenants[0]?.id ?? '';
  await accounts.addRequestCatalog(tenantId);
  const manager = await accounts.addMember(tenantId, ['approver']);
  const managerName = fullNameOf(manager);
  await signIn(page, admin, /\/bandeja$/);

  const menu = await openMenu(page);
  await menu.getByRole('link', { name: messages.nav.approvals }).click();
  await expect(page).toHaveURL(/\/configuracion\/aprobaciones$/);
  await expect(page.getByRole('heading', { level: 1, name: t.title })).toBeVisible();
  await expect(page.getByText(t.policyLabel('SOF estándar'))).toBeVisible();

  // La política estándar: Almacén y Gerencia local, por rol.
  await expect(stepGroup(page, 1).getByLabel(t.name)).toHaveValue('Almacén');
  await expect(stepGroup(page, 2).getByLabel(t.name)).toHaveValue('Gerencia local');

  // El paso 2 pasa a personas concretas: se elige al aprobador y deben aprobar todos.
  const second = stepGroup(page, 2);
  await second.getByLabel(t.approverType).selectOption('users');
  await second.getByRole('checkbox', { name: managerName }).check();
  await second.getByLabel(t.rule).selectOption('all');
  await expect(second.getByRole('button', { name: t.removeUser(managerName) })).toBeVisible();

  // Un paso nuevo con un rol que nadie tiene: advertencia en vivo (ese rol no puede aprobar), y se sube al lugar 2.
  await page.getByRole('button', { name: t.addStep }).click();
  const third = stepGroup(page, 3);
  await third.getByLabel(t.name).fill('Compras');
  await third.getByLabel(t.role, { exact: true }).selectOption('purchasing');
  await expect(
    third.getByText(t.warnings.roleCannotDecide(messages.roles.purchasing)),
  ).toBeVisible();
  await third.getByRole('button', { name: t.moveUp }).click();
  await expect(stepGroup(page, 2).getByLabel(t.name)).toHaveValue('Compras');
  await expect(stepGroup(page, 3).getByLabel(t.name)).toHaveValue('Gerencia local');

  // Se guarda aun con la advertencia, y todo persiste al recargar.
  await page.getByRole('button', { name: t.save }).click();
  await expect(page.getByRole('status').filter({ hasText: t.saved })).toBeVisible();
  await page.reload();
  await expect(stepGroup(page, 1).getByLabel(t.name)).toHaveValue('Almacén');
  await expect(stepGroup(page, 2).getByLabel(t.name)).toHaveValue('Compras');
  await expect(stepGroup(page, 2).getByLabel(t.role, { exact: true })).toHaveValue('purchasing');
  await expect(
    stepGroup(page, 2).getByText(t.warnings.roleCannotDecide(messages.roles.purchasing)),
  ).toBeVisible();
  await expect(stepGroup(page, 3).getByLabel(t.name)).toHaveValue('Gerencia local');
  await expect(stepGroup(page, 3).getByLabel(t.approverType)).toHaveValue('users');
  await expect(stepGroup(page, 3).getByLabel(t.rule)).toHaveValue('all');
  await expect(
    stepGroup(page, 3).getByRole('button', { name: t.removeUser(managerName) }),
  ).toBeVisible();
  await expectNoPageOverflow(page);

  // El editor del SOF muestra la ruta con el aprobador elegido.
  await page.goto('/solicitudes/nueva');
  const route = page.getByRole('complementary', { name: messages.requests.route.title });
  await expect(route).toContainText('Compras');
  await expect(route).toContainText('Gerencia local');
  await expect(route).toContainText(managerName);
});

test('sin pasos o con un paso sin aprobadores se muestra el error', async ({ page, accounts }) => {
  const admin = await accounts.create('single');
  await signIn(page, admin, /\/bandeja$/);
  await page.goto('/configuracion/aprobaciones');
  await expect(page.getByRole('heading', { level: 1, name: t.title })).toBeVisible();

  // Se quitan los dos pasos y se intenta guardar.
  await stepGroup(page, 1).getByRole('button', { name: t.remove }).click();
  await stepGroup(page, 1).getByRole('button', { name: t.remove }).click();
  await expect(page.getByText(t.empty)).toBeVisible();
  await page.getByRole('button', { name: t.save }).click();
  await expect(
    page.getByRole('alert').filter({ hasText: messages.errors.reasons.policy_without_steps() }),
  ).toBeVisible();

  // Un paso por rol sin elegir el rol.
  await page.getByRole('button', { name: t.addStep }).click();
  const step = stepGroup(page, 1);
  await step.getByLabel(t.name).fill('Sin rol');
  await page.getByRole('button', { name: t.save }).click();
  await expect(step.getByText(messages.errors.reasons.step_without_approvers())).toBeVisible();

  // Un paso de personas sin elegir a nadie.
  await step.getByLabel(t.approverType).selectOption('users');
  await page.getByRole('button', { name: t.save }).click();
  await expect(step.getByText(messages.errors.reasons.step_without_approvers())).toBeVisible();
  await expect(step.getByText(t.usersNone)).toBeVisible();

  // Nada se guardó: al recargar sigue la política estándar.
  await page.reload();
  await expect(stepGroup(page, 1).getByLabel(t.name)).toHaveValue('Almacén');
  await expect(stepGroup(page, 2).getByLabel(t.name)).toHaveValue('Gerencia local');
});

test('un solicitante no ve el ítem y recibe "no encontrada"', async ({ page, accounts }) => {
  const admin = await accounts.create('single');
  const tenantId = admin.tenants[0]?.id ?? '';
  const requester = await accounts.addMember(tenantId, ['requester']);
  await signIn(page, requester, /\/bandeja$/);

  const menu = await openMenu(page);
  await expect(menu.getByRole('link', { name: messages.nav.approvals })).toHaveCount(0);
  await page.keyboard.press('Escape');

  await page.goto('/configuracion/aprobaciones');
  // Soft 404 conocido (igual que /configuracion/empresa): el código HTTP es 200 por el loading.tsx.
  await expect(page.getByText(messages.states.notFoundTitle)).toBeVisible();
  await expect(page.getByRole('heading', { level: 1, name: t.title })).toHaveCount(0);
  await expect(page.getByRole('button', { name: t.save })).toHaveCount(0);
});

test('en solo lectura la política se ve deshabilitada', async ({ page, accounts }) => {
  const admin = await accounts.create('suspended');
  await signIn(page, admin, /\/bandeja$/);
  await page.goto('/configuracion/aprobaciones');

  await expect(page.getByRole('heading', { level: 1, name: t.title })).toBeVisible();
  await expect(stepGroup(page, 1).getByLabel(t.name)).toBeDisabled();
  await expect(stepGroup(page, 1).getByRole('button', { name: t.remove })).toBeDisabled();
  await expect(page.getByRole('button', { name: t.addStep })).toBeDisabled();
  await expect(page.getByRole('button', { name: t.save })).toBeDisabled();
});
