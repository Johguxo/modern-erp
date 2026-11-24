// E1-H5 · Configuración de la empresa, en escritorio y en celular (390×844): el admin cambia el
// nombre visible, el color y la moneda, sube un logo (y un SVG es rechazado) y la marca aparece en
// el menú lateral; un usuario sin settings.manage recibe 404 y no ve el ítem. Requiere el bucket
// brand-assets en Supabase local (pnpm exec supabase seed buckets).
// Inicios de sesión por proyecto: admin 1, solicitante 1.
import { randomUUID } from 'node:crypto';

import type { Page } from '@playwright/test';

import { messages } from '../../src/ui/messages/es-PE';

import { expect, signIn, test } from './fixtures/auth';

const t = messages.company;

/** PNG válido de 1×1 px. */
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

/** El menú visible según el ancho: lateral en escritorio, panel en el celular. */
async function openMenu(page: Page) {
  const isMobile = (page.viewportSize()?.width ?? 1280) < 768;
  if (isMobile) {
    await page.getByRole('button', { name: messages.nav.openMenu }).click();
    return page.getByRole('dialog');
  }
  return page.locator('aside');
}

test('el admin configura nombre, color, moneda y logo → la marca aparece en el menú', async ({
  page,
  accounts,
}) => {
  const admin = await accounts.create('single');
  const name = `Marca ${randomUUID().slice(0, 6)}`;
  await signIn(page, admin, /\/bandeja$/);

  await page.goto('/configuracion/empresa');
  await expect(page.getByRole('heading', { level: 1, name: t.title })).toBeVisible();

  await page.getByLabel(t.displayName).fill(name);
  await page.getByRole('textbox', { name: t.primaryColor }).fill('#7a1f1f');
  await page.getByLabel(t.currency).click();
  await page.getByRole('option', { name: messages.admin.form.currencies.USD }).click();
  await page.getByRole('button', { name: t.save }).click();
  await expect(page.getByRole('status').filter({ hasText: t.notices.saved })).toBeVisible();

  // Tras recargar, los valores siguen guardados.
  await page.reload();
  await expect(page.getByLabel(t.displayName)).toHaveValue(name);
  await expect(page.getByRole('textbox', { name: t.primaryColor })).toHaveValue('#7A1F1F');
  await expect(page.getByLabel(t.currency)).toContainText(messages.admin.form.currencies.USD);

  // Sin logo: iniciales sobre el color; el ítem activo lleva el acento del cliente.
  let menu = await openMenu(page);
  await expect(menu.getByTestId('tenant-brand')).toContainText(name);
  await expect(menu.getByTestId('tenant-monogram')).toBeVisible();
  const accent = await menu
    .getByRole('link', { name: messages.nav.company })
    .evaluate((el) => getComputedStyle(el, '::before').backgroundColor);
  expect(accent).toBe('rgb(122, 31, 31)');
  await page.keyboard.press('Escape');

  // Un SVG se rechaza antes de enviarlo.
  const fileInput = page.getByLabel(t.logoChoose);
  await fileInput.setInputFiles({
    name: 'logo.svg',
    mimeType: 'image/svg+xml',
    buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'),
  });
  await page.getByRole('button', { name: t.logoUpload }).click();
  await expect(page.getByText(messages.errors.reasons.logo_invalid_type())).toBeVisible();

  // Un PNG se sube y aparece en el menú.
  await fileInput.setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: PNG_1X1 });
  await page.getByRole('button', { name: t.logoUpload }).click();
  await expect(page.getByRole('status').filter({ hasText: t.notices.logoUploaded })).toBeVisible();

  menu = await openMenu(page);
  const logo = menu.getByTestId('tenant-brand').locator('img');
  await expect(logo).toBeVisible();
  await expect
    .poll(() => logo.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth))
    .toBeGreaterThan(0);
  await expect(menu.getByTestId('tenant-monogram')).toHaveCount(0);

  // Sin scroll horizontal (también a 390 px).
  await page.keyboard.press('Escape');
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ),
  ).toBeLessThanOrEqual(0);
});

test('un usuario sin settings.manage no ve el ítem y recibe "no encontrada"', async ({
  page,
  accounts,
}) => {
  const admin = await accounts.create('single');
  const tenantId = admin.tenants[0]?.id ?? '';
  const requester = await accounts.addMember(tenantId, ['requester']);
  await signIn(page, requester, /\/bandeja$/);

  const menu = await openMenu(page);
  await expect(menu.getByRole('link', { name: messages.nav.company })).toHaveCount(0);
  await page.keyboard.press('Escape');

  await page.goto('/configuracion/empresa');
  // Página de "no encontrada" sin nada de la configuración. Soft 404 conocido (igual que
  // /configuracion/usuarios): con el loading.tsx de (app) el código HTTP es 200.
  await expect(page.getByText(messages.states.notFoundTitle)).toBeVisible();
  await expect(page.getByRole('heading', { level: 1, name: t.title })).toHaveCount(0);
  await expect(page.getByLabel(t.displayName)).toHaveCount(0);
});
