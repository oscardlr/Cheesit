import { expect, type Page } from '@playwright/test';

export async function settings(page: Page) {
  await page.getByLabel('Menú de perfil', { exact: true }).click();
  await page.locator('.profile-nav-options').getByRole('button', { name: 'Ajustes', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Ajustes', exact: true })).toBeVisible();
}

export async function account(page: Page) {
  await settings(page);
  const details = page.locator('.account-settings-details');
  if (await details.getAttribute('open') === null) await details.locator('summary').first().click();
}
