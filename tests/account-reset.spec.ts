import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { accountsHarness } from './accounts-harness';
import { settings } from './account-navigation';
import { gameBalance, gameProgress, normalizeGame } from '../src/lib/game';
import type { AppData } from '../src/lib/model';

test.skip(process.env.CHEESIT_ACCOUNTS_FIXTURE !== '1', 'Requires the isolated account fixture.');
let harness: Awaited<ReturnType<typeof accountsHarness>>;
test.beforeAll(async () => { harness = await accountsHarness(Number(process.env.CHEESIT_ACCOUNTS_FIXTURE_PORT ?? 55440)); });
test.afterAll(async () => { await harness?.close(); });

async function login(page: Page, email: string) {
  await page.addInitScript(() => sessionStorage.setItem('grind-intro-v1', '1'));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.getByLabel('Correo electrónico').fill(email);
  await page.getByLabel('Contraseña', { exact: true }).fill('test-password-123');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Resumen', exact: true })).toBeVisible();
  await settings(page);
  await expect(page.locator('.account-sync-copy')).toContainText('Sincronizado con tu cuenta', { timeout: 15000 });
}

function initialData(): AppData {
  return JSON.parse(readFileSync('tests/fixtures/legacy-account.json', 'utf8')).data;
}

function expectClean(data: AppData) {
  expect(data.workouts).toEqual([]); expect(data.routines).toEqual([]); expect(data.customExercises).toEqual([]);
  expect(data.routineDraft).toBeUndefined();
  expect(data.game?.inventory).toEqual([]); expect(data.game?.transactions).toEqual([]);
  expect(gameBalance(normalizeGame(data.game), data.workouts, data.profile)).toBe(100);
  expect(gameProgress(normalizeGame(data.game), data.workouts, data.profile).xp).toBe(0);
}

test('red reset button confirms, cancels without deleting, and resets the cloud account across devices', async ({ page, browser }) => {
  const email = 'reset@example.test'; await harness.seed(email, undefined, initialData());
  await login(page, email);
  await expect(page.locator('.offline-shell')).toContainText('Disponible sin conexión', { timeout: 30000 });
  await expect(page.locator('.offline-shell')).toBeHidden();
  const nav = page.getByRole('navigation', { name: 'Navegación principal' });
  await nav.getByRole('button', { name: 'Resumen', exact: true }).click();
  await expect(page.locator('.quick-guide, .arcade-preview')).toHaveCount(0);
  await nav.getByRole('button', { name: 'Arcade', exact: true }).click();
  await page.locator('.arcade-goal-tile').click();
  const filters = page.getByRole('group', { name: 'Mostrar objetivos' });
  await expect(filters.getByRole('combobox')).toHaveCount(0);
  await expect(filters.getByRole('button')).toHaveCount(3);
  for (const name of ['Pendientes', 'Recompensados', 'Todos']) {
    await filters.getByRole('button', { name, exact: true }).click();
    await expect(filters.getByRole('button', { name, exact: true })).toHaveAttribute('aria-pressed', 'true');
  }
  await settings(page);
  const otherContext = await browser.newContext();
  const other = await otherContext.newPage();
  try {
    await login(other, email); await otherContext.setOffline(true);
    const reset = page.getByRole('button', { name: 'Resetear cuenta', exact: true });
    await expect(reset).toHaveCSS('background-color', 'rgb(184, 44, 59)');
    await expect(page.locator('.settings-section').last()).toHaveAttribute('aria-label', 'Resetear cuenta');
    const before = (await harness.account(email)).data as AppData;
    page.once('dialog', async dialog => {
      expect(dialog.type()).toBe('confirm'); expect(dialog.message()).toContain('100 créditos');
      expect(dialog.message()).toContain('no se puede deshacer'); await dialog.dismiss();
    });
    await reset.click(); expect((await harness.account(email)).data).toEqual(before);
    await reset.scrollIntoViewIfNeeded();
    await page.screenshot({ path: 'artifacts/account-reset/settings-mobile.png', fullPage: true });
    page.once('dialog', dialog => dialog.accept()); await reset.click();
    await expect(page.locator('.account-reset-section').getByRole('status')).toContainText('Empiezas de nuevo con 100 créditos');
    const after = (await harness.account(email)).data as AppData; expectClean(after);
    expect(after.profile).toEqual(before.profile); expect(after.personalProfile).toEqual(before.personalProfile);
    await page.reload(); await expect(page.getByRole('button', { name: 'Resetear cuenta', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Créditos y cofres' })).toContainText('100');
    await expect(page.locator('.level-pill')).toContainText('1');
    await otherContext.setOffline(false); await other.getByRole('button', { name: 'Reintentar sincronización' }).click();
    await expect(other.getByRole('button', { name: 'Créditos y cofres' })).toContainText('100');
    await expect(other.getByRole('heading', { name: 'Revisa los cambios de tus dispositivos' })).toHaveCount(0);
    expectClean((await harness.account(email)).data as AppData);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.screenshot({ path: 'artifacts/account-reset/settings-desktop.png', fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  } finally { await otherContext.close(); }
});

test('offline reset reports pending cloud deletion and uploads when reconnected', async ({ page, context }) => {
  const email = 'reset-offline@example.test'; await harness.seed(email, undefined, initialData());
  await login(page, email); await context.setOffline(true);
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Resetear cuenta', exact: true }).click();
  await expect(page.locator('.account-reset-section').getByRole('status')).toContainText('sigue pendiente');
  await expect(page.getByRole('button', { name: 'Créditos y cofres' })).toContainText('100');
  expect(((await harness.account(email)).data as AppData).workouts.length).toBeGreaterThan(0);
  await context.setOffline(false); await page.getByRole('button', { name: 'Reintentar sincronización' }).click();
  await expect.poll(async () => ((await harness.account(email)).data as AppData).workouts.length).toBe(0);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Créditos y cofres' })).toContainText('100');
  expectClean((await harness.account(email)).data as AppData);
});
