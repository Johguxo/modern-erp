// E3-H2 · Nuevo SOF y borradores, en escritorio y en celular (390×844): el solicitante arma la
// solicitud con el catálogo, ve el total en vivo, guarda (la URL pasa a /editar), recarga, edita y
// la envía (SOF-0001 «En aprobación»; el envío ya no se puede editar); enviar sin completar muestra
// los errores; un aprobador no ve el ítem ni la pantalla y nadie edita borradores ajenos.
// Inicios de sesión por proyecto: prueba 1 → 1, prueba 2 → 1, prueba 3 → 3.
import type { Locator, Page } from '@playwright/test';

import { messages } from '../../src/ui/messages/es-PE';

import { expect, signIn, test, type Account, type Accounts } from './fixtures/auth';

const t = messages.requests;
const EDIT_URL = /\/solicitudes\/[0-9a-f-]{36}\/editar$/;
const DETAIL_URL = /\/solicitudes\/[0-9a-f-]{36}$/;

/** El menú visible según el ancho: lateral en escritorio, panel en el celular. */
async function openMenu(page: Page) {
  const isMobile = (page.viewportSize()?.width ?? 1280) < 768;
  if (isMobile) {
    await page.getByRole('button', { name: messages.nav.openMenu }).click();
    return page.getByRole('dialog');
  }
  return page.locator('aside');
}

/** design-tokens.md: controles de al menos 44 px de alto (48 px la acción principal). */
async function expectMinHeight(locator: Locator, min: number) {
  const box = await locator.boundingBox();
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(min);
}

/** Sin scroll horizontal de la página. */
async function expectNoPageOverflow(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

const addButton = (page: Page, code: string, name: string) =>
  page.getByRole('button', { name: t.catalog.addItem(code, name) });
const quantityOf = (page: Page, code: string) => page.getByLabel(t.items.quantityOf(code));
const total = (page: Page) => page.locator('output');

/** Una empresa con catálogo y un solicitante. */
async function setup(accounts: Accounts) {
  const admin = await accounts.create('single');
  const tenantId = admin.tenants[0]?.id ?? '';
  await accounts.addRequestCatalog(tenantId);
  const requester = await accounts.addMember(tenantId, ['requester']);
  return { admin, tenantId, requester };
}

test('el solicitante arma, guarda, edita y envía un SOF', async ({ page, accounts }) => {
  const { requester } = await setup(accounts);
  await signIn(page, requester, /\/bandeja$/);

  // El ítem del menú y el botón de la bandeja llevan al editor.
  await expect(page.getByRole('link', { name: messages.inbox.newRequest })).toBeVisible();
  const menu = await openMenu(page);
  await menu.getByRole('link', { name: messages.nav.newRequest }).click();
  await expect(page).toHaveURL(/\/solicitudes\/nueva$/);
  await expect(page.getByRole('heading', { level: 1, name: t.title })).toBeVisible();

  // Estructura del prototipo: datos generales, catálogo, ítems y ruta de aprobación.
  await expect(page.getByRole('region', { name: t.general.title })).toBeVisible();
  await expect(page.getByRole('heading', { name: t.catalog.title })).toBeVisible();
  await expect(page.getByRole('heading', { name: t.items.title })).toBeVisible();
  const route = page.getByRole('complementary', { name: t.route.title });
  await expect(route).toBeVisible();
  await expect(route).toContainText(t.route.requester(requester.email));
  await expect(route).toContainText('Almacén');
  await expect(route).toContainText('Gerencia local');
  await expect(route).toContainText(t.route.notice);
  await expect(page.getByLabel(t.general.requester)).toHaveValue(requester.email);
  await expectMinHeight(page.getByRole('button', { name: t.actions.submit }), 48);
  await expectMinHeight(page.getByRole('button', { name: t.actions.saveDraft }), 44);
  await expectMinHeight(page.getByLabel(t.catalog.search), 44);

  // El catálogo muestra los primeros productos y la búsqueda filtra.
  await expect(addButton(page, 'FIL-1', 'Filtro de aceite')).toBeVisible();
  await expect(addButton(page, 'SIN-3', 'Producto sin precio')).toBeVisible();
  await page.getByLabel(t.catalog.search).fill('perno');
  await expect(addButton(page, 'PER-2', 'Perno')).toBeVisible();
  await expect(addButton(page, 'FIL-1', 'Filtro de aceite')).toHaveCount(0);
  await page.getByLabel(t.catalog.search).fill('zzz-no-existe');
  await expect(page.getByText(t.catalog.empty)).toBeVisible();
  await page.getByLabel(t.catalog.search).fill('');
  await expect(addButton(page, 'FIL-1', 'Filtro de aceite')).toBeVisible();

  // Agregar un producto que ya está suma 1; el total se actualiza en vivo.
  await expect(page.getByText(t.items.empty)).toBeVisible();
  await expect(total(page)).toContainText('0.00');
  await addButton(page, 'FIL-1', 'Filtro de aceite').click();
  await addButton(page, 'FIL-1', 'Filtro de aceite').click();
  await expect(quantityOf(page, 'FIL-1')).toHaveValue('2');
  await expect(total(page)).toContainText('25.00');
  await addButton(page, 'PER-2', 'Perno').click();
  await quantityOf(page, 'PER-2').fill('3');
  await expect(total(page)).toContainText('35.00'); // 2 × 12.50 + 3 × 3.3333 = 25.00 + 10.00
  await expectMinHeight(quantityOf(page, 'FIL-1'), 44);
  await expectMinHeight(page.getByRole('button', { name: t.items.removeItem('FIL-1') }), 44);

  // Un producto sin precio cuenta como 0; quitarlo deja el total igual.
  await addButton(page, 'SIN-3', 'Producto sin precio').click();
  await expect(quantityOf(page, 'SIN-3')).toBeVisible();
  await expect(total(page)).toContainText('35.00');
  await page.getByRole('button', { name: t.items.removeItem('SIN-3') }).click();
  await expect(quantityOf(page, 'SIN-3')).toHaveCount(0);
  await expect(total(page)).toContainText('35.00');

  // Una cantidad inválida no suma y se marca al guardar.
  await quantityOf(page, 'PER-2').fill('abc');
  await expect(total(page)).toContainText('25.00');
  await page.getByRole('button', { name: t.actions.saveDraft }).click();
  await expect(page.getByText(messages.errors.reasons.quantity_invalid())).toBeVisible();
  await expect(page).toHaveURL(/\/solicitudes\/nueva$/);
  await quantityOf(page, 'PER-2').fill('3');
  await expect(page.getByText(messages.errors.reasons.quantity_invalid())).toHaveCount(0);

  // Equipo de la línea, centro de costo y motivo.
  await page.getByLabel(t.items.equipmentOf('FIL-1')).selectOption({ label: 'EQ-2 · Montacargas' });
  await page.getByLabel(t.general.costCenter).selectOption({ label: 'CC-1 · Obra norte' });
  await page.getByLabel(t.general.reason).fill('Mantenimiento de 500 horas');
  await expectNoPageOverflow(page);

  // Guardar: aviso, y la URL pasa a /editar sin perder lo escrito.
  await page.getByRole('button', { name: t.actions.saveDraft }).click();
  await expect(page.getByRole('status').filter({ hasText: t.notices.saved })).toBeVisible();
  await expect(page).toHaveURL(EDIT_URL);
  await expect(quantityOf(page, 'FIL-1')).toHaveValue('2');
  await expect(total(page)).toContainText('35.00');

  // Recargar trae el borrador guardado.
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: t.title })).toBeVisible();
  await expect(page.getByLabel(t.general.reason)).toHaveValue('Mantenimiento de 500 horas');
  await expect(page.getByLabel(t.general.costCenter).locator('option:checked')).toHaveText(
    'CC-1 · Obra norte',
  );
  await expect(quantityOf(page, 'FIL-1')).toHaveValue('2');
  await expect(quantityOf(page, 'PER-2')).toHaveValue('3');
  await expect(page.getByLabel(t.items.equipmentOf('FIL-1')).locator('option:checked')).toHaveText(
    'EQ-2 · Montacargas',
  );
  await expect(total(page)).toContainText('35.00');

  // Editar el borrador guardado y volver a guardar (bloqueo optimista con la versión nueva).
  await quantityOf(page, 'FIL-1').fill('3');
  await expect(total(page)).toContainText('47.50'); // 3 × 12.50 + 10.00
  await page.getByRole('button', { name: t.actions.saveDraft }).click();
  await expect(page.getByRole('status').filter({ hasText: t.notices.saved })).toBeVisible();
  await page.getByRole('button', { name: t.actions.saveDraft }).click();
  await expect(page.getByRole('status').filter({ hasText: t.notices.saved })).toBeVisible();
  const draftUrl = page.url();

  // Enviar: guarda, numera y lleva al detalle provisional.
  await page.getByRole('button', { name: t.actions.submit }).click();
  await expect(page).toHaveURL(DETAIL_URL);
  await expect(
    page.getByRole('heading', { level: 1, name: t.detail.title('SOF-0001') }),
  ).toBeVisible();
  await expect(page.getByText(messages.status.in_approval)).toBeVisible();
  await expect(page.getByText('47.50').first()).toBeVisible();

  // Un SOF enviado ya no se edita: la pantalla de edición no existe.
  await page.goto(draftUrl);
  await expect(page.getByText(messages.states.notFoundTitle)).toBeVisible();
});

test('enviar sin completar muestra los errores y no sale del editor', async ({
  page,
  accounts,
}) => {
  const { requester } = await setup(accounts);
  await signIn(page, requester, /\/bandeja$/);
  await page.goto('/solicitudes/nueva');
  await expect(page.getByRole('heading', { level: 1, name: t.title })).toBeVisible();

  await page.getByRole('button', { name: t.actions.submit }).click();
  await expect(page.getByText(t.validation.costCenterRequired)).toBeVisible();
  await expect(page.getByText(t.validation.reasonRequired)).toBeVisible();
  await expect(page.getByText(t.validation.linesRequired)).toBeVisible();
  await expect(page).toHaveURL(/\/solicitudes\/nueva$/);

  // Corregir un campo limpia solo su error.
  await page.getByLabel(t.general.reason).fill('Reposición');
  await expect(page.getByText(t.validation.reasonRequired)).toHaveCount(0);
  await expect(page.getByText(t.validation.costCenterRequired)).toBeVisible();

  // Con ítems, el centro de costo y el motivo se puede enviar.
  await page.getByLabel(t.general.costCenter).selectOption({ label: 'CC-1 · Obra norte' });
  await addButton(page, 'FIL-1', 'Filtro de aceite').click();
  await expect(page.getByText(t.validation.linesRequired)).toHaveCount(0);
  await page.getByRole('button', { name: t.actions.submit }).click();
  await expect(page).toHaveURL(DETAIL_URL);
  await expect(
    page.getByRole('heading', { level: 1, name: t.detail.title('SOF-0001') }),
  ).toBeVisible();
  await expectNoPageOverflow(page);
});

test('un aprobador no ve el editor y nadie edita el borrador de otro', async ({
  page,
  browser,
  accounts,
}) => {
  const { tenantId, requester } = await setup(accounts);
  const approver = await accounts.addMember(tenantId, ['approver']);
  const otherRequester = await accounts.addMember(tenantId, ['requester']);

  // El solicitante guarda un borrador (vacío: también es válido).
  await signIn(page, requester, /\/bandeja$/);
  await page.goto('/solicitudes/nueva');
  await page.getByLabel(t.general.reason).fill('Borrador propio');
  await page.getByRole('button', { name: t.actions.saveDraft }).click();
  await expect(page).toHaveURL(EDIT_URL);
  const draftPath = new URL(page.url()).pathname;
  const detailPath = draftPath.replace(/\/editar$/, '');

  async function visitAs(account: Account, paths: readonly string[]) {
    const context = await browser.newContext({
      viewport: page.viewportSize(),
      isMobile: (page.viewportSize()?.width ?? 1280) < 768,
      hasTouch: (page.viewportSize()?.width ?? 1280) < 768,
    });
    const other = await context.newPage();
    try {
      await signIn(other, account, /\/bandeja$/);
      const menu = await openMenu(other);
      const hasItem = await menu.getByRole('link', { name: messages.nav.newRequest }).count();
      const results: boolean[] = [];
      for (const path of paths) {
        await other.goto(path);
        results.push(await other.getByText(messages.states.notFoundTitle).isVisible());
      }
      return { hasItem: hasItem > 0, notFound: results };
    } finally {
      await context.close();
    }
  }

  // Aprobador: sin ítem de menú, y ni el editor nuevo ni el borrador ajeno existen para él.
  const asApprover = await visitAs(approver, ['/solicitudes/nueva', draftPath, detailPath]);
  expect(asApprover.hasItem).toBe(false);
  expect(asApprover.notFound).toEqual([true, true, true]);

  // Otro solicitante: tiene el ítem, pero el borrador ajeno es "no encontrado" (no 403).
  const asOther = await visitAs(otherRequester, [draftPath, detailPath]);
  expect(asOther.hasItem).toBe(true);
  expect(asOther.notFound).toEqual([true, true]);

  // El dueño sí lo abre.
  await page.goto(draftPath);
  await expect(page.getByLabel(t.general.reason)).toHaveValue('Borrador propio');
  // Una ruta con un id que no es uuid también es "no encontrada".
  await page.goto('/solicitudes/no-es-un-uuid/editar');
  await expect(page.getByText(messages.states.notFoundTitle)).toBeVisible();
});
