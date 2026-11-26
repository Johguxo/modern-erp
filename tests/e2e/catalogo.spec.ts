// E2-H2 · Catálogo (productos, equipos y centros de costo) en escritorio y en celular (390×844):
// vacío, crear, código repetido, editar con el código de solo lectura, buscar (sin ver datos de
// otro tenant), desactivar con confirmación y filtrar por estado; un usuario sin catalog.manage
// no ve el ítem y recibe "no encontrada". Inicios de sesión por proyecto: admin 1, solicitante 1.
import { readFileSync } from 'node:fs';

import type { Locator, Page } from '@playwright/test';
import writeXlsxFile from 'write-excel-file/node';

import { messages } from '../../src/ui/messages/es-PE';

import { expect, signIn, test } from './fixtures/auth';

const t = messages.catalog;

/** El menú visible según el ancho: lateral en escritorio, panel en el celular. */
async function openMenu(page: Page) {
  const isMobile = (page.viewportSize()?.width ?? 1280) < 768;
  if (isMobile) {
    await page.getByRole('button', { name: messages.nav.openMenu }).click();
    return page.getByRole('dialog');
  }
  return page.locator('aside');
}

const rowOf = (page: Page, text: string) => page.getByRole('row').filter({ hasText: text });

/** design-tokens.md: botones de al menos 44 px de alto. */
async function expectTouchTarget(locator: Locator) {
  const box = await locator.boundingBox();
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
}

/** Sin scroll horizontal de la página (la tabla se desplaza dentro de su contenedor). */
async function expectNoPageOverflow(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

const notice = (page: Page, text: string) => page.getByRole('status').filter({ hasText: text });

test('el admin crea, edita, busca, desactiva y filtra en el catálogo', async ({
  page,
  accounts,
}) => {
  const admin = await accounts.create('single');
  const other = await accounts.create('single');
  await accounts.addProduct(other.tenants[0]?.id ?? '', 'AJ-1', 'Producto ajeno');
  await signIn(page, admin, /\/bandeja$/);

  // El ítem "Catálogo" lleva a Productos.
  let menu = await openMenu(page);
  await menu.getByRole('link', { name: messages.nav.catalog }).click();
  await expect(page).toHaveURL(/\/configuracion\/productos$/);
  await expect(page.getByRole('heading', { level: 1, name: t.products.title })).toBeVisible();

  // Vacío: crear e importar (habilitado desde E2-H3; el flujo completo está en su propia prueba).
  await expect(page.getByText(t.products.emptyTitle)).toBeVisible();
  await expect(page.getByRole('button', { name: t.import })).toBeEnabled();
  await expectNoPageOverflow(page);

  // Crear P-001 con precio "12.5": la moneda se propone (soles) y se muestra "S/ 12.50".
  const newProduct = page.getByRole('button', { name: t.products.new });
  await expectTouchTarget(newProduct);
  await newProduct.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByLabel(t.fields.currency, { exact: true })).toBeDisabled();
  await dialog.getByLabel(t.fields.code, { exact: true }).fill('P-001');
  await dialog.getByLabel(t.fields.name, { exact: true }).fill('Tubo PVC');
  await dialog.getByLabel(t.fields.unit, { exact: true }).fill('und');
  await dialog.getByLabel(t.fields.price, { exact: true }).fill('12.5');
  await expect(dialog.getByLabel(t.fields.currency, { exact: true })).toContainText(
    messages.admin.form.currencies.PEN,
  );
  await dialog.getByRole('button', { name: t.actions.save }).click();
  await expect(dialog).toBeHidden();
  await expect(notice(page, t.notices.created)).toBeVisible();
  await expect(rowOf(page, 'P-001')).toContainText(/S\/\s12\.50/);
  await expect(rowOf(page, 'P-001')).toContainText(messages.status.catalog_active);
  // El producto de otro tenant no aparece.
  await expect(page.getByText('AJ-1')).toHaveCount(0);
  for (const term of ['AJ', 'Producto ajeno']) {
    await page.getByLabel(t.search, { exact: true }).fill(term);
    await expect(page).toHaveURL(/q=/);
    await expect(page.getByText(t.noResultsTitle)).toBeVisible();
    await expect(page.getByText('AJ-1')).toHaveCount(0);
  }
  await page.getByLabel(t.search, { exact: true }).fill('');
  await expect(page).not.toHaveURL(/q=/);
  await expect(rowOf(page, 'P-001')).toBeVisible();

  // Código repetido: el error general del formulario, sin cerrar el diálogo.
  await page.getByRole('button', { name: t.products.new }).click();
  await dialog.getByLabel(t.fields.code, { exact: true }).fill('p-001');
  await dialog.getByLabel(t.fields.name, { exact: true }).fill('Otro tubo');
  await dialog.getByLabel(t.fields.unit, { exact: true }).fill('UND');
  await dialog.getByRole('button', { name: t.actions.save }).click();
  await expect(
    dialog
      .getByRole('alert')
      .filter({ hasText: messages.errors.reasons.code_taken({ code: 'P-001' }) }),
  ).toBeVisible();
  await dialog.getByRole('button', { name: t.actions.cancel }).click();
  await expect(dialog).toBeHidden();

  // Crear P-002 (sin precio).
  await page.getByRole('button', { name: t.products.new }).click();
  await dialog.getByLabel(t.fields.code, { exact: true }).fill('P-002');
  await dialog.getByLabel(t.fields.name, { exact: true }).fill('Cemento');
  await dialog.getByLabel(t.fields.unit, { exact: true }).fill('BOL');
  await dialog.getByRole('button', { name: t.actions.save }).click();
  await expect(dialog).toBeHidden();
  await expect(rowOf(page, 'P-002')).toBeVisible();

  // Editar P-001: el código es de solo lectura; el cambio se guarda.
  const edit = page.getByRole('button', { name: `${t.actions.edit} P-001` });
  await expectTouchTarget(edit);
  await edit.click();
  await expect(dialog.getByRole('heading', { name: t.products.editTitle('P-001') })).toBeVisible();
  await expect(dialog.getByLabel(t.fields.code, { exact: true })).toHaveAttribute('readonly', '');
  await dialog.getByLabel(t.fields.name, { exact: true }).fill('Tubo PVC grueso');
  await dialog.getByRole('button', { name: t.actions.save }).click();
  await expect(dialog).toBeHidden();
  await expect(notice(page, t.notices.updated)).toBeVisible();
  await expect(rowOf(page, 'P-001')).toContainText('Tubo PVC grueso');
  await expect(rowOf(page, 'P-001')).toContainText(/S\/\s12\.50/);

  // Buscar P-002 deja solo ese producto.
  await page.getByLabel(t.search, { exact: true }).fill('P-002');
  await expect(page).toHaveURL(/q=P-002/);
  await expect(rowOf(page, 'P-001')).toHaveCount(0);
  await expect(rowOf(page, 'P-002')).toBeVisible();

  // Desactivar con confirmación → "Inactivo".
  await page.getByRole('button', { name: `${t.actions.deactivate} P-002` }).click();
  await expect(dialog.getByRole('heading', { name: t.deactivateTitle('Cemento') })).toBeVisible();
  await dialog.getByRole('button', { name: t.deactivateConfirm }).click();
  await expect(dialog).toBeHidden();
  await expect(notice(page, t.notices.deactivated)).toBeVisible();
  await expect(rowOf(page, 'P-002')).toContainText(messages.status.catalog_inactive);

  // El filtro "Activos" lo oculta; "Inactivos" lo muestra con "Activar".
  await page.getByLabel(t.search, { exact: true }).fill('');
  await expect(rowOf(page, 'P-001')).toBeVisible();
  await page.getByLabel(t.statusFilter, { exact: true }).click();
  await page.getByRole('option', { name: t.statusOptions.active, exact: true }).click();
  await expect(page).toHaveURL(/status=active/);
  await expect(rowOf(page, 'P-002')).toHaveCount(0);
  await expect(rowOf(page, 'P-001')).toBeVisible();
  await page.getByLabel(t.statusFilter, { exact: true }).click();
  await page.getByRole('option', { name: t.statusOptions.inactive, exact: true }).click();
  await expect(page).toHaveURL(/status=inactive/);
  await expect(rowOf(page, 'P-001')).toHaveCount(0);
  await expect(rowOf(page, 'P-002').getByRole('button', { name: /Activar/ })).toBeVisible();
  await expectNoPageOverflow(page);

  // Equipos: pestaña activa, crear, importar habilitado.
  const tabs = page.getByRole('navigation', { name: t.sectionsLabel });
  await tabs.getByRole('link', { name: t.sections.equipment }).click();
  await expect(page).toHaveURL(/\/configuracion\/equipos$/);
  await expect(tabs.getByRole('link', { name: t.sections.equipment })).toHaveAttribute(
    'aria-current',
    'page',
  );
  menu = await openMenu(page);
  await expect(menu.getByRole('link', { name: messages.nav.catalog })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await page.keyboard.press('Escape');
  await expect(page.getByText(t.equipment.emptyTitle)).toBeVisible();
  await expect(page.getByRole('button', { name: t.import })).toBeEnabled();
  await page.getByRole('button', { name: t.equipment.new }).click();
  await dialog.getByLabel(t.fields.code, { exact: true }).fill('EQ-01');
  await dialog.getByLabel(t.fields.name, { exact: true }).fill('Grúa torre');
  await dialog.getByLabel(t.fields.type, { exact: true }).fill('Pesado');
  await dialog.getByRole('button', { name: t.actions.save }).click();
  await expect(dialog).toBeHidden();
  await expect(rowOf(page, 'EQ-01')).toContainText('Grúa torre');
  await expect(rowOf(page, 'EQ-01')).toContainText('Pesado');
  await expectNoPageOverflow(page);

  // Centros de costo: sin importar.
  await tabs.getByRole('link', { name: t.sections.costCenters }).click();
  await expect(page).toHaveURL(/\/configuracion\/centros-de-costo$/);
  await expect(page.getByText(t.costCenters.emptyTitle)).toBeVisible();
  await expect(page.getByRole('button', { name: t.import })).toHaveCount(0);
  await page.getByRole('button', { name: t.costCenters.new }).click();
  await dialog.getByLabel(t.fields.code, { exact: true }).fill('CC-01');
  await dialog.getByLabel(t.fields.name, { exact: true }).fill('Obra Norte');
  await dialog.getByRole('button', { name: t.actions.save }).click();
  await expect(dialog).toBeHidden();
  await expect(rowOf(page, 'CC-01')).toContainText('Obra Norte');
  await expectNoPageOverflow(page);
});

test('el admin importa productos desde un CSV: plantilla, vista previa con el error y resultado', async ({
  page,
  accounts,
}) => {
  const admin = await accounts.create('single');
  await signIn(page, admin, /\/bandeja$/);
  await page.goto('/configuracion/productos');
  await expect(page.getByText(t.products.emptyTitle)).toBeVisible();

  const imp = t.importer;
  await page.getByRole('button', { name: t.import }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: imp.title.products })).toBeVisible();
  await expectNoPageOverflow(page);

  // La plantilla se descarga como .xlsx.
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    dialog.getByRole('link', { name: imp.downloadTemplate }).click(),
  ]);
  expect(download.suggestedFilename()).toBe('plantilla-productos.xlsx');
  const templatePath = await download.path();
  expect(readFileSync(templatePath).subarray(0, 2).toString('latin1')).toBe('PK');

  // CSV de 3 filas con punto y coma: la fila 3 no tiene nombre.
  const csv = [
    'codigo;nombre;unidad;precio',
    'IMP-1;Tubo PVC;und;12.50',
    'IMP-2;;UND;',
    'IMP-3;Cemento;BOL;',
    '',
  ].join('\n');
  await expect(dialog.getByRole('button', { name: imp.review })).toBeDisabled();
  await dialog
    .getByLabel(imp.fileLabel)
    .setInputFiles({ name: 'productos.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
  await dialog.getByRole('button', { name: imp.review }).click();

  // Vista previa: totales y el error marcado en la fila 3 (texto del error, asociado a la celda).
  await expect(dialog.getByText(imp.previewTotals(3, 2, 1))).toBeVisible();
  const badRow = dialog.getByRole('row').filter({ hasText: 'IMP-2' });
  await expect(badRow.locator('[aria-describedby]')).toHaveCount(1);
  await expect(badRow).toContainText(`${imp.fields.name}: ${imp.rowReasons.required()}`);
  await expect(
    dialog.getByRole('listitem').filter({ hasText: `${imp.rowColumn} 3 (IMP-2)` }),
  ).toBeVisible();
  await expectNoPageOverflow(page);

  // Confirmar: el worker procesa y la página de resultado se actualiza sola.
  await dialog.getByRole('button', { name: imp.confirm }).click();
  await expect(page).toHaveURL(/\/configuracion\/importaciones\/[0-9a-f-]{36}$/);
  const card = (label: string) => page.locator('dl > div').filter({ hasText: label });
  await expect(card(imp.job.cards.created)).toContainText('2', { timeout: 30_000 });
  await expect(card(imp.job.cards.failed)).toContainText('1');
  await expect(card(imp.job.cards.updated)).toContainText('0');
  await expect(page.getByText(messages.status.import_completed)).toBeVisible();
  const errorRow = page.getByRole('row').filter({ hasText: 'IMP-2' });
  await expect(errorRow).toContainText('3');
  await expect(errorRow).toContainText(`${imp.fields.name}: ${imp.rowReasons.required()}`);
  await expectNoPageOverflow(page);

  // Los productos válidos están en la lista; el inválido no.
  await page.getByRole('link', { name: imp.job.back }).click();
  await expect(page).toHaveURL(/\/configuracion\/productos$/);
  await expect(rowOf(page, 'IMP-1')).toContainText('Tubo PVC');
  await expect(rowOf(page, 'IMP-1')).toContainText(/S\/\s12\.50/);
  await expect(rowOf(page, 'IMP-3')).toContainText('Cemento');
  await expect(rowOf(page, 'IMP-2')).toHaveCount(0);

  // Un archivo que no es .xlsx ni .csv se rechaza con un mensaje claro y no se importa nada.
  await page.getByRole('button', { name: t.import }).click();
  await dialog
    .getByLabel(imp.fileLabel)
    .setInputFiles({ name: 'notas.txt', mimeType: 'text/plain', buffer: Buffer.from('hola') });
  await dialog.getByRole('button', { name: imp.review }).click();
  await expect(
    dialog.getByRole('alert').filter({ hasText: messages.errors.reasons.file_unsupported() }),
  ).toBeVisible();
});

test('el admin importa productos desde un .xlsx: plantilla descargada, llenada y subida', async ({
  page,
  accounts,
}) => {
  const admin = await accounts.create('single');
  await signIn(page, admin, /\/bandeja$/);
  await page.goto('/configuracion/productos');
  await expect(page.getByText(t.products.emptyTitle)).toBeVisible();

  const imp = t.importer;
  await page.getByRole('button', { name: t.import }).click();
  const dialog = page.getByRole('dialog');

  // Se descarga la plantilla de productos (.xlsx).
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    dialog.getByRole('link', { name: imp.downloadTemplate }).click(),
  ]);
  expect(download.suggestedFilename()).toBe('plantilla-productos.xlsx');
  expect(
    readFileSync(await download.path())
      .subarray(0, 2)
      .toString('latin1'),
  ).toBe('PK');

  // Se "llena" con los mismos encabezados de la plantilla; el precio va como número de Excel.
  const header = ['Código *', 'Nombre *', 'Unidad *', 'Categoría', 'Precio referencial', 'Moneda'];
  const text = (value: string) => ({ value, type: String });
  const filled = await writeXlsxFile([
    {
      sheet: imp.template.sheets.products,
      data: [
        header.map(text),
        [
          text('XLS-1'),
          text('Tubería de acero'),
          text('und'),
          text('Plomería'),
          { value: 19.99, type: Number },
          text('PEN'),
        ],
        [text('XLS-2'), text('Cemento'), text('BOL'), null, null, null],
      ],
    },
  ]).toBuffer();
  await dialog.getByLabel(imp.fileLabel).setInputFiles({
    name: 'productos.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: Buffer.from(filled),
  });
  await dialog.getByRole('button', { name: imp.review }).click();

  // Vista previa: las 2 filas son válidas y se ven tal como se escribieron (precio exacto).
  await expect(dialog.getByText(imp.previewTotals(2, 2, 0))).toBeVisible();
  const first = dialog.getByRole('row').filter({ hasText: 'XLS-1' });
  await expect(first).toContainText('Tubería de acero');
  await expect(first).toContainText('19.99');
  await expect(dialog.getByRole('row').filter({ hasText: 'XLS-2' })).toContainText('Cemento');
  await expectNoPageOverflow(page);

  // Confirmar: el worker crea los 2 productos.
  await dialog.getByRole('button', { name: imp.confirm }).click();
  await expect(page).toHaveURL(/\/configuracion\/importaciones\/[0-9a-f-]{36}$/);
  const card = (label: string) => page.locator('dl > div').filter({ hasText: label });
  await expect(card(imp.job.cards.created)).toContainText('2', { timeout: 30_000 });
  await expect(card(imp.job.cards.failed)).toContainText('0');
});

test('un usuario sin catalog.manage no ve el ítem y recibe "no encontrada"', async ({
  page,
  accounts,
}) => {
  const admin = await accounts.create('single');
  const requester = await accounts.addMember(admin.tenants[0]?.id ?? '', ['requester']);
  await signIn(page, requester, /\/bandeja$/);

  const menu = await openMenu(page);
  await expect(menu.getByRole('link', { name: messages.nav.catalog })).toHaveCount(0);
  await page.keyboard.press('Escape');

  for (const [path, title] of [
    ['/configuracion/productos', t.products.title],
    ['/configuracion/equipos', t.equipment.title],
    ['/configuracion/centros-de-costo', t.costCenters.title],
  ] as const) {
    await page.goto(path);
    // Soft 404 conocido (como /configuracion/usuarios): el código HTTP es 200.
    await expect(page.getByText(messages.states.notFoundTitle)).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: title })).toHaveCount(0);
  }

  // La plantilla y la página de resultado de importación tampoco existen para él.
  const template = await page.request.get('/configuracion/productos/plantilla');
  expect(template.status()).toBe(404);
  const result = await page.goto(
    '/configuracion/importaciones/00000000-0000-4000-8000-000000000000',
  );
  expect(result?.status()).toBe(200);
  await expect(page.getByText(messages.states.notFoundTitle)).toBeVisible();
});

test('la búsqueda del catálogo conserva el foco y lo escrito aunque se pause entre teclas', async ({
  page,
  accounts,
}) => {
  const admin = await accounts.create('single');
  const tenantId = admin.tenants[0]?.id ?? '';
  await accounts.addProduct(tenantId, 'P-100', 'Tornillos');
  await accounts.addProduct(tenantId, 'P-200', 'Cinta');
  await signIn(page, admin, /\/bandeja$/);
  await page.goto('/configuracion/productos');
  await expect(rowOf(page, 'P-100')).toBeVisible();
  await expect(rowOf(page, 'P-200')).toBeVisible();

  const search = page.getByLabel(t.search, { exact: true });
  await search.click();
  await search.pressSequentially('Torni');
  await page.waitForTimeout(600); // > debounce: el servidor responde mientras se sigue escribiendo
  await expect(page).toHaveURL(/q=Torni/);
  await expect(search).toBeFocused();
  await search.pressSequentially('llos');
  await expect(page).toHaveURL(/q=Tornillos/);
  await expect(search).toBeFocused();
  await expect(search).toHaveValue('Tornillos');
  await expect(rowOf(page, 'P-100')).toBeVisible();
  await expect(rowOf(page, 'P-200')).toHaveCount(0);
});
