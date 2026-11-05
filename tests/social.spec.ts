import { test, expect, type Page } from '@playwright/test';
import { accountsHarness } from './accounts-harness';
import { emptyData } from '../src/lib/model';

test.skip(process.env.CHEESIT_ACCOUNTS_FIXTURE !== '1', 'Requires isolated Auth/Postgres account fixture.');
let harness: Awaited<ReturnType<typeof accountsHarness>>;
test.beforeAll(async () => { harness = await accountsHarness(); });
test.afterAll(async () => { await harness?.close(); });
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem('grind-intro-v1', '1'));
  await page.emulateMedia({ reducedMotion: 'reduce' });
});
async function login(page: Page, email: string) {
  await page.goto('/'); await page.getByLabel('Correo electrónico').fill(email);
  await page.getByLabel('Contraseña', { exact: true }).fill('test-password-123');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Inicio', exact: true })).toBeVisible();
}
async function search(page: Page, query: string) {
  await page.getByRole('navigation', { name: 'Navegación principal' }).getByRole('button', { name: 'Comunidad', exact: true }).click();
  await page.getByRole('button', { name: 'Buscar personas', exact: true }).click();
  if(query) await page.getByLabel('Nombre o nombre de usuario', { exact: true }).fill(query);
}
async function openOwn(page: Page) {
  await page.getByLabel('Menú de perfil', { exact: true }).click();
  await page.getByRole('button', { name: 'Mi perfil', exact: true }).click();
}
const data = (displayName: string, bio: string, photo: string | null = null) => ({ ...emptyData(), personalProfile: { displayName, bio, photo } });

test('two people: mobile and desktop search, directed follows, lists, back/reload, own counts and synchronized edits', async ({ page, browser }) => {
  test.setTimeout(90000);
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  const photo = await page.evaluate(() => { const c = document.createElement('canvas'); c.width = c.height = 40; const ctx = c.getContext('2d')!; ctx.fillStyle = '#b8a0ff'; ctx.fillRect(0, 0, 40, 40); return c.toDataURL('image/jpeg'); });
  const a = await harness.seed('social-ana@example.test', undefined, data('Ana Cheesit', 'Mi biografía social.'));
  const b = await harness.seed('social-beto@example.test', undefined, data('Beto Cheesit', 'Entrenando a mi ritmo.', photo));
  const handleA = (await harness.social('social-ana@example.test')).username;
  const handleB = (await harness.social('social-beto@example.test')).username;
  await login(page, 'social-ana@example.test');
  await search(page, `@${handleB.toUpperCase()}`);
  const result = page.getByRole('list', { name: 'Resultados de personas' });
  await expect(result).toContainText('Beto Cheesit'); await expect(result).toContainText(`@${handleB}`);
  await expect(result.getByRole('img', { name: 'Foto de perfil de Beto Cheesit' })).toBeVisible();
  await result.locator('.social-person').click();
  await expect(page.getByRole('heading', { name: 'Beto Cheesit', exact: true })).toBeVisible();
  await expect(page.locator('.profile-bio')).toHaveText('Entrenando a mi ritmo.');
  await expect(page.locator('.profile-stats')).toHaveCount(0); await expect(page.locator('.profile-workout')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '0 Seguidores', exact: true })).toBeVisible();
  await page.route('**/rest/v1/cheesit_follows*', async route => { await new Promise(resolve => setTimeout(resolve, 500)); await route.continue(); });
  await page.getByRole('button', { name: 'Seguir', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Confirmando…', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Dejar de seguir', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '1 Seguidores', exact: true })).toBeVisible();
  await page.unroute('**/rest/v1/cheesit_follows*');
  const secondContext = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  const second = await secondContext.newPage(); second.on('pageerror', e => errors.push(e.message));
  try {
    await login(second, 'social-beto@example.test'); await search(second, handleA);
    await expect(second.locator('.social-person')).toContainText('Te sigue'); await second.locator('.social-person').click();
    await expect(second.locator('.social-follows-you')).toHaveText('Te sigue');
    await expect(second.getByRole('button', { name: 'Seguir', exact: true })).toBeVisible();
    await expect(second.getByRole('button', { name: '0 Seguidores', exact: true })).toBeVisible();
    await second.getByRole('button', { name: '1 Seguidos', exact: true }).click();
    await expect(second.getByRole('heading', { name: 'Seguidos', exact: true })).toBeVisible();
    await expect(second.locator('.social-person')).toContainText('Beto Cheesit'); await second.locator('.social-person').click();
    await expect(second.getByRole('heading', { name: 'Beto Cheesit', exact: true })).toBeVisible();
    await expect(second.getByRole('button', { name: 'Seguir', exact: true })).toHaveCount(0);
    await second.goBack(); await expect(second.getByRole('heading', { name: 'Seguidos', exact: true })).toBeVisible();
    await second.reload(); await expect(second.locator('.social-person')).toContainText('Beto Cheesit');
    await second.getByRole('button', { name: 'Ver perfil de esta persona' }).click();
    await second.getByRole('button', { name: 'Seguir', exact: true }).click();
    await expect(second.getByRole('button', { name: 'Dejar de seguir', exact: true })).toBeVisible();
    await page.reload(); await expect(page.locator('.social-follows-you')).toHaveText('Te sigue');
    await page.getByRole('button', { name: '1 Seguidores', exact: true }).click();
    await expect(page.locator('.social-person')).toContainText('Ana Cheesit'); await page.locator('.social-person').click();
    await expect(page.getByRole('heading', { name: 'Ana Cheesit', exact: true })).toBeVisible();
    await openOwn(page); await expect(page.getByRole('button', { name: '1 Seguidores', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '1 Seguidos', exact: true })).toBeVisible();
    await second.getByLabel('Menú de perfil', { exact: true }).click(); await second.getByRole('button', { name: 'Mi perfil', exact: true }).click();
    await second.getByRole('button', { name: 'Editar perfil', exact: true }).click();
    await second.getByRole('dialog').getByLabel('Nombre', { exact: true }).fill('Beto actualizado');
    await second.getByLabel('Biografía').fill('Nueva biografía visible.');
    await second.getByRole('button', { name: 'Eliminar foto', exact: true }).click();
    await second.getByRole('button', { name: 'Guardar cambios', exact: true }).click();
    await expect(second.getByRole('dialog')).toHaveCount(0);
    await search(page, handleB); await page.locator('.social-person').click();
    await expect(page.getByRole('heading', { name: 'Beto actualizado', exact: true })).toBeVisible();
    await expect(page.locator('.profile-bio')).toHaveText('Nueva biografía visible.');
    await expect(page.getByRole('img', { name: 'Avatar predeterminado' })).toBeVisible();
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 950 });
      await expect(page.getByRole('heading', { name: 'Beto actualizado', exact: true })).toBeVisible();
      await page.evaluate(() => window.scrollTo(0, 0));
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: `artifacts/social/profile-${width}.png`, fullPage: true });
      await page.getByRole('button', { name: '1 Seguidores', exact: true }).click();
      await expect(page.locator('.social-person')).toContainText('Ana Cheesit');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: `artifacts/social/followers-${width}.png`, fullPage: true });
      await page.getByRole('button', { name: 'Ver perfil de esta persona' }).click();
    }
    await page.getByRole('button', { name: 'Dejar de seguir', exact: true }).click();
    await expect(page.getByRole('button', { name: '0 Seguidores', exact: true })).toBeVisible();
    await expect(page.locator('.social-follows-you')).toHaveText('Te sigue');
    await page.getByRole('button', { name: '0 Seguidores', exact: true }).click();
    await expect(page.getByText('Todavía no hay seguidores.')).toBeVisible();
    expect(errors).toEqual([]);
    expect(a.id).not.toBe(b.id);
  } finally { await secondContext.close(); }
});

test('empty and stale searches, server errors, offline and response loss never show an unconfirmed follow', async ({ page, context }) => {
  test.setTimeout(60000);
  await harness.seed('social-errors@example.test', undefined, data('Errores', ''));
  await harness.seed('social-target@example.test', undefined, data('Objetivo', ''));
  const target = (await harness.social('social-target@example.test')).username;
  await login(page, 'social-errors@example.test'); await search(page, 'nobody_matches');
  await expect(page.getByText('No encontramos a nadie.')).toBeVisible();
  await page.route('**/rest/v1/cheesit_social_profiles?*', async route => {
    if (new URL(route.request().url()).searchParams.get('or')?.includes('slow')) await new Promise(resolve => setTimeout(resolve, 1000));
    await route.continue();
  });
  await page.getByLabel('Nombre o nombre de usuario', { exact: true }).fill('slow'); await page.waitForTimeout(350);
  await page.getByLabel('Nombre o nombre de usuario', { exact: true }).fill(target);
  await expect(page.locator('.social-person')).toContainText('Objetivo');
  await page.waitForTimeout(1100); await expect(page.locator('.social-person')).toHaveCount(1);
  await page.unroute('**/rest/v1/cheesit_social_profiles?*'); await page.locator('.social-person').click();
  await page.route('**/rest/v1/cheesit_follows*', route => route.fulfill({ status: 503, json: { message: 'unavailable' } }));
  await page.getByRole('button', { name: 'Seguir', exact: true }).click();
  await expect(page.locator('.social-page [role=alert]')).toContainText('No se ha podido confirmar');
  await expect(page.getByRole('button', { name: 'Seguir', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '0 Seguidores', exact: true })).toBeVisible();
  await page.unroute('**/rest/v1/cheesit_follows*');
  await context.setOffline(true); await expect(page.getByText('Sin conexión.', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Seguir', exact: true })).toBeDisabled();
  await context.setOffline(false); await expect(page.getByRole('button', { name: 'Seguir', exact: true })).toBeEnabled();
  // Commit on the real fixture, then lose only the response.
  await page.route('**/rest/v1/cheesit_follows*', async route => { await route.fetch(); await route.abort('failed'); });
  await page.getByRole('button', { name: 'Seguir', exact: true }).click();
  await expect(page.locator('.social-page [role=alert]')).toContainText('No se ha podido confirmar');
  await expect(page.getByRole('button', { name: 'Seguir', exact: true })).toBeVisible();
  await page.unroute('**/rest/v1/cheesit_follows*');
  await page.getByRole('button', { name: 'Seguir', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Dejar de seguir', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '1 Seguidores', exact: true })).toBeVisible();
  await search(page, target);
  await page.route('**/rest/v1/cheesit_social_profiles?*', route => route.fulfill({ status: 400, json: { message: 'unavailable' } }));
  await page.getByLabel('Nombre o nombre de usuario', { exact: true }).fill('retry');
  await expect(page.locator('.social-page [role=alert]')).toContainText('No se ha podido confirmar');
  await page.unroute('**/rest/v1/cheesit_social_profiles?*'); await page.getByRole('button', { name: 'Reintentar', exact: true }).click();
  await expect(page.getByText('No encontramos a nadie.')).toBeVisible();
});

test('guest keeps local activity and is invited to create an account for social features', async ({ page }) => {
  await page.goto('/'); await page.getByRole('button', { name: 'Continuar como invitado' }).click();
  await search(page, ''); await expect(page.getByText('Conecta con tu gente.')).toBeVisible();
  await expect(page.getByLabel('Nombre o nombre de usuario', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Ir a mi cuenta' }).click();
  await expect(page.getByRole('heading', { name: 'Modo invitado', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Ir a iniciar sesión' }).click();
  await expect(page.getByLabel('Correo electrónico')).toBeVisible();
});

test('search paginates and browser back restores the query without revisiting every keystroke', async ({ page }) => {
  await harness.seed('social-pages@example.test', undefined, data('Paginación', ''));
  for (let i = 0; i < 23; i++) await harness.seed(`social-page-${i}@example.test`, undefined, data(`Persona ${i}`, ''));
  await login(page, 'social-pages@example.test'); await search(page, 'u');
  await expect(page.locator('.social-person')).toHaveCount(20);
  await page.getByRole('button', { name: 'Cargar más personas', exact: true }).click();
  await expect.poll(() => page.locator('.social-person').count()).toBeGreaterThan(20);
  const handles = await page.locator('.social-person-copy>span').allTextContents();
  expect(new Set(handles).size).toBe(handles.length);
  await page.locator('.social-person').first().click();
  await expect(page.getByRole('heading', { name: 'Perfil social', exact: true })).toBeVisible();
  await page.goBack(); await expect(page.getByLabel('Nombre o nombre de usuario', { exact: true })).toHaveValue('u');
  await page.goBack(); await expect(page.getByRole('heading', { name: 'Comunidad', exact: true })).toBeVisible();
});
