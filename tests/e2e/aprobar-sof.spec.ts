// E4-H2 · Decidir un SOF, en escritorio y en celular (390×844): aprobación completa en dos pasos
// (almacén y gerencia, con el contador de la bandeja), rechazo con comentario obligatorio, y pedir
// cambios → editar → reenviar. En el celular, Rechazar y Aprobar viven en una barra fija inferior
// que no tapa contenido.
// Inicios de sesión por proyecto: 9 (tres pruebas, varios usuarios).
import type { Page } from '@playwright/test';

import { messages } from '../../src/ui/messages/es-PE';

import { expect, signIn, test, type Account, type Accounts } from './fixtures/auth';

const t = messages.requests.detail;
const decision = t.decision;
const inbox = messages.inbox;

const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true });
const isMobile = (page: Page) => (page.viewportSize()?.width ?? 1280) < 768;
const timeline = (page: Page) => page.getByRole('complementary', { name: t.timeline.title });
const statusBadge = (page: Page, label: string) =>
  page.locator('header').filter({ hasText: label });

/** Sin scroll horizontal de la página. */
async function expectNoPageOverflow(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

/** Cambia de usuario en la misma página: borra la sesión y entra de nuevo. */
async function switchTo(page: Page, account: Account) {
  await page.context().clearCookies();
  await signIn(page, account, /\/bandeja$/);
}

/** Cuánto dice la tarjeta «Esperan mi aprobación» de la bandeja. */
async function expectAwaitingMe(page: Page, value: string) {
  await page.goto('/bandeja');
  const summary = page.getByRole('region', { name: inbox.summaryLabel });
  const card = summary.locator('div').filter({ hasText: inbox.cards.awaitingMe }).first();
  await expect(card).toContainText(value);
}

interface World {
  readonly requester: Account;
  readonly warehouse: Account;
  readonly manager: Account;
  readonly draftId: string;
}

/** Empresa con el catálogo, los tres roles de la ruta estándar y un borrador listo para enviar. */
async function seedWorld(accounts: Accounts): Promise<World> {
  const admin = await accounts.create('single');
  const tenantId = admin.tenants[0]?.id ?? '';
  await accounts.addRequestCatalog(tenantId);
  const requester = await accounts.addMember(tenantId, ['requester']);
  const warehouse = await accounts.addMember(tenantId, ['warehouse']);
  const manager = await accounts.addMember(tenantId, ['approver']);
  const [draftId] = await accounts.addRequests(tenantId, [
    {
      requesterId: requester.userId,
      status: 'draft',
      reason: 'Mantenimiento de 500 horas',
      lines: [
        { productCode: 'FIL-1', quantity: '2.000', equipmentCode: 'EQ-1' },
        { productCode: 'PER-2', quantity: '3.000' },
      ],
    },
  ]);
  return { requester, warehouse, manager, draftId: draftId ?? '' };
}

/** El solicitante envía el borrador desde el editor (el motor arma la ruta real). */
async function sendDraft(page: Page, world: World): Promise<void> {
  await signIn(page, world.requester, /\/bandeja$/);
  await page.goto(`/solicitudes/${world.draftId}/editar`);
  await button(page, messages.requests.actions.submit).click();
  await expect(page).toHaveURL(/\/solicitudes\/[^/]+\?enviado=1$/);
  await expect(page.getByText(t.submittedNotice('SOF-0001'))).toBeVisible();
}

/** El aprobador abre el detalle de la solicitud y confirma que le toca decidir. */
async function openDetail(page: Page, world: World) {
  await page.goto(`/solicitudes/${world.draftId}`);
  await expect(page.getByRole('heading', { level: 1, name: /SOF-0001/ })).toBeVisible();
}

test('aprobación completa en dos pasos, con el contador de la bandeja', async ({
  page,
  accounts,
}) => {
  const world = await seedWorld(accounts);
  await sendDraft(page, world);

  // ── Paso 1: almacén ─────────────────────────────────────────────────────────────────────────
  await switchTo(page, world.warehouse);
  await expectAwaitingMe(page, '1');
  await openDetail(page, world);
  await expect(statusBadge(page, messages.status.awaiting_my_approval)).toBeVisible();

  // En el celular la barra fija reemplaza los botones del panel.
  const bar = page.getByRole('group', { name: t.actions.decisionLabel });
  if (isMobile(page)) {
    await expect(bar).toBeVisible();
    const barBox = await bar.boundingBox();
    expect(Math.abs((barBox?.y ?? 0) + (barBox?.height ?? 0) - 844)).toBeLessThan(2);
    expect(barBox?.height ?? 0).toBeGreaterThanOrEqual(52);
    // Con el scroll al final, el contenido termina por encima de la barra (no queda tapado).
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    const lastBox = await timeline(page).boundingBox();
    expect((lastBox?.y ?? 0) + (lastBox?.height ?? 0)).toBeLessThanOrEqual((barBox?.y ?? 0) + 1);
    await page.evaluate(() => window.scrollTo(0, 0));
  } else {
    await expect(bar).toHaveCount(0);
  }
  await expectNoPageOverflow(page);

  await button(page, t.actions.approve).click();
  const dialog = page.getByRole('dialog', { name: decision.approve.title('SOF-0001') });
  await expect(dialog).toBeVisible();
  // Aprobar no exige comentario: se puede enviar vacío; aquí se deja uno.
  await dialog.getByLabel(decision.approve.commentLabel).fill('Hay stock suficiente');
  await dialog.getByRole('button', { name: decision.approve.submit, exact: true }).click();

  await expect(page.getByText(t.decidedNotice.advanced('SOF-0001'))).toBeVisible();
  await expect(page).toHaveURL(/\?decision=advanced$/);
  await expect(statusBadge(page, messages.status.in_approval)).toBeVisible();
  // Ya no tiene nada pendiente: sin botones de decisión y el contador baja a 0.
  await expect(button(page, t.actions.approve)).toHaveCount(0);
  await expect(bar).toHaveCount(0);
  await expectAwaitingMe(page, '0');

  // ── Paso 2: gerencia local ──────────────────────────────────────────────────────────────────
  await switchTo(page, world.manager);
  await expectAwaitingMe(page, '1');
  await openDetail(page, world);
  await button(page, t.actions.approve).click();
  const last = page.getByRole('dialog', { name: decision.approve.title('SOF-0001') });
  // Sin comentario: aprobar lo permite.
  await last.getByRole('button', { name: decision.approve.submit, exact: true }).click();

  await expect(page.getByText(t.decidedNotice.approved('SOF-0001'))).toBeVisible();
  await expect(statusBadge(page, messages.status.approved)).toBeVisible();
  await expect(timeline(page)).toContainText(t.timeline.steps.approved);
  await expectNoPageOverflow(page);
  await expectAwaitingMe(page, '0');

  // El solicitante ve la solicitud aprobada y ningún botón de decisión.
  await switchTo(page, world.requester);
  await openDetail(page, world);
  await expect(statusBadge(page, messages.status.approved)).toBeVisible();
  await expect(button(page, t.actions.approve)).toHaveCount(0);
});

test('rechazar exige comentario y lo deja en la línea de tiempo', async ({ page, accounts }) => {
  const world = await seedWorld(accounts);
  await sendDraft(page, world);

  await switchTo(page, world.warehouse);
  await openDetail(page, world);
  await button(page, t.actions.reject).click();
  const dialog = page.getByRole('dialog', { name: decision.reject.title('SOF-0001') });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText(decision.reject.description);
  const submit = dialog.getByRole('button', { name: decision.reject.submit, exact: true });

  // Sin comentario (o solo espacios) no se rechaza.
  await submit.click();
  await expect(dialog.getByText(messages.validation.required)).toBeVisible();
  await dialog.getByLabel(decision.reject.commentLabel).fill('   ');
  await submit.click();
  await expect(dialog.getByText(messages.validation.required)).toBeVisible();
  await expect(dialog).toBeVisible();

  // «Volver» cierra sin rechazar.
  await dialog.getByRole('button', { name: decision.back }).click();
  await expect(dialog).toBeHidden();
  await expect(statusBadge(page, messages.status.awaiting_my_approval)).toBeVisible();

  await button(page, t.actions.reject).click();
  const again = page.getByRole('dialog', { name: decision.reject.title('SOF-0001') });
  await again
    .getByLabel(decision.reject.commentLabel)
    .fill('No corresponde a este centro de costo');
  await again.getByRole('button', { name: decision.reject.submit, exact: true }).click();

  await expect(page.getByText(t.decidedNotice.rejected('SOF-0001'))).toBeVisible();
  await expect(statusBadge(page, messages.status.rejected)).toBeVisible();
  const stopped = timeline(page).getByRole('listitem').last();
  await expect(stopped).toContainText(t.timeline.steps.rejected);
  await expect(stopped).toContainText('E2E');
  await expect(stopped).toContainText('No corresponde a este centro de costo');
  await expect(button(page, t.actions.reject)).toHaveCount(0);
  await expectNoPageOverflow(page);

  // El solicitante lee el motivo y no puede editar ni reenviar: el rechazo cierra la solicitud.
  await switchTo(page, world.requester);
  await openDetail(page, world);
  await expect(timeline(page)).toContainText('No corresponde a este centro de costo');
  await expect(page.getByRole('link', { name: t.actions.edit_request })).toHaveCount(0);
  await expect(button(page, t.actions.resubmit)).toHaveCount(0);
});

test('pedir cambios, editar y reenviar vuelve a abrir la aprobación', async ({
  page,
  accounts,
}) => {
  const world = await seedWorld(accounts);
  await sendDraft(page, world);

  await switchTo(page, world.warehouse);
  await expectAwaitingMe(page, '1');
  await openDetail(page, world);
  await button(page, t.actions.request_changes).click();
  const dialog = page.getByRole('dialog', { name: decision.request_changes.title('SOF-0001') });
  const submit = dialog.getByRole('button', {
    name: decision.request_changes.submit,
    exact: true,
  });
  await submit.click();
  await expect(dialog.getByText(messages.validation.required)).toBeVisible();
  await dialog
    .getByLabel(decision.request_changes.commentLabel)
    .fill('Falta indicar el equipo de los pernos');
  await submit.click();

  await expect(page.getByText(t.decidedNotice.changes_requested('SOF-0001'))).toBeVisible();
  await expect(statusBadge(page, messages.status.changes_requested)).toBeVisible();
  await expectAwaitingMe(page, '0');

  // El solicitante ve qué le piden, edita y reenvía.
  await switchTo(page, world.requester);
  await openDetail(page, world);
  await expect(statusBadge(page, messages.status.changes_requested)).toBeVisible();
  const stopped = timeline(page).getByRole('listitem').filter({
    hasText: t.timeline.steps.changes_requested,
  });
  await expect(stopped).toContainText('Falta indicar el equipo de los pernos');
  await expect(stopped).toContainText('E2E');
  await expect(button(page, t.actions.resubmit)).toBeVisible();

  await page.getByRole('link', { name: t.actions.edit_request }).click();
  await expect(page).toHaveURL(/\/editar$/);
  const actions = messages.requests.actions;
  // El editor ofrece reenviar (no «Enviar a aprobación») y guardar cambios.
  await expect(button(page, actions.submit)).toHaveCount(0);
  await expect(button(page, actions.resubmit)).toBeVisible();
  await page
    .getByLabel(messages.requests.general.reason)
    .fill('Mantenimiento de 500 horas (revisado)');
  await button(page, actions.saveChanges).click();
  await expect(page.getByText(messages.requests.notices.changesSaved)).toBeVisible();
  await button(page, actions.resubmit).click();

  await expect(page).toHaveURL(/\/solicitudes\/[^/]+\?enviado=1$/);
  await expect(statusBadge(page, messages.status.in_approval)).toBeVisible();
  await expect(page.getByRole('heading', { level: 1, name: /revisado/ })).toBeVisible();

  // La ronda 2 vuelve a esperar a almacén.
  await switchTo(page, world.warehouse);
  await expectAwaitingMe(page, '1');
  await openDetail(page, world);
  await expect(button(page, t.actions.approve)).toBeVisible();
  await expectNoPageOverflow(page);
});
