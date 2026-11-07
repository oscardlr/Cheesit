import { expect, test } from '@playwright/test';

test('the logo and only section heading share the header on mobile and desktop', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Continuar como invitado' }).click();

  const header = page.locator('.topbar');
  const logo = header.getByRole('button', { name: 'Cheesit, ir a Inicio' }).locator('img');
  const actions = header.locator('.topbar-actions');
  const main = page.getByRole('main');
  const navigation = page.getByRole('navigation', { name: 'Navegación principal' });

  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    for (const name of ['Inicio', 'Comunidad', 'Entrenar', 'Progreso', 'Arcade']) {
      await navigation.getByRole('button', { name, exact: true }).click();
      const heading = page.getByRole('heading', { name, exact: true, level: 1 });
      await expect(heading).toHaveCount(1);
      await expect(header.getByRole('heading', { name, exact: true })).toBeVisible();
      await expect(main.getByText(name, { exact: true })).toHaveCount(0);
      await expect(logo).toBeVisible();
      await expect.poll(() => logo.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
      const [logoBox, titleBox, actionsBox] = await Promise.all([
        logo.boundingBox(), heading.boundingBox(), actions.boundingBox(),
      ]);
      expect(logoBox!.x + logoBox!.width).toBeLessThan(titleBox!.x);
      expect(titleBox!.x + titleBox!.width).toBeLessThanOrEqual(actionsBox!.x);
      expect(Math.abs(logoBox!.y + logoBox!.height / 2 - titleBox!.y - titleBox!.height / 2)).toBeLessThan(2);

      if (name === 'Inicio') {
        const session = main.locator('.home-command-grid > :first-child');
        await expect(session.getByText('Tu próxima sesión', { exact: true })).toBeVisible();
        await expect(session.getByRole('heading', { name: '¿Entrenamos?' })).toBeVisible();
        await expect(page.getByText(/cada rep cuenta/i)).toHaveCount(0);
      }
      if (name === 'Arcade') {
        await expect(main.getByText(/cada rep desbloquea algo/i)).toHaveCount(0);
        await main.getByRole('button', { name: 'Cofres', exact: true }).click();
        await expect(main.getByRole('heading', { name: 'Cofres y créditos' })).toBeFocused();
        await main.getByRole('button', { name: 'Inicio de Arcade' }).click();
        await expect(heading).toBeFocused();
      }
    }
  }
  await logo.click();
  await expect(header.getByRole('heading', { name: 'Inicio' })).toBeFocused();
});
