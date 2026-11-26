// E3-H5 · Anular un SOF, en escritorio y en celular (390×844): el solicitante anula un borrador y
// uno en aprobación (diálogo con comentario obligatorio, aviso, «Anulada» y comentario en la línea
// de tiempo), el administrador anula uno aprobado, almacén no ve «Anular» y en solo lectura el
// botón queda deshabilitado.
// Inicios de sesión por proyecto: 4 (una prueba cada uno).
import type { Page } from '@playwright/test';

import { messages } from '../../src/ui/messages/es-PE';

import { expect, signIn, test } from './fixtures/auth';

const t = messages.requests.detail;
const dialogText = t.cancel;

const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true });
const isMobile = (page: Page) => (page.viewportSize()?.width ?? 1280) < 768;

/** Sin scroll horizontal de la página. */
async function expectNoPageOverflow(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

/** El soft 404 de Next llega con el HTML ya enviado: se espera el texto, nunca se pregunta ya. */
async function expectNotFound(page: Page, path: string) {
  await page.goto(path);
  await expect(page.getByText(messages.states.notFoundTitle)).toBeVisible();
}

async function openDialog(page: Page, number: string | null) {
  await button(page, t.actions.cancel).click();
  const dialog = page.getByRole('dialog', { name: dialogText.title(number) });
  await expect(dialog).toBeVisible();
  return dialog;
}

test('el solicitante anula un borrador y uno en aprobación, con comentario obligatorio', async ({
  page,
  accounts,
}) => {
  const admin = await accounts.create('single');
  const tenantId = admin.tenants[0]?.id ?? '';
  await accounts.addRequestCatalog(tenantId);
  const requester = await accounts.addMember(tenantId, ['requester']);
  const [sentId, draftId] = await accounts.addRequests(tenantId, [
    {
      requesterId: requester.userId,
      status: 'in_approval',
      number: 'SOF-0301',
      reason: 'Reposición de filtros',
      lines: [{ productCode: 'FIL-1', quantity: '2.000' }],
    },
    {
      requesterId: requester.userId,
      status: 'draft',
      reason: 'Borrador por anular',
      lines: [{ productCode: 'PER-2', quantity: '1.000' }],
    },
  ]);

  await signIn(page, requester, /\/bandeja$/);

  // ── En aprobación: el diálogo exige el comentario ───────────────────────────────────────────
  await page.goto(`/solicitudes/${sentId}`);
  await expect(page.getByRole('heading', { level: 1, name: /SOF-0301/ })).toBeVisible();
  const dialog = await openDialog(page, 'SOF-0301');
  await expect(dialog).toContainText(dialogText.description);
  const comment = dialog.getByLabel(dialogText.commentLabel);
  await expect(comment).toBeVisible();
  await expect(dialog.getByText(dialogText.counter(0, 500))).toBeVisible();
  await expectNoPageOverflow(page);

  // En el celular los botones se apilan y el diálogo cabe en la pantalla.
  const back = dialog.getByRole('button', { name: dialogText.back });
  const confirm = dialog.getByRole('button', { name: dialogText.submit });
  const backBox = await back.boundingBox();
  const confirmBox = await confirm.boundingBox();
  // Redondeado: en el celular el alto llega con una fracción de píxel (43.99).
  expect(
    Math.round(Math.min(backBox?.height ?? 0, confirmBox?.height ?? 0)),
  ).toBeGreaterThanOrEqual(44);
  if (isMobile(page)) {
    expect(Math.abs((backBox?.x ?? 0) - (confirmBox?.x ?? 99))).toBeLessThan(2);
    expect(Math.abs((backBox?.y ?? 0) - (confirmBox?.y ?? 0))).toBeGreaterThan(20);
    const box = await dialog.boundingBox();
    expect((box?.x ?? -1) + (box?.width ?? 999)).toBeLessThanOrEqual(390);
  }

  // Comentario vacío (o solo espacios): error en el campo y el documento no cambia.
  await confirm.click();
  await expect(dialog.getByText(messages.validation.required)).toBeVisible();
  await comment.fill('    ');
  await confirm.click();
  await expect(dialog.getByText(messages.validation.required)).toBeVisible();
  await expect(dialog).toBeVisible();

  // «Volver» cierra sin anular.
  await back.click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText(t.cancelledNotice('SOF-0301'))).toHaveCount(0);
  await expect(
    page.locator('header').filter({ hasText: messages.status.in_approval }),
  ).toBeVisible();

  // Anular con comentario: aviso, estado «Anulada», comentario y autor en la línea de tiempo.
  const again = await openDialog(page, 'SOF-0301');
  await again.getByLabel(dialogText.commentLabel).fill('  Se pidió dos veces el mismo filtro  ');
  await expect(again.getByText(dialogText.counter(34, 500))).toBeVisible();
  await again.getByRole('button', { name: dialogText.submit }).click();

  await expect(page.getByText(t.cancelledNotice('SOF-0301'))).toBeVisible();
  await expect(page).toHaveURL(/\?anulado=1$/);
  await expect(page.locator('header').filter({ hasText: messages.status.cancelled })).toBeVisible();
  const timeline = page.getByRole('complementary', { name: t.timeline.title });
  const steps = timeline.getByRole('listitem');
  await expect(steps).toHaveCount(3);
  await expect(steps.nth(2)).toContainText(t.timeline.steps.cancelled);
  await expect(steps.nth(2)).toContainText(t.timeline.states.stopped);
  await expect(steps.nth(2)).toContainText('E2E');
  await expect(steps.nth(2).locator('time')).toHaveCount(1);
  await expect(steps.nth(2)).toContainText('Se pidió dos veces el mismo filtro');
  await expect(button(page, t.actions.cancel)).toHaveCount(0);
  await expectNoPageOverflow(page);

  // Sin ?anulado=1 el aviso no sale.
  await page.goto(`/solicitudes/${sentId}`);
  await expect(page.getByRole('heading', { level: 1, name: /SOF-0301/ })).toBeVisible();
  await expect(page.getByText(t.cancelledNotice('SOF-0301'))).toHaveCount(0);
  await expect(button(page, t.actions.cancel)).toHaveCount(0);

  // ── Borrador: se anula sin número y sigue siendo del dueño ──────────────────────────────────
  await page.goto(`/solicitudes/${draftId}`);
  await expect(page.getByRole('heading', { level: 1, name: /Borrador por anular/ })).toBeVisible();
  const draftDialog = await openDialog(page, null);
  await draftDialog.getByLabel(dialogText.commentLabel).fill('Ya no se necesita');
  await draftDialog.getByRole('button', { name: dialogText.submit }).click();

  await expect(page.getByText(t.cancelledNotice(null))).toBeVisible();
  const draftSteps = page
    .getByRole('complementary', { name: t.timeline.title })
    .getByRole('listitem');
  await expect(draftSteps).toHaveCount(2);
  await expect(draftSteps.nth(1)).toContainText(t.timeline.steps.cancelled);
  await expect(draftSteps.nth(1)).toContainText('Ya no se necesita');
  await expect(page.getByRole('link', { name: t.actions.edit_draft })).toHaveCount(0);
  await expect(button(page, t.actions.cancel)).toHaveCount(0);
});

test('almacén ve lo anulado pero no anula; un borrador anulado ajeno sigue oculto', async ({
  page,
  accounts,
}) => {
  const admin = await accounts.create('single');
  const tenantId = admin.tenants[0]?.id ?? '';
  await accounts.addRequestCatalog(tenantId);
  const requester = await accounts.addMember(tenantId, ['requester']);
  const warehouse = await accounts.addMember(tenantId, ['warehouse']);
  const [sentId, cancelledId, cancelledDraftId] = await accounts.addRequests(tenantId, [
    { requesterId: requester.userId, status: 'in_approval', number: 'SOF-0401' },
    {
      requesterId: requester.userId,
      status: 'cancelled',
      number: 'SOF-0402',
      closedById: admin.userId,
      closeComment: 'Cambió el alcance de la obra',
    },
    {
      requesterId: requester.userId,
      status: 'cancelled',
      reason: 'Borrador anulado privado',
      closedById: requester.userId,
      closeComment: 'Nunca se envió',
    },
  ]);

  await signIn(page, warehouse, /\/bandeja$/);

  // No es el dueño ni tiene cancel_any: ve el SOF en aprobación sin «Anular».
  await page.goto(`/solicitudes/${sentId}`);
  await expect(page.getByRole('heading', { level: 1, name: /SOF-0401/ })).toBeVisible();
  await expect(page.getByRole('button', { name: t.actions.cancel })).toHaveCount(0);

  // Lo anulado y enviado se lee con su comentario y sin acciones de escritura.
  await page.goto(`/solicitudes/${cancelledId}`);
  await expect(page.getByRole('heading', { level: 1, name: /SOF-0402/ })).toBeVisible();
  await expect(page.locator('header').filter({ hasText: messages.status.cancelled })).toBeVisible();
  const last = page
    .getByRole('complementary', { name: t.timeline.title })
    .getByRole('listitem')
    .last();
  await expect(last).toContainText(t.timeline.steps.cancelled);
  await expect(last).toContainText('Cambió el alcance de la obra');
  await expect(page.getByRole('button', { name: t.actions.cancel })).toHaveCount(0);

  // El borrador anulado nunca se envió: sigue privado aunque tenga requests.read_all.
  await expectNotFound(page, `/solicitudes/${cancelledDraftId}`);
  await page.goto('/bandeja');
  await expect(page.getByText('SOF-0402')).toBeVisible();
  await expect(page.getByText('Borrador anulado privado')).toHaveCount(0);
});

test('el administrador anula un SOF aprobado ajeno', async ({ page, accounts }) => {
  const admin = await accounts.create('single');
  const tenantId = admin.tenants[0]?.id ?? '';
  await accounts.addRequestCatalog(tenantId);
  const requester = await accounts.addMember(tenantId, ['requester']);
  const [approvedId, otherDraftId] = await accounts.addRequests(tenantId, [
    {
      requesterId: requester.userId,
      status: 'approved',
      number: 'SOF-0501',
      reason: 'Reposición de pernos',
      lines: [{ productCode: 'PER-2', quantity: '3.000' }],
    },
    { requesterId: requester.userId, status: 'draft', reason: 'Borrador del solicitante' },
  ]);

  await signIn(page, admin, /\/bandeja$/);

  await page.goto(`/solicitudes/${approvedId}`);
  await expect(page.getByRole('heading', { level: 1, name: /SOF-0501/ })).toBeVisible();
  const dialog = await openDialog(page, 'SOF-0501');
  await dialog.getByLabel(dialogText.commentLabel).fill('Se canceló la obra');
  await dialog.getByRole('button', { name: dialogText.submit }).click();

  await expect(page.getByText(t.cancelledNotice('SOF-0501'))).toBeVisible();
  await expect(page.locator('header').filter({ hasText: messages.status.cancelled })).toBeVisible();
  const steps = page.getByRole('complementary', { name: t.timeline.title }).getByRole('listitem');
  await expect(steps.last()).toContainText(t.timeline.steps.cancelled);
  await expect(steps.last()).toContainText('E2E');
  await expect(steps.last()).toContainText('Se canceló la obra');
  await expect(button(page, t.actions.cancel)).toHaveCount(0);
  await expect(button(page, t.actions.deliver)).toHaveCount(0);

  // El borrador de otro no se ve ni siquiera para el administrador.
  await expectNotFound(page, `/solicitudes/${otherDraftId}`);
});

test('en solo lectura el botón Anular está deshabilitado', async ({ page, accounts }) => {
  const suspended = await accounts.create('suspended');
  const tenantId = suspended.tenants[0]?.id ?? '';
  await accounts.addRequestCatalog(tenantId);
  const [sentId] = await accounts.addRequests(tenantId, [
    { requesterId: suspended.userId, status: 'in_approval', number: 'SOF-0601' },
  ]);

  await signIn(page, suspended, /\/bandeja$/);

  await page.goto(`/solicitudes/${sentId}`);
  await expect(page.getByRole('heading', { level: 1, name: /SOF-0601/ })).toBeVisible();
  const cancel = button(page, t.actions.cancel);
  await expect(cancel).toBeDisabled();
  await cancel.click({ force: true });
  await expect(page.getByRole('dialog')).toHaveCount(0);
});
