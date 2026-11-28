// E3-H4 · Detalle del SOF (pantalla 3), en escritorio y en celular (390×844): cabecera, ítems,
// documento, línea de tiempo, botones según estado y permisos, aviso de envío y 404.
// Inicios de sesión por proyecto: prueba 1 → 1, prueba 2 → 1.
import type { Page } from '@playwright/test';

import { messages } from '../../src/ui/messages/es-PE';

import { expect, signIn, test } from './fixtures/auth';

const t = messages.requests.detail;
const EDIT_URL = /\/solicitudes\/[0-9a-f-]{36}\/editar$/;

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
  await expect(page.getByRole('heading', { level: 1, name: /SOF-/ })).toHaveCount(0);
}

const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true });

test('el solicitante ve el detalle de su SOF, del borrador y del aprobado, y los 404', async ({
  page,
  accounts,
}) => {
  const admin = await accounts.create('single');
  const tenantId = admin.tenants[0]?.id ?? '';
  await accounts.addRequestCatalog(tenantId);
  const requester = await accounts.addMember(tenantId, ['requester']);
  const other = await accounts.addMember(tenantId, ['requester']);
  const now = Date.now();
  const [sentId, approvedId, draftId, otherDraftId, otherSentId] = await accounts.addRequests(
    tenantId,
    [
      {
        requesterId: requester.userId,
        status: 'in_approval',
        number: 'SOF-0101',
        reason: 'Mantenimiento de 500 horas',
        equipmentCode: 'EQ-1',
        totalAmount: '35.00',
        updatedAt: new Date(now - 1000),
        lines: [
          { productCode: 'FIL-1', quantity: '2.000', equipmentCode: 'EQ-1' },
          { productCode: 'PER-2', quantity: '3.000' },
        ],
      },
      {
        requesterId: requester.userId,
        status: 'approved',
        number: 'SOF-0102',
        reason: 'Reposición de pernos',
        totalAmount: '10.00',
        updatedAt: new Date(now - 2000),
        lines: [{ productCode: 'PER-2', quantity: '3.000' }],
      },
      {
        requesterId: requester.userId,
        status: 'draft',
        reason: 'Borrador propio',
        totalAmount: '25.00',
        updatedAt: new Date(now - 3000),
        lines: [{ productCode: 'FIL-1', quantity: '2.000' }],
      },
      { requesterId: other.userId, status: 'draft', reason: 'Borrador de otro' },
      { requesterId: other.userId, status: 'in_approval', number: 'SOF-0103' },
    ],
  );
  // Otra empresa: su SOF no se ve desde esta.
  const foreign = await accounts.create('single');
  const foreignTenant = foreign.tenants[0]?.id ?? '';
  await accounts.addRequestCatalog(foreignTenant);
  const [foreignId] = await accounts.addRequests(foreignTenant, [
    { requesterId: foreign.userId, status: 'in_approval', number: 'SOF-0001' },
  ]);

  await signIn(page, requester, /\/bandeja$/);

  // ── SOF en aprobación, recién enviado (?enviado=1) ───────────────────────────────────────────
  await page.goto(`/solicitudes/${sentId}?enviado=1`);
  const title = t.title('SOF-0101', 'Mantenimiento de 500 horas');
  await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
  await expect(page.getByText(t.submittedNotice('SOF-0101'))).toBeVisible();

  // Migas con la página actual marcada, subtítulo y estado.
  const crumbs = page.getByRole('navigation', { name: t.breadcrumbLabel });
  await expect(crumbs.getByRole('link', { name: t.breadcrumbInbox })).toHaveAttribute(
    'href',
    '/bandeja',
  );
  await expect(crumbs.locator('[aria-current="page"]')).toHaveText('SOF-0101');
  const header = page.locator('header').filter({ has: page.getByRole('heading', { level: 1 }) });
  await expect(header).toContainText('E2E');
  await expect(header).toContainText('EQ-1 · Grúa');
  await expect(header).toContainText('Obra norte');
  await expect(header).toContainText(/Total S\/\s?35\.00/);
  await expect(header).toContainText(messages.status.in_approval);

  // Ítems: 6 columnas, solo líneas activas, cantidad con su unidad y total estimado.
  const items = page.getByRole('region', { name: t.items.title });
  const columns = t.items.columns;
  await expect(items.getByRole('columnheader')).toHaveText([
    columns.number,
    columns.code,
    columns.description,
    columns.equipment,
    columns.quantity,
    columns.subtotal,
  ]);
  const rows = items.locator('tbody tr');
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText('FIL-1');
  await expect(rows.nth(0)).toContainText('Filtro de aceite');
  await expect(rows.nth(0)).toContainText('EQ-1 · Grúa');
  await expect(rows.nth(0)).toContainText('2 UND');
  await expect(rows.nth(0)).toContainText(/25\.00/);
  await expect(rows.nth(1)).toContainText('PER-2');
  await expect(rows.nth(1)).toContainText(t.noValue);
  await expect(rows.nth(1)).toContainText(/10\.00/);
  await expect(items).toContainText(t.items.total);
  await expect(items).toContainText(/35\.00/);

  // Documento: PDF aún no disponible.
  const doc = page.getByRole('region', { name: t.document.title });
  await expect(doc).toContainText('SOF-0101.pdf');
  await expect(doc).toContainText(t.document.hint);
  await expect(doc.getByRole('button', { name: t.actions.download_pdf })).toBeDisabled();

  // Línea de tiempo: 4 pasos con su estado en texto y la aprobación pendiente.
  const timeline = page.getByRole('complementary', { name: t.timeline.title });
  const steps = timeline.getByRole('listitem');
  await expect(steps).toHaveCount(4);
  await expect(steps.nth(0)).toContainText(t.timeline.steps.created);
  await expect(steps.nth(0)).toContainText(t.timeline.states.done);
  await expect(steps.nth(0)).toContainText('E2E');
  await expect(steps.nth(0).locator('time')).toHaveCount(1);
  await expect(steps.nth(1)).toContainText(t.timeline.steps.submitted);
  await expect(steps.nth(2)).toContainText(t.timeline.steps.approval);
  await expect(steps.nth(2)).toContainText(t.timeline.states.pending);
  await expect(steps.nth(3)).toContainText(t.timeline.steps.delivery);
  await expect(steps.nth(3)).toContainText(t.timeline.states.upcoming);

  // Botones: el dueño puede anular (abre el diálogo, E3-H5); nadie decide ni corrige.
  const cancel = button(page, t.actions.cancel);
  await expect(cancel).toBeEnabled();
  expect((await cancel.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
  await expect(page.getByText(t.actions.soon)).toHaveCount(1);
  for (const absent of [
    'approve',
    'request_changes',
    'reject',
    'correct_line',
    'deliver',
  ] as const) {
    await expect(page.getByRole('button', { name: t.actions[absent] })).toHaveCount(0);
  }
  await expect(page.getByRole('link', { name: t.actions.edit_draft })).toHaveCount(0);
  await expectNoPageOverflow(page);

  // Sin ?enviado=1 no hay aviso.
  await page.goto(`/solicitudes/${sentId}`);
  await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
  await expect(page.getByText(t.submittedNotice('SOF-0101'))).toHaveCount(0);

  // ── SOF aprobado: solo descargar el PDF; el dueño ya no anula ───────────────────────────────
  await page.goto(`/solicitudes/${approvedId}`);
  await expect(
    page.getByRole('heading', { level: 1, name: t.title('SOF-0102', 'Reposición de pernos') }),
  ).toBeVisible();
  await expect(page.locator('header').filter({ hasText: messages.status.approved })).toBeVisible();
  const approvedTimeline = page.getByRole('complementary', { name: t.timeline.title });
  await expect(approvedTimeline.getByRole('listitem').nth(2)).toContainText(
    t.timeline.steps.approved,
  );
  await expect(page.getByRole('button', { name: t.actions.cancel })).toHaveCount(0);
  // El PDF aún no está conectado: sigue deshabilitado y apunta a la nota única.
  const pdf = page.getByRole('button', { name: t.actions.download_pdf });
  await expect(pdf).toBeDisabled();
  await expect(pdf).toHaveAttribute('aria-describedby', 'detail-soon-note');
  await expect(page.getByText(t.actions.soon)).toHaveCount(1);

  // ── Borrador propio: «Editar borrador» funciona y abre el editor ────────────────────────────
  await page.goto(`/solicitudes/${draftId}`);
  await expect(
    page.getByRole('heading', { level: 1, name: t.title(null, 'Borrador propio') }),
  ).toBeVisible();
  await expect(page.getByRole('region', { name: t.document.title })).toContainText('Borrador.pdf');
  await expect(
    page.getByRole('complementary', { name: t.timeline.title }).getByRole('listitem'),
  ).toHaveCount(3);
  await expect(button(page, t.actions.cancel)).toBeEnabled();
  await expectNoPageOverflow(page);
  await page.getByRole('link', { name: t.actions.edit_draft }).click();
  await expect(page).toHaveURL(EDIT_URL);

  // ── 404: borrador de otro, SOF de otro solicitante, otra empresa y uuid inválido ───────────
  await expectNotFound(page, `/solicitudes/${otherDraftId}`);
  await expectNotFound(page, `/solicitudes/${otherSentId}`);
  await expectNotFound(page, `/solicitudes/${foreignId}`);
  await expectNotFound(page, '/solicitudes/no-es-un-uuid');
  await expectNotFound(page, '/solicitudes/00000000-0000-4000-8000-000000000000');
});

test('almacén ve sus botones deshabilitados, lee lo enviado y no ve borradores ajenos', async ({
  page,
  accounts,
}) => {
  const admin = await accounts.create('single');
  const tenantId = admin.tenants[0]?.id ?? '';
  await accounts.addRequestCatalog(tenantId);
  const requester = await accounts.addMember(tenantId, ['requester']);
  const warehouse = await accounts.addMember(tenantId, ['warehouse']);
  const [sentId, approvedId, draftId] = await accounts.addRequests(tenantId, [
    {
      requesterId: requester.userId,
      status: 'in_approval',
      number: 'SOF-0201',
      lines: [{ productCode: 'FIL-1', quantity: '1.000', equipmentCode: 'EQ-2' }],
    },
    {
      requesterId: requester.userId,
      status: 'approved',
      number: 'SOF-0202',
      lines: [{ productCode: 'PER-2', quantity: '1.000' }],
    },
    { requesterId: requester.userId, status: 'draft', reason: 'Borrador del solicitante' },
  ]);

  await signIn(page, warehouse, /\/bandeja$/);

  // En aprobación: puede corregir una línea (E4-H4); no decide (sin motor) ni anula.
  await page.goto(`/solicitudes/${sentId}`);
  await expect(page.getByRole('heading', { level: 1, name: /SOF-0201/ })).toBeVisible();
  const items = page.getByRole('region', { name: t.items.title });
  await expect(items.getByRole('button', { name: t.actions.correct_line })).toBeEnabled();
  await expect(items.locator('tbody tr')).toHaveCount(1);
  await expect(items).toContainText('EQ-2 · Montacargas');
  await expect(page.getByRole('button', { name: t.actions.cancel })).toHaveCount(0);
  await expect(page.getByRole('button', { name: t.actions.approve })).toHaveCount(0);
  await expect(page.getByRole('button', { name: t.actions.deliver })).toHaveCount(0);

  // Aprobado: puede registrar la entrega (deshabilitado) con la nota única.
  await page.goto(`/solicitudes/${approvedId}`);
  await expect(page.getByRole('heading', { level: 1, name: /SOF-0202/ })).toBeVisible();
  const deliver = button(page, t.actions.deliver);
  await expect(deliver).toBeDisabled();
  expect((await deliver.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
  await expect(page.getByText(t.actions.soon)).toHaveCount(1);
  await expect(page.getByRole('button', { name: t.actions.correct_line })).toBeEnabled();
  await expect(page.getByRole('button', { name: t.actions.cancel })).toHaveCount(0);
  await expect(page.getByRole('link', { name: t.actions.edit_draft })).toHaveCount(0);
  await expectNoPageOverflow(page);

  // El borrador del solicitante no se ve aunque tenga requests.read_all.
  await expectNotFound(page, `/solicitudes/${draftId}`);
});
