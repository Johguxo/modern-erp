import { expect, test } from '@playwright/test';

import { messages } from '../../src/ui/messages/es-PE';

test('la página inicial carga en español (es-PE)', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: messages.home.title })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'es-PE');
});
