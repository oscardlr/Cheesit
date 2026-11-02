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
  await expect(page.getByRole('heading', { name: 'Resumen', exact: true })).toBeVisible();
  await expect(page.locator('.account-toolbar')).toHaveCount(0);
  await expect(page.locator('.account-settings')).toBeHidden();
  await expect(page.getByRole('button', { name: 'Reintentar sincronización' })).toBeHidden();
  await expect(page.locator('.topbar .settings-button')).toHaveCount(0);

  const menu = page.getByLabel('Menú de perfil', { exact: true });
  await menu.click();
  await expect(page).toHaveURL(/view=summary/);
  await expect(page.getByRole('group', { name: 'Opciones de perfil' })).toBeVisible();
  await page.getByRole('heading', { name: 'Resumen', exact: true }).click();
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
});
