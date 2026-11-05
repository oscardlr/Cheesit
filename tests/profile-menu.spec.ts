import { test, expect } from '@playwright/test';
import { accountsHarness } from './accounts-harness';
import { account } from './account-navigation';

test.skip(process.env.CHEESIT_ACCOUNTS_FIXTURE !== '1', 'Requires the isolated account fixture.');
let harness: Awaited<ReturnType<typeof accountsHarness>>;
test.beforeAll(async () => { harness = await accountsHarness(); await harness.seed('profile-menu@example.test'); });
test.afterAll(async () => { await harness?.close(); });

test('profile disclosure replaces the toolbar and keeps account controls in Settings', async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem('grind-intro-v1', '1'));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.getByLabel('Correo electrónico').fill('profile-menu@example.test');
  await page.getByLabel('Contraseña', { exact: true }).fill('test-password-123');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Inicio', exact: true })).toBeVisible();
  await expect(page.locator('.account-toolbar')).toHaveCount(0);
  await expect(page.locator('.account-settings')).toBeHidden();
  await expect(page.getByRole('button', { name: 'Reintentar sincronización' })).toBeHidden();
  await expect(page.locator('.topbar .settings-button')).toHaveCount(0);

  const menu = page.getByLabel('Menú de perfil', { exact: true });
  await expect(menu.locator('img')).toHaveCount(0);
  await expect(menu.locator('svg')).toBeVisible();
  await menu.click();
  await expect(page.locator('.profile-nav-options > button')).toHaveText(['Mi perfil', 'Ajustes', 'Cerrar sesión']);
  await expect(page).toHaveURL(/view=summary/);
  await expect(page.getByRole('group', { name: 'Opciones de perfil' })).toBeVisible();
  await page.getByRole('heading', { name: 'Inicio', exact: true }).click();
  await expect(page.locator('.profile-nav')).not.toHaveAttribute('open');
  await menu.click(); await page.keyboard.press('Escape'); await expect(menu).toBeFocused();
  await expect(page.locator('.profile-nav')).not.toHaveAttribute('open');
  await menu.press('Enter'); await page.keyboard.press('Tab');
  await expect(page.locator('.profile-nav-options').getByRole('button', { name: 'Mi perfil', exact: true })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Mi perfil', exact: true })).toBeVisible();
  await expect(page.locator('.account-settings')).toBeHidden();

  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await menu.click();
    const bounds = await page.locator('.profile-nav-options').boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0); expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `artifacts/profile-menu/menu-${width}.png` });
    await page.keyboard.press('Escape');
  }
  await account(page);
  await expect(page.getByRole('region', { name: 'Cuenta y sincronización' })).toBeVisible();
  await expect(page.locator('.account-sync-copy')).toContainText('Sincronizado con tu cuenta', { timeout: 15000 });
  await expect(page.getByRole('button', { name: 'Reintentar sincronización' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Cerrar sesión', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Revisar copias de conflictos' })).toBeVisible();
  await page.screenshot({ path: 'artifacts/profile-menu/settings.png', fullPage: true });
  await menu.click();
  const logout = page.locator('.profile-nav-options').getByRole('button', { name: 'Cerrar sesión', exact: true });
  await page.evaluate(() => window.addEventListener('cheesit:before-update', event => event.preventDefault(), { once: true }));
  await logout.click();
  await expect(page.locator('.profile-nav-options').getByRole('alert')).toHaveText('Guarda o descarta la edición abierta antes de cerrar sesión.');
  await expect(logout).toBeEnabled();
  await logout.click();
  await expect(page.getByRole('heading', { name: 'Iniciar sesión', exact: true })).toBeVisible();
  await expect(page.locator('.profile-nav')).toHaveCount(0);
});

test('toolbar photo follows profile uploads, changes and removal', async ({ page }) => {
  await harness.seed('toolbar-photo@example.test');
  await page.addInitScript(() => sessionStorage.setItem('grind-intro-v1', '1'));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.getByLabel('Correo electrónico').fill('toolbar-photo@example.test');
  await page.getByLabel('Contraseña', { exact: true }).fill('test-password-123');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Inicio', exact: true })).toBeVisible();
  const menu = page.getByLabel('Menú de perfil', { exact: true });
  await expect(menu.locator('svg')).toBeVisible();
  await menu.click();
  await page.locator('.profile-nav-options').getByRole('button', { name: 'Mi perfil', exact: true }).click();
  for (const color of ['#b8a0ff', '#d8ff3e']) {
    await page.getByRole('button', { name: 'Editar perfil', exact: true }).click();
    const preview = page.getByRole('dialog').locator('.personal-avatar img');
    const previousPhoto = await preview.count() ? await preview.getAttribute('src') : null;
    const image = await page.evaluate(color => {
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = 64;
      const context = canvas.getContext('2d')!; context.fillStyle = color; context.fillRect(0, 0, 64, 64);
      return canvas.toDataURL('image/png').split(',')[1];
    }, color);
    await page.getByLabel('Foto de perfil', { exact: true }).setInputFiles({ name: 'foto.png', mimeType: 'image/png', buffer: Buffer.from(image, 'base64') });
    await expect(preview).toBeVisible();
    if (previousPhoto) await expect(preview).not.toHaveAttribute('src', previousPhoto);
    await expect(page.getByRole('button', { name: 'Guardar cambios', exact: true })).toBeEnabled();
    const photo = await preview.getAttribute('src');
    await page.getByRole('button', { name: 'Guardar cambios', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(menu.locator('img')).toHaveAttribute('src', photo!);
    await expect(menu.locator('svg')).toHaveCount(0);
    await page.reload();
    await expect(menu.locator('img')).toHaveAttribute('src', photo!);
    await page.screenshot({ path: `artifacts/profile-menu/photo-${color.slice(1)}.png` });
  }
  await page.getByRole('button', { name: 'Editar perfil', exact: true }).click();
  await page.getByRole('button', { name: 'Eliminar foto', exact: true }).click();
  await page.getByRole('button', { name: 'Guardar cambios', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(menu.locator('img')).toHaveCount(0);
  await expect(menu.locator('svg')).toBeVisible();
});
