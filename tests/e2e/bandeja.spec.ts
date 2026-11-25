// E3-H3 · Bandeja de solicitudes, en escritorio y en celular (390×844): saludo, tarjetas, pestañas,
// búsqueda, tabla de 7 columnas, navegación (detalle y /editar), visibilidad entre solicitantes y
// aprobador, paginación del servidor (30 filas), vacío y solo lectura.
// Inicios de sesión por proyecto: prueba 1 → 1, 2 → 2, 3 → 1, 4 → 2.
import type { Locator, Page } from '@playwright/test';

import { messages } from '../../src/ui/messages/es-PE';

import { expect, signIn, test } from './fixtures/auth';

const t = messages.inbox;
const EDIT_URL = /\/solicitudes\/[0-9a-f-]{36}\/editar$/;
const DETAIL_URL = /\/solicitudes\/[0-9a-f-]{36}$/;

const rowsOf = (page: Page): Locator => page.locator('tbody tr');
const rowWith = (page: Page, text: string): Locator => rowsOf(page).filter({ hasText: text });

/** Sin scroll horizontal de la página. */
async function expectNoPageOverflow(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

test('la bandeja muestra resumen, pestañas, búsqueda y navega al detalle y al editor', async ({
  page,
  accounts,
}) => {
  const admin = await accounts.create('single');
  const tenantId = admin.tenants[0]?.id ?? '';
  await accounts.addRequestCatalog(tenantId);
  const requester = await accounts.addMember(tenantId, ['requester']);
  const other = await accounts.addMember(tenantId, ['requester']);
  const now = Date.now();
  await accounts.addRequests(tenantId, [
    {
      requesterId: requester.userId,
      status: 'draft',
      reason: 'Borrador de prueba',
      updatedAt: new Date(now - 1000),
    },
    {
      requesterId: requester.userId,
      status: 'in_approval',
      number: 'SOF-0101',
      equipmentCode: 'EQ-1',
      totalAmount: '1860.50',
      updatedAt: new Date(now - 2000),
    },
    {
      requesterId: requester.userId,
      status: 'approved',
      number: 'SOF-0103',
      reason: 'Reposición de pernos',
      updatedAt: new Date(now - 3000),
    },
    // De otro solicitante: no se ve.
    { requesterId: other.userId, status: 'in_approval', number: 'SOF-0102' },
  ]);

  await signIn(page, requester, /\/bandeja$/);

  // Encabezado fiel al prototipo: saludo, título y botón de nueva solicitud (44 px).
  await expect(page.getByRole('heading', { level: 1, name: t.title })).toBeVisible();
  await expect(page.getByText(t.greeting('E2E'))).toBeVisible();
  const newRequest = page.getByRole('link', { name: t.newRequest });
  await expect(newRequest).toHaveAttribute('href', '/solicitudes/nueva');
  expect((await newRequest.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);

  // Tres tarjetas: 0 esperan mi aprobación, 1 en aprobación, 1 aprobada esta semana.
  const summary = page.getByRole('region', { name: t.summaryLabel });
  await expect(summary).toBeVisible();
  for (const [label, value] of [
    [t.cards.awaitingMe, '0'],
    [t.cards.inApproval, '1'],
    [t.cards.approvedThisWeek, '1'],
  ] as const) {
    const card = summary.locator('div').filter({ hasText: label }).first();
    await expect(card).toContainText(value);
  }

  // Pestañas tipo píldora de 44 px, «Todas» activa; «Más» con las otras dos.
  const tabs = page.getByRole('navigation', { name: t.tabsLabel });
  for (const tab of ['all', 'awaiting_me', 'in_approval', 'approved'] as const) {
    const link = tabs.getByRole('link', { name: t.tabs[tab], exact: true });
    await expect(link).toBeVisible();
    expect((await link.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
  }
  await expect(tabs.getByRole('link', { name: t.tabs.all })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await expect(tabs.getByRole('button', { name: t.more })).toBeVisible();

  // Tabla de 7 columnas y tres filas (la de otro solicitante no aparece).
  const headers = page.getByRole('columnheader');
  await expect(headers).toHaveText([
    t.columns.number,
    t.columns.type,
    t.columns.requester,
    t.columns.area,
    t.columns.amount,
    t.columns.status,
    t.columns.updated,
  ]);
  await expect(rowsOf(page)).toHaveCount(3);
  await expect(page.getByText('SOF-0102')).toHaveCount(0);
  const sent = rowWith(page, 'SOF-0101');
  await expect(sent).toContainText('SOF');
  await expect(sent).toContainText('EQ-1 · Grúa');
  await expect(sent).toContainText(/1,860\.50/);
  await expect(sent).toContainText(messages.status.in_approval);
  await expect(sent.locator('time')).toHaveCount(1);
  const draftRow = rowWith(page, t.draftNumber);
  await expect(draftRow).toContainText(messages.status.draft);
  // Sin equipo, el área es el centro de costo.
  await expect(draftRow).toContainText('Obra norte');
  await expect(rowWith(page, 'SOF-0103')).toContainText(messages.status.approved);
  await expectNoPageOverflow(page);

  // En el celular la tabla se desplaza dentro de su tarjeta, no la página.
  const container = page.locator('[data-slot="table-container"]');
  const scrolls = await container.evaluate((el) => el.scrollWidth - el.clientWidth);
  if ((page.viewportSize()?.width ?? 1280) < 768) expect(scrolls).toBeGreaterThan(0);

  // Pestañas por estado: «Aprobadas» solo muestra la aprobada.
  await tabs.getByRole('link', { name: t.tabs.approved }).click();
  await expect(page).toHaveURL(/\/bandeja\?tab=approved$/);
  await expect(rowsOf(page)).toHaveCount(1);
  await expect(rowWith(page, 'SOF-0103')).toBeVisible();
  await expect(tabs.getByRole('link', { name: t.tabs.approved })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await tabs.getByRole('link', { name: t.tabs.awaiting_me }).click();
  await expect(page).toHaveURL(/tab=awaiting_me/);
  await expect(page.getByText(t.noResultsTitle)).toBeVisible();

  // «Más → Borradores».
  await tabs.getByRole('button', { name: t.more }).click();
  await page.getByRole('menuitem', { name: t.tabs.draft }).click();
  await expect(page).toHaveURL(/tab=draft/);
  await expect(rowsOf(page)).toHaveCount(1);
  await expect(rowWith(page, t.draftNumber)).toBeVisible();

  // Búsqueda por número y por motivo; vuelve a «Todas» al limpiar la pestaña.
  await tabs.getByRole('link', { name: t.tabs.all }).click();
  await expect(page).toHaveURL(/\/bandeja$/);
  await expect(rowsOf(page)).toHaveCount(3);
  const search = page.getByLabel(t.search);
  await search.fill('SOF-0101');
  await expect(page).toHaveURL(/q=SOF-0101/);
  await expect(rowsOf(page)).toHaveCount(1);
  await expect(rowWith(page, 'SOF-0101')).toBeVisible();
  await search.fill('pernos');
  await expect(page).toHaveURL(/q=pernos/);
  await expect(rowsOf(page)).toHaveCount(1);
  await expect(rowWith(page, 'SOF-0103')).toBeVisible();
  await search.fill('zzz-no-existe');
  await expect(page.getByText(t.noResultsTitle)).toBeVisible();
  await search.fill('');
  await expect(rowsOf(page)).toHaveCount(3);

  // Navegación: el N° de un enviado abre el detalle; el de un borrador propio, el editor.
  await page.getByRole('link', { name: 'SOF-0101' }).click();
  await expect(page).toHaveURL(DETAIL_URL);
  await expect(
    page.getByRole('heading', { level: 1, name: messages.requests.detail.title('SOF-0101') }),
  ).toBeVisible();
  await page.goBack();
  await expect(rowsOf(page)).toHaveCount(3);
  await page.getByRole('link', { name: t.draftNumber }).click();
  await expect(page).toHaveURL(EDIT_URL);
});

test('cada quien ve lo suyo y el aprobador con requests.read_all ve lo enviado, sin borradores', async ({
  page,
  browser,
  accounts,
}) => {
  const admin = await accounts.create('single');
  const tenantId = admin.tenants[0]?.id ?? '';
  await accounts.addRequestCatalog(tenantId);
  const ana = await accounts.addMember(tenantId, ['requester']);
  const luis = await accounts.addMember(tenantId, ['requester']);
  const approver = await accounts.addMember(tenantId, ['approver']);
  await accounts.addRequests(tenantId, [
    { requesterId: ana.userId, status: 'in_approval', number: 'SOF-0201' },
    { requesterId: ana.userId, status: 'draft', reason: 'Borrador de Ana' },
    { requesterId: luis.userId, status: 'in_approval', number: 'SOF-0202' },
    { requesterId: luis.userId, status: 'rejected', number: 'SOF-0203' },
  ]);

  // Ana: su enviada y su borrador; nada de Luis.
  await signIn(page, ana, /\/bandeja$/);
  await expect(rowsOf(page)).toHaveCount(2);
  await expect(rowWith(page, 'SOF-0201')).toBeVisible();
  await expect(rowWith(page, t.draftNumber)).toBeVisible();
  await expect(page.getByText('SOF-0202')).toHaveCount(0);

  // El aprobador (requests.read_all, sin «Nueva solicitud»): lo enviado de ambos, sin el borrador.
  const isMobile = (page.viewportSize()?.width ?? 1280) < 768;
  const context = await browser.newContext({
    viewport: page.viewportSize(),
    isMobile,
    hasTouch: isMobile,
  });
  const second = await context.newPage();
  try {
    await signIn(second, approver, /\/bandeja$/);
    await expect(rowsOf(second)).toHaveCount(3);
    for (const number of ['SOF-0201', 'SOF-0202', 'SOF-0203']) {
      await expect(rowWith(second, number)).toBeVisible();
    }
    await expect(second.getByText(t.draftNumber)).toHaveCount(0);
    await expect(second.getByRole('link', { name: t.newRequest })).toHaveCount(0);
    // «Rechazadas» vive en «Más».
    const tabs = second.getByRole('navigation', { name: t.tabsLabel });
    await tabs.getByRole('button', { name: t.more }).click();
    await second.getByRole('menuitem', { name: t.tabs.rejected }).click();
    await expect(second).toHaveURL(/tab=rejected/);
    await expect(rowsOf(second)).toHaveCount(1);
    await expect(rowWith(second, 'SOF-0203')).toContainText(messages.status.rejected);
    // Su detalle abre; el borrador de Ana sigue siendo «no encontrado» para él.
    await second.getByRole('link', { name: 'SOF-0203' }).click();
    await expect(second).toHaveURL(DETAIL_URL);
  } finally {
    await context.close();
  }
});

test('la paginación del servidor muestra 25 filas por página y lleva a la última si se pasa', async ({
  page,
  accounts,
}) => {
  const admin = await accounts.create('single');
  const tenantId = admin.tenants[0]?.id ?? '';
  await accounts.addRequestCatalog(tenantId);
  const requester = await accounts.addMember(tenantId, ['requester']);
  const base = Date.now() - 60 * 60 * 1000;
  await accounts.addRequests(
    tenantId,
    Array.from({ length: 30 }, (_, index) => ({
      requesterId: requester.userId,
      status: 'in_approval' as const,
      number: `SOF-${String(index + 1).padStart(4, '0')}`,
      updatedAt: new Date(base + index * 1000),
    })),
  );

  await signIn(page, requester, /\/bandeja$/);
  await expect(rowsOf(page)).toHaveCount(25);
  // La más reciente primero.
  await expect(rowsOf(page).first()).toContainText('SOF-0030');
  await expect(page.getByText(messages.dataTable.page(1, 2))).toBeVisible();
  await expect(page.getByRole('link', { name: messages.dataTable.previous })).toHaveCount(0);

  await page.getByRole('link', { name: messages.dataTable.next }).click();
  await expect(page).toHaveURL(/page=2/);
  await expect(page.getByText(messages.dataTable.page(2, 2))).toBeVisible();
  await expect(rowsOf(page)).toHaveCount(5);
  await expect(rowsOf(page).first()).toContainText('SOF-0005');
  await expect(page.getByRole('link', { name: messages.dataTable.next })).toHaveCount(0);

  // La búsqueda conserva el resultado y vuelve a la página 1.
  await page.getByLabel(t.search).fill('SOF-001');
  await expect(page).toHaveURL(/q=SOF-001/);
  await expect(page).not.toHaveURL(/page=/);
  await expect(rowsOf(page)).toHaveCount(10);

  // Una página fuera de rango redirige a la última, conservando la búsqueda.
  await page.goto('/bandeja?page=9');
  await expect(page).toHaveURL(/page=2/);
  await expect(page.getByText(messages.dataTable.page(2, 2))).toBeVisible();
  await expect(rowsOf(page)).toHaveCount(5);
  await expectNoPageOverflow(page);
});

test('sin solicitudes muestra el vacío; en solo lectura los botones quedan deshabilitados', async ({
  page,
  browser,
  accounts,
}) => {
  const admin = await accounts.create('single');
  await signIn(page, admin, /\/bandeja$/);
  await expect(page.getByText(t.emptyTitle)).toBeVisible();
  await expect(page.getByText(t.greeting('E2E'))).toBeVisible();
  await expect(page.getByRole('table')).toHaveCount(0);
  await page.getByRole('link', { name: t.emptyAction }).click();
  await expect(page).toHaveURL(/\/solicitudes\/nueva$/);

  // Empresa suspendida: banner, y «+ Nueva solicitud» y «Crear la primera» sin acción.
  const suspended = await accounts.create('suspended');
  const isMobile = (page.viewportSize()?.width ?? 1280) < 768;
  const context = await browser.newContext({
    viewport: page.viewportSize(),
    isMobile,
    hasTouch: isMobile,
  });
  const second = await context.newPage();
  try {
    await signIn(second, suspended, /\/bandeja$/);
    await expect(second.getByText(t.emptyTitle)).toBeVisible();
    await expect(second.getByRole('button', { name: t.newRequest })).toBeDisabled();
    await expect(second.getByRole('button', { name: t.emptyAction })).toBeDisabled();
    await expect(second.getByRole('link', { name: t.newRequest })).toHaveCount(0);
    await expectNoPageOverflow(second);
  } finally {
    await context.close();
  }
});
