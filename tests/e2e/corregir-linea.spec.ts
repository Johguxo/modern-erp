// E4-H4 · Corregir una línea sin reiniciar, en escritorio y en celular (390×844).
// - Cambiar el equipo de la línea 3 (GEN-046 a GEN-045): el monto no cambia, las firmas se
//   mantienen y el estado sigue igual.
// - Subir la cantidad en un SOF aprobado: vuelve a «En aprobación» con la «Reconfirmación»
//   pendiente; la gerencia reconfirma y queda «Aprobada».
// Inicios de sesión por proyecto: 8 (3 la primera prueba, 5 la segunda).
import type { Page } from '@playwright/test';

import { messages } from '../../src/ui/messages/es-PE';

import { expect, signIn, test, type Account, type Accounts } from './fixtures/auth';

const t = messages.requests.detail;
const dialogText = t.correctLine;

const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true });
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

interface World {
  readonly requester: Account;
  readonly warehouse: Account;
  readonly manager: Account;
  readonly draftId: string;
}

/** Empresa con el catálogo, los tres roles de la ruta estándar y un borrador de tres líneas. */
async function seedWorld(accounts: Accounts): Promise<World> {
  const admin = await accounts.create('single');
  const tenantId = admin.tenants[0]?.id ?? '';
  await accounts.addRequestCatalog(tenantId);
  await accounts.addEquipment(tenantId, 'GEN-045', 'Generador 45');
  await accounts.addEquipment(tenantId, 'GEN-046', 'Generador 46');
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
        { productCode: 'FIL-1', quantity: '1.000', equipmentCode: 'GEN-046' },
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

async function openDetail(page: Page, world: World) {
  await page.goto(`/solicitudes/${world.draftId}`);
  await expect(page.getByRole('heading', { level: 1, name: /SOF-0001/ })).toBeVisible();
}

/** Abre «Corregir una línea» y comprueba que el diálogo cabe en la pantalla. */
async function openCorrectDialog(page: Page) {
  await button(page, t.actions.correct_line).click();
  const dialog = page.getByRole('dialog', { name: dialogText.title('SOF-0001') });
  await expect(dialog).toBeVisible();
  const overflow = await dialog.evaluate((node) => node.scrollWidth - node.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  return dialog;
}

/** Aprueba el paso pendiente del usuario actual desde el detalle. */
async function approve(page: Page) {
  await button(page, t.actions.approve).click();
  const dialog = page.getByRole('dialog', { name: t.decision.approve.title('SOF-0001') });
  await dialog.getByRole('button', { name: t.decision.approve.submit, exact: true }).click();
  await expect(dialog).toBeHidden();
}

test('cambiar el equipo de una línea mantiene las firmas y resalta esa fila', async ({
  page,
  accounts,
}) => {
  test.slow();
  const world = await seedWorld(accounts);
  await sendDraft(page, world);

  // Almacén aprueba su paso y después corrige: la gerencia sigue pendiente.
  await switchTo(page, world.warehouse);
  await openDetail(page, world);
  await approve(page);
  await expect(statusBadge(page, messages.status.in_approval)).toBeVisible();

  const dialog = await openCorrectDialog(page);

  // Sin motivo no se guarda.
  await dialog.getByRole('button', { name: dialogText.submit.update, exact: true }).click();
  await expect(
    dialog.getByText(messages.errors.reasons.correction_reason_required()),
  ).toBeVisible();

  // Línea 3: del GEN-046 al GEN-045, con motivo.
  const lineOption = dialogText.lineOption(3, 'FIL-1', 'Filtro de aceite');
  await dialog
    .getByLabel(dialogText.lineLabel, { exact: true })
    .selectOption({ label: lineOption });
  await dialog
    .getByLabel(dialogText.equipmentLabel, { exact: true })
    .selectOption({ label: 'GEN-045 · Generador 45' });
  await dialog.getByLabel(dialogText.reasonLabel).fill('El equipo estaba mal cargado');
  await dialog.getByRole('button', { name: dialogText.submit.update, exact: true }).click();

  await expect(page).toHaveURL(/\?corregido=1$/);
  await expect(page.getByText(dialogText.savedNotice('SOF-0001'))).toBeVisible();

  // Aviso naranja: el equipo cambió y las firmas se mantienen.
  const notice = page.getByText(`${t.correction.headline(3, world.warehouse.fullName)}`);
  await expect(notice).toBeVisible();
  const noticeBox = notice.locator('..');
  await expect(noticeBox).toContainText('Se cambió el equipo de GEN-046 a GEN-045.');
  await expect(noticeBox).toContainText(t.correction.signaturesKept);
  await expect(noticeBox).not.toContainText(t.correction.reconfirmation);

  // La fila de la línea 3 va resaltada y es la única.
  const highlighted = page.locator('tr[data-highlighted="true"]');
  await expect(highlighted).toHaveCount(1);
  await expect(highlighted).toContainText('GEN-045 · Generador 45');

  // El estado no cambia y en la línea de tiempo queda «Línea 3 corregida» con su motivo.
  await expect(statusBadge(page, messages.status.in_approval)).toBeVisible();
  const corrected = timeline(page)
    .getByRole('listitem')
    .filter({ hasText: t.timeline.lineCorrected(3) });
  await expect(corrected).toContainText(world.warehouse.fullName);
  await expect(corrected).toContainText('El equipo estaba mal cargado');
  await expect(corrected.locator('time')).toBeVisible();
  await expect(timeline(page)).not.toContainText('Reconfirmación pedida');
  await expectNoPageOverflow(page);
});

test('subir la cantidad en un SOF aprobado pide reconfirmación y la gerencia la aprueba', async ({
  page,
  accounts,
}) => {
  // Flujo largo: cinco inicios de sesión y dos rondas de aprobación.
  test.slow();
  const world = await seedWorld(accounts);
  await sendDraft(page, world);

  await switchTo(page, world.warehouse);
  await openDetail(page, world);
  await approve(page);

  await switchTo(page, world.manager);
  await openDetail(page, world);
  await approve(page);
  await expect(statusBadge(page, messages.status.approved)).toBeVisible();

  // Almacén sube la cantidad de la línea 1 (2 a 5): el monto sube y hay que reconfirmar.
  await switchTo(page, world.warehouse);
  await openDetail(page, world);
  await expect(statusBadge(page, messages.status.approved)).toBeVisible();
  const dialog = await openCorrectDialog(page);
  await dialog.getByRole('textbox', { name: dialogText.quantityLabel, exact: true }).fill('5');
  await dialog.getByLabel(dialogText.reasonLabel).fill('Faltaban filtros para la obra');
  await dialog.getByRole('button', { name: dialogText.submit.update, exact: true }).click();

  await expect(page).toHaveURL(/\?corregido=1$/);
  // Vuelve a «En aprobación» con el paso «Reconfirmación» pendiente.
  await expect(statusBadge(page, messages.status.in_approval)).toBeVisible();
  const noticeBox = page
    .getByText(t.correction.headline(1, world.warehouse.fullName))
    .locator('..');
  await expect(noticeBox).toContainText(t.correction.reconfirmation);
  await expect(page.locator('tr[data-highlighted="true"]')).toHaveCount(1);
  const pending = timeline(page).getByRole('listitem').filter({ hasText: 'Reconfirmación' });
  await expect(pending.filter({ hasText: t.timeline.states.pending })).toContainText(
    world.manager.fullName,
  );
  await expect(timeline(page)).toContainText(t.timeline.lineCorrected(1));
  await expect(timeline(page)).toContainText('Faltaban filtros para la obra');
  await expect(timeline(page)).toContainText('Reconfirmación pedida · línea 1');
  await expectNoPageOverflow(page);

  // La gerencia reconfirma y el SOF queda aprobado otra vez, sin resaltar nada.
  await switchTo(page, world.manager);
  await openDetail(page, world);
  await approve(page);
  await expect(statusBadge(page, messages.status.approved)).toBeVisible();
  await expect(page.locator('tr[data-highlighted="true"]')).toHaveCount(0);
  await expect(page.getByText(t.correction.reconfirmed)).toBeVisible();
  await expectNoPageOverflow(page);
});
