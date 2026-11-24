// E1-H2 · Login con correo y contraseña, en escritorio y en celular (390×844). Cuentas creadas con
// la fixture `accounts` (Supabase Auth local + filas de la base) y borradas al terminar.
//
// Límites de Supabase local (supabase/config.toml): 30 inicios de sesión cada 5 min por IP y 2
// correos por hora. Por eso cada prueba inicia sesión una sola vez y la recuperación completa por
// Mailpit corre solo en escritorio.
import type { Page } from '@playwright/test';

import { messages } from '../../src/ui/messages/es-PE';

import { expect, signIn, signInThroughUi, test } from './fixtures/auth';

const isMobile = (projectName: string) => projectName === 'mobile';
const MAILPIT = 'http://127.0.0.1:54324';

/** En el celular, el bloque de cuenta vive en el panel del menú. */
async function openAccount(page: Page, projectName: string) {
  if (isMobile(projectName)) {
    await page.getByRole('button', { name: messages.nav.openMenu }).click();
    return page.getByRole('dialog');
  }
  return page.getByRole('navigation', { name: messages.nav.mainLabel }).locator('..');
}

const invalidCredentials = messages.errors.reasons.invalid_credentials();

test.describe('sin sesión', () => {
  test('proxy protege (app): /bandeja redirige a /login', async ({ page }) => {
    await page.goto('/bandeja');
    await expect(page).toHaveURL(/\/login$/);
    await expect(
      page.getByRole('heading', { level: 1, name: messages.auth.signInTitle }),
    ).toBeVisible();
  });

  test('proxy protege admin: /admin redirige a /login', async ({ page }) => {
    await page.goto('/admin');
    await expect(page).toHaveURL(/\/login$/);
  });

  test('/api/v1/* no redirige a /login (sin ruta aún: 404; route() respondería 401 JSON)', async ({
    request,
  }) => {
    const response = await request.get('/api/v1/x', { maxRedirects: 0 });
    expect(response.status()).not.toBe(307);
    expect(response.status()).not.toBe(308);
    expect(response.headers()['location']).toBeUndefined();
    expect([401, 404]).toContain(response.status());
  });
});

test.describe('iniciar sesión', () => {
  test('login correcto con 1 empresa entra directo a /bandeja con el correo y el menú', async ({
    page,
    accounts,
  }, testInfo) => {
    const account = await accounts.create('single');

    await signIn(page, account, /\/bandeja$/);

    await expect(page.getByRole('heading', { level: 1, name: messages.inbox.title })).toBeVisible();
    const accountBlock = await openAccount(page, testInfo.project.name);
    await expect(accountBlock.getByText(account.email)).toBeVisible();
    await expect(accountBlock.getByRole('link', { name: messages.nav.inbox })).toBeVisible();
    // La cookie de empresa activa es httpOnly, sameSite lax y firmada para este tenant.
    const cookie = (await page.context().cookies()).find((c) => c.name === 'active_tenant');
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.sameSite).toBe('Lax');
    expect(cookie?.value).toMatch(new RegExp(`^v1\\.${account.tenants[0]?.id}\\.`));
  });

  test('contraseña errónea → "Correo o contraseña incorrectos." y sigue en /login', async ({
    page,
    accounts,
  }) => {
    const account = await accounts.create('single');

    await signInThroughUi(page, account.email, 'contraseña-equivocada');

    await expect(page.getByRole('alert').filter({ hasText: invalidCredentials })).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);
  });

  test('mensajes en español sin revelar si el correo existe: un correo inexistente muestra el mismo mensaje', async ({
    page,
  }) => {
    await signInThroughUi(page, `nadie-${Date.now()}@test.linkus.pe`, 'cualquier-clave');

    await expect(page.getByRole('alert').filter({ hasText: invalidCredentials })).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);
  });

  test('correo vacío → "Este campo es obligatorio."', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel(messages.auth.password).fill('algo');
    await page.getByRole('button', { name: messages.auth.signInSubmit }).click();

    await expect(page.getByText(messages.validation.required)).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);
  });

  test('si tiene varias empresas, va a /elegir-empresa y al elegir entra a /bandeja', async ({
    page,
    accounts,
  }) => {
    const account = await accounts.create('multi');
    const [first, second] = account.tenants;

    await signIn(page, account, /\/elegir-empresa$/);

    await expect(
      page.getByRole('heading', { level: 1, name: messages.auth.chooseTenantTitle }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: first?.name })).toBeVisible();
    await page.getByRole('button', { name: second?.name }).click();
    await expect(page).toHaveURL(/\/bandeja$/);
    const cookie = (await page.context().cookies()).find((c) => c.name === 'active_tenant');
    expect(cookie?.value).toMatch(new RegExp(`^v1\\.${second?.id}\\.`));
  });

  test('si tiene 0 empresas y es SuperAdmin, va a /admin/clientes (Consola LinkUs)', async ({
    page,
    accounts,
  }) => {
    const account = await accounts.create('superadmin');

    await signIn(page, account, /\/admin\/clientes$/);

    await expect(page.getByText(messages.admin.consoleBanner)).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: messages.admin.title })).toBeVisible();
  });

  test('un usuario con empresa pero sin SuperAdmin no accede a /admin (404)', async ({
    page,
    accounts,
  }) => {
    const account = await accounts.create('single');
    await signIn(page, account, /\/bandeja$/);

    const response = await page.goto('/admin');

    expect(response?.status()).toBe(404);
    await expect(page.getByText(messages.admin.consoleBanner)).toHaveCount(0);
  });

  test('si no tiene empresas ni es SuperAdmin → /login con "Tu cuenta no tiene acceso a ninguna empresa" y sin sesión', async ({
    page,
    accounts,
  }) => {
    const account = await accounts.create('no_access');

    await signInThroughUi(page, account.email, account.password);

    await expect(page).toHaveURL(/\/login\?error=sin-acceso$/);
    await expect(page.getByText(messages.auth.noAccess)).toBeVisible();
    // La sesión se cerró: la app vuelve a pedir el login.
    await page.goto('/bandeja');
    await expect(page).toHaveURL(/\/login$/);
  });

  test('modo solo lectura: con la empresa suspendida entra y ve el aviso arriba', async ({
    page,
    accounts,
  }) => {
    const account = await accounts.create('suspended');

    await signIn(page, account, /\/bandeja$/);

    await expect(
      page.getByRole('status').filter({ hasText: messages.readOnly.banner }),
    ).toBeVisible();
  });

  test('aislamiento: con sesión en A, una cookie active_tenant con el tenant B no entra a B; /login lleva al destino', async ({
    page,
    accounts,
  }) => {
    const account = await accounts.create('single');
    const other = await accounts.create('single');
    const [tenantA] = account.tenants;
    const [tenantB] = other.tenants;
    await signIn(page, account, /\/bandeja$/);
    // Una empresa activa no muestra el aviso de solo lectura.
    await expect(page.getByText(messages.readOnly.banner)).toHaveCount(0);

    // Con sesión, /login lleva al destino del usuario.
    await page.goto('/login');
    await expect(page).toHaveURL(/\/bandeja$/);

    // Cookie manipulada con el tenant B (firma original): se descarta y /auth/continuar la rehace.
    const context = page.context();
    const cookie = (await context.cookies()).find((c) => c.name === 'active_tenant');
    if (!cookie || !tenantA || !tenantB) throw new Error('faltan datos de la prueba');
    await context.addCookies([{ ...cookie, value: cookie.value.replace(tenantA.id, tenantB.id) }]);
    await page.goto('/bandeja');

    await expect(page).toHaveURL(/\/bandeja$/);
    const restored = (await context.cookies()).find((c) => c.name === 'active_tenant');
    expect(restored?.value).toMatch(new RegExp(`^v1\\.${tenantA.id}\\.`));
  });
});

test.describe('cerrar sesión', () => {
  test('cierre de sesión: vuelve a /login y /bandeja vuelve a pedir el login', async ({
    page,
    accounts,
  }, testInfo) => {
    const account = await accounts.create('single');
    await signIn(page, account, /\/bandeja$/);

    const accountBlock = await openAccount(page, testInfo.project.name);
    await accountBlock.getByRole('button', { name: messages.auth.signOut }).click();

    await expect(page).toHaveURL(/\/login$/);
    const cookies = await page.context().cookies();
    expect(cookies.find((c) => c.name === 'active_tenant')).toBeUndefined();
    expect(cookies.filter((c) => c.name.startsWith('sb-'))).toEqual([]);
    await page.goto('/bandeja');
    await expect(page).toHaveURL(/\/login$/);
  });
});

test.describe('recuperar contraseña', () => {
  test('con un correo inexistente muestra el aviso genérico (no revela si existe)', async ({
    page,
  }) => {
    await page.goto('/recuperar');
    await page.getByLabel(messages.auth.email).fill(`nadie-${Date.now()}@test.linkus.pe`);
    await page.getByRole('button', { name: messages.auth.recoverSubmit }).click();

    await expect(
      page.getByRole('status').filter({ hasText: messages.auth.recoverSent }),
    ).toBeVisible();
  });

  test('/restablecer sin token muestra el aviso de abrir el enlace del correo', async ({
    page,
  }) => {
    await page.goto('/restablecer');

    await expect(page.getByText(messages.auth.resetMissingToken)).toBeVisible();
  });

  test('/restablecer con un token inválido muestra "El enlace venció o ya se usó."', async ({
    page,
  }) => {
    await page.goto('/restablecer?token_hash=token-que-no-existe');
    await page.getByLabel(messages.auth.password).fill('una-clave-muy-larga');
    await page.getByRole('button', { name: messages.auth.resetSubmit }).click();

    await expect(
      page.getByRole('alert').filter({ hasText: messages.errors.reasons.reset_link_invalid() }),
    ).toBeVisible();
  });

  test('recuperación completa: correo en Mailpit → enlace → nueva contraseña → entra', async ({
    page,
    accounts,
    request,
  }, testInfo) => {
    test.skip(
      isMobile(testInfo.project.name),
      'Solo escritorio: Supabase local envía 2 correos/hora',
    );
    const account = await accounts.create('single');

    await page.goto('/recuperar');
    await page.getByLabel(messages.auth.email).fill(account.email);
    await page.getByRole('button', { name: messages.auth.recoverSubmit }).click();
    await expect(
      page.getByRole('status').filter({ hasText: messages.auth.recoverSent }),
    ).toBeVisible();

    let link: string | undefined;
    await expect
      .poll(
        async () => {
          const search = await request.get(
            `${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${account.email}"`)}`,
          );
          const body = (await search.json()) as { messages?: { ID: string }[] };
          const id = body.messages?.[0]?.ID;
          if (!id) return undefined;
          const message = (await (await request.get(`${MAILPIT}/api/v1/message/${id}`)).json()) as {
            HTML: string;
          };
          link = /href="([^"]*\/restablecer\?token_hash=[^"]+)"/.exec(message.HTML)?.[1];
          return link;
        },
        { message: 'el correo de recuperación no llegó (¿límite email_sent de Supabase local?)' },
      )
      .toBeTruthy();

    const url = new URL((link ?? '').replaceAll('&amp;', '&'));
    await page.goto(`${url.pathname}${url.search}`);
    const newPassword = `Nueva-${account.password}`;
    await page.getByLabel(messages.auth.password).fill(newPassword);
    await page.getByRole('button', { name: messages.auth.resetSubmit }).click();
    await expect(page).toHaveURL(/\/bandeja$/);

    // La nueva contraseña sirve para entrar; la anterior ya no.
    await page.context().clearCookies();
    await signInThroughUi(page, account.email, account.password);
    await expect(page.getByRole('alert').filter({ hasText: invalidCredentials })).toBeVisible();
    await signInThroughUi(page, account.email, newPassword);
    await expect(page).toHaveURL(/\/bandeja$/);
  });
});
