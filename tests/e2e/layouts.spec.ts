// E0-H4 · Layouts (app), (auth) y admin, estados globales y fuentes, en escritorio y en celular.
import { expect, test } from '@playwright/test';

import { messages } from '../../src/ui/messages/es-PE';

const isMobile = (projectName: string) => projectName === 'mobile';

test.describe('Layout (app) con el menú lateral responsive', () => {
  test('/ redirige a /bandeja', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/bandeja$/);
  });

  test('/bandeja muestra el título de la bandeja como h1', async ({ page }) => {
    await page.goto('/bandeja');
    await expect(page.getByRole('heading', { level: 1, name: messages.inbox.title })).toBeVisible();
    await expect(page.getByText(messages.inbox.emptyTitle)).toBeVisible();
  });

  test('en escritorio, el menú principal es visible y marca la Bandeja como página actual', async ({
    page,
  }, testInfo) => {
    test.skip(isMobile(testInfo.project.name), 'Solo escritorio');
    await page.goto('/bandeja');

    const nav = page.getByRole('navigation', { name: messages.nav.mainLabel });
    await expect(nav).toBeVisible();
    await expect(nav.getByRole('link', { name: messages.nav.inbox })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await expect(page.getByRole('button', { name: messages.nav.openMenu })).toBeHidden();
  });

  test('en el celular, el menú lateral se oculta y el botón Abrir menú (≥44 px) abre un panel con la Bandeja', async ({
    page,
  }, testInfo) => {
    test.skip(!isMobile(testInfo.project.name), 'Solo celular');
    await page.goto('/bandeja');

    await expect(page.getByRole('navigation', { name: messages.nav.mainLabel })).toBeHidden();

    const openMenu = page.getByRole('button', { name: messages.nav.openMenu });
    await expect(openMenu).toBeVisible();
    const box = await openMenu.boundingBox();
    expect(box?.width).toBeGreaterThanOrEqual(44);
    expect(box?.height).toBeGreaterThanOrEqual(44);

    await openMenu.click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    const inboxLink = dialog.getByRole('link', { name: messages.nav.inbox });
    await expect(inboxLink).toBeVisible();
    await expect(inboxLink).toHaveAttribute('aria-current', 'page');

    // Al navegar desde el panel, este se cierra.
    await inboxLink.click();
    await expect(dialog).toBeHidden();
  });

  test('no hay desplazamiento horizontal en la bandeja', async ({ page }) => {
    await page.goto('/bandeja');
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
});

test.describe('Layout (auth)', () => {
  test('/login muestra Iniciar sesión y no tiene el menú principal', async ({ page }) => {
    await page.goto('/login');
    await expect(
      page.getByRole('heading', { level: 1, name: messages.auth.signInTitle }),
    ).toBeVisible();
    await expect(page.getByRole('navigation', { name: messages.nav.mainLabel })).toHaveCount(0);
    await expect(page.getByRole('button', { name: messages.nav.openMenu })).toHaveCount(0);
  });
});

test.describe('Layout admin', () => {
  test('/admin muestra la franja Consola LinkUs', async ({ page }) => {
    await page.goto('/admin');
    await expect(page.getByText(messages.admin.consoleBanner)).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: messages.admin.title })).toBeVisible();
  });
});

test.describe('Estados globales', () => {
  test('una ruta inexistente muestra la página no encontrada en es-PE', async ({ page }) => {
    const response = await page.goto('/ruta-que-no-existe');
    expect(response?.status()).toBe(404);
    await expect(page.getByText(messages.states.notFoundTitle)).toBeVisible();
    await expect(page.getByRole('link', { name: messages.states.backToInbox })).toHaveAttribute(
      'href',
      '/bandeja',
    );
  });
});

test.describe('Documento y fuentes', () => {
  test('el html declara lang="es-PE"', async ({ page }) => {
    await page.goto('/bandeja');
    await expect(page.locator('html')).toHaveAttribute('lang', 'es-PE');
  });

  test('el h1 usa Space Grotesk (next/font)', async ({ page }) => {
    await page.goto('/bandeja');
    const h1 = page.getByRole('heading', { level: 1, name: messages.inbox.title });
    await expect(h1).toHaveCSS('font-family', /space/i);
  });
});
