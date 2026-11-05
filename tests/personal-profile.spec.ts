import { account, settings } from './account-navigation';
import { test, expect, type Page } from '@playwright/test';
import { accountsHarness } from './accounts-harness';
import { CATALOG } from '../src/lib/catalog';
import { emptyData, newWorkout, newSet, exerciseSnapshot, type AppData } from '../src/lib/model';
import { gameProgress, normalizeGame } from '../src/lib/game';
import { totals } from '../src/lib/metrics';

test.skip(process.env.CHEESIT_ACCOUNTS_FIXTURE !== '1', 'Requires isolated Auth/Postgres account fixture.');
let harness: Awaited<ReturnType<typeof accountsHarness>>;
test.beforeAll(async () => { harness = await accountsHarness(); });
test.afterAll(async () => { await harness?.close(); });
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem('grind-intro-v1', '1'));
  await page.emulateMedia({ reducedMotion: 'reduce' });
});
async function login(page: Page, email: string) {
  await page.goto('/'); await page.getByLabel('Correo electrónico').fill(email); await page.getByLabel('Contraseña', { exact: true }).fill('test-password-123'); await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Inicio', exact: true })).toBeVisible();
  await synced(page);
}
async function synced(page: Page) { await expect(page.locator('.account-sync-copy')).toContainText('Sincronizado con tu cuenta', { timeout: 15000 }); }
async function open(page: Page) { await page.getByLabel('Menú de perfil', { exact: true }).click(); await page.locator('.profile-nav-options').getByRole('button', { name: 'Mi perfil', exact: true }).click(); await expect(page.getByRole('heading', { name: 'Mi perfil', exact: true })).toBeVisible(); }
async function edit(page: Page) { await page.getByRole('button', { name: 'Editar perfil', exact: true }).click(); await expect(page.getByRole('dialog')).toBeVisible(); }
async function save(page: Page) { await page.getByRole('button', { name: 'Guardar cambios', exact: true }).click(); await expect(page.getByRole('dialog')).toHaveCount(0); }
async function upload(page: Page, color: string) {
  const preview = page.getByRole('dialog').locator('.personal-avatar img');
  const previousPhoto = await preview.count() ? await preview.getAttribute('src') : null;
  const image = await page.evaluate(color => { const canvas = document.createElement('canvas'); canvas.width = 600; canvas.height = 400; const ctx = canvas.getContext('2d')!; ctx.fillStyle = color; ctx.fillRect(0, 0, 600, 400); return canvas.toDataURL('image/png').split(',')[1]; }, color);
  await page.getByLabel('Foto de perfil', { exact: true }).setInputFiles({ name: 'mi-foto.png', mimeType: 'image/png', buffer: Buffer.from(image, 'base64') });
  await expect(page.getByRole('dialog').locator('.personal-avatar img')).toBeVisible();
  if (previousPhoto) await expect(page.getByRole('dialog').locator('.personal-avatar img')).not.toHaveAttribute('src', previousPhoto);
  await expect(page.getByRole('button', { name: 'Guardar cambios', exact: true })).toBeEnabled();
}

test('new private profile: edit, upload/change/remove photo, offline reload, second device and account isolation', async ({ page, browser, context }) => {
  test.setTimeout(60000);
  await harness.seed('profile@example.test'); await harness.seed('profile-other@example.test');
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await login(page, 'profile@example.test'); await open(page);
  await expect(page.locator('.profile-stats dd')).toHaveText(['0', '0', '1']);
  await expect(page.getByRole('img', { name: 'Avatar predeterminado' })).toBeVisible();
  await expect(page.getByText('Tu primera sesión empieza contigo.')).toBeVisible();
  await expect(page.locator('.profile-workout')).toHaveCount(0);
  await edit(page);
  await page.getByLabel('Foto de perfil', { exact: true }).setInputFiles({ name: 'wrong.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg/>') });
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('JPG, PNG o WebP');
  await page.getByRole('dialog').getByLabel('Nombre', { exact: true }).fill('Álex Cheesit'); await page.getByLabel('Biografía').fill('Entreno a mi ritmo.\nCada rep cuenta. 🧀');
  await upload(page, '#b8a0ff');
  const firstPhoto = await page.getByRole('dialog').locator('.personal-avatar img').getAttribute('src');
  expect(firstPhoto).toMatch(/^data:image\/jpeg;base64,/);
  await save(page); await synced(page);
  await page.reload(); await expect(page.getByRole('heading', { name: 'Álex Cheesit' })).toBeVisible();
  await expect(page.locator('.profile-bio')).toHaveText('Entreno a mi ritmo.\nCada rep cuenta. 🧀');
  expect((await harness.account('profile@example.test')).data).toMatchObject({ personalProfile: { displayName: 'Álex Cheesit', photo: firstPhoto } });
  const deviceContext = await browser.newContext(); const device = await deviceContext.newPage();
  try {
    await login(device, 'profile@example.test'); await open(device);
    await expect(device.locator('.personal-avatar img')).toHaveAttribute('src', firstPhoto!);
    await edit(device); await upload(device, '#d8ff3e');
    const secondPhoto = await device.getByRole('dialog').locator('.personal-avatar img').getAttribute('src');
    expect(secondPhoto).not.toBe(firstPhoto); await save(device); await synced(device);
    await expect.poll(async () => ((await harness.account('profile@example.test')).data as AppData).personalProfile?.photo === secondPhoto).toBe(true);
    await page.reload(); await expect(page.locator('.personal-avatar img')).toHaveAttribute('src', secondPhoto!);
    await expect(page.locator('.offline-shell')).toContainText('Disponible sin conexión', { timeout: 30000 });
    await context.setOffline(true); await edit(page); await page.getByRole('button', { name: 'Eliminar foto', exact: true }).click(); await page.getByRole('button',{name:'Guardar cambios',exact:true}).click(); await expect(page.getByRole('dialog').getByRole('alert')).toContainText('conexión'); await context.setOffline(false); await save(page);
    await synced(page);
    await page.reload(); await expect(page.getByRole('heading', { name: 'Álex Cheesit' })).toBeVisible();
    await expect(page.getByRole('img', { name: 'Avatar predeterminado' })).toBeVisible();
    await context.setOffline(false); await settings(page);await page.getByRole('button', { name: 'Reintentar sincronización' }).click(); await synced(page);
    await expect.poll(async () => ((await harness.account('profile@example.test')).data as AppData).personalProfile?.photo === null).toBe(true);
    const downloaded = device.waitForResponse(response => response.url().includes('/rest/v1/cheesit_accounts') && response.request().method() === 'GET');
    await device.reload();
    const remote = await (await downloaded).json(); expect(remote.data.personalProfile.photo).toBeNull();
    await synced(device);
    await expect(device.getByRole('img', { name: 'Avatar predeterminado' })).toBeVisible();
    await account(page); await page.getByRole('button', { name: 'Cerrar sesión', exact: true }).click(); await login(page, 'profile-other@example.test'); await open(page);
    await expect(page.locator('.profile-name h2')).toHaveText('Tu perfil'); await expect(page.locator('.profile-bio')).not.toContainText('Entreno a mi ritmo'); await expect(page.locator('.profile-stats dd')).toHaveText(['0', '0', '1']);
    expect((await harness.account('profile@example.test')).data).toMatchObject({ personalProfile: { photo: null } });
    expect(errors).toEqual([]);
  } finally { await deviceContext.close(); }
});

test('real recent activity, details and responsive layout with accessible editing and cancellation', async ({ page }) => {
  const workouts = Array.from({ length: 8 }, (_, index) => ({ ...newWorkout(), status: 'finished' as const, date: `2026-01-${String(index + 1).padStart(2, '0')}`, name: `Sesión real ${index + 1}`, exercises: [{ id: crypto.randomUUID(), ...exerciseSnapshot(CATALOG[0]), sets: [{ ...newSet(), weight: 40, reps: 8, confirmed: true }, { ...newSet(), weight: 45, reps: 6, confirmed: true }] }] }));
  const data: AppData = { ...emptyData(), workouts: [...workouts, { ...newWorkout(), name: 'Borrador privado' }, { ...workouts[0], id: crypto.randomUUID(), status: 'deleted', name: 'Sesión eliminada', exercises: [] }], personalProfile: { displayName: 'Una persona con un nombre bastante largo para probar el diseño', bio: 'Paso a paso.\nSin prisas, sin pausas.', photo: null } };
  await harness.seed('profile-history@example.test', undefined, data); await login(page, 'profile-history@example.test'); await open(page);
  const stats = totals(data.workouts); const level = gameProgress(normalizeGame(data.game), data.workouts, data.profile).level;
  await expect(page.locator('.profile-stats dd')).toHaveText([String(stats.workouts), String(stats.sets), String(level)]);
  await expect(page.locator('.profile-workout')).toHaveCount(6); await expect(page.locator('.profile-workout').first()).toContainText('Sesión real 8');
  await expect(page.locator('.profile-workout').first()).toContainText('1 ejercicio · 2 series · 14 reps');
  await expect(page.getByText('Borrador privado')).toHaveCount(0); await expect(page.getByText('Sesión eliminada')).toHaveCount(0);
  await page.locator('.profile-workout').first().click(); await expect(page.locator('.detail-hero h2')).toHaveText('Sesión real 8');
  await page.reload(); await expect(page.locator('.detail-hero h2')).toHaveText('Sesión real 8'); await page.getByRole('button', { name: 'Volver', exact: true }).click(); await expect(page.getByRole('heading', { name: 'Mi perfil', exact: true })).toBeVisible();
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 950 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const brand = await page.locator('.brand').boundingBox(), actions = await page.locator('.topbar-actions').boundingBox();
    expect(actions!.x).toBeGreaterThanOrEqual(brand!.x + brand!.width);
    await page.screenshot({ path: `artifacts/personal-profile/profile-${width}.png`, fullPage: true });
    await edit(page); await expect(page.getByRole('dialog').getByLabel('Nombre', { exact: true })).toBeFocused();
    expect(await page.getByRole('dialog').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    await page.screenshot({ path: `artifacts/personal-profile/edit-${width}.png` });
    await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
  }
  await edit(page); await page.getByRole('dialog').getByLabel('Nombre', { exact: true }).fill('Esto no se debe guardar');
  page.once('dialog', dialog => dialog.dismiss()); await page.keyboard.press('Escape'); await expect(page.getByRole('dialog')).toBeVisible();
  page.once('dialog', dialog => dialog.accept()); await page.keyboard.press('Escape'); await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.profile-name h2')).toHaveText(data.personalProfile!.displayName);
  await page.getByLabel('Menú de perfil', { exact: true }).focus(); await page.keyboard.press('Enter'); await page.keyboard.press('Tab'); await page.keyboard.press('Enter'); await expect(page.getByRole('heading', { name: 'Mi perfil', exact: true })).toBeVisible();
});

test('two different personal profile edits require review and display both private versions', async ({ page, browser }) => {
  await harness.seed('profile-conflict@example.test'); await login(page, 'profile-conflict@example.test'); await open(page);
  const secondContext = await browser.newContext(); const second = await secondContext.newPage();
  try {
    await login(second, 'profile-conflict@example.test'); await open(second); await secondContext.setOffline(true);
    await edit(page); await page.getByRole('dialog').getByLabel('Nombre', { exact: true }).fill('Versión en la cuenta'); await save(page); await synced(page);
    await edit(second); await second.getByRole('dialog').getByLabel('Nombre', { exact: true }).fill('Versión sin conexión'); await second.getByRole('button',{name:'Guardar cambios',exact:true}).click(); await expect(second.getByRole('dialog').getByRole('alert')).toContainText('conexión'); await second.getByRole('button',{name:'Cancelar',exact:true}).click();
    await expect(second.locator('.account-sync-copy')).toContainText('Pendiente de conexión'); await settings(second);await secondContext.setOffline(false);
    await expect(second.getByRole('heading', { name: 'Revisa los cambios de tus dispositivos' })).toBeVisible();
    await expect(second.getByRole('group', { name: 'Foto, nombre y biografía' })).toBeVisible();
    await second.getByRole('group', { name: 'Foto, nombre y biografía' }).locator('summary').click();
    await expect(second.getByText('Versión en la cuenta', { exact: true })).toBeVisible(); await expect(second.getByText('Versión sin conexión', { exact: true })).toBeVisible();
    await second.getByLabel('Usar versión de la cuenta', { exact: true }).check(); await second.getByRole('button', { name: 'Confirmar resolución' }).click(); await synced(second);
    await open(second);await expect(second.locator('.profile-name h2')).toHaveText('Versión en la cuenta');
  } finally { await secondContext.close(); }
});
