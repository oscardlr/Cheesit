import { test, expect, type Page } from '@playwright/test';

async function startEmptyWorkout(page: Page) {
  await page.getByRole('navigation').getByRole('button', { name: 'Empezar entrenamiento', exact: true }).click();
  await page.getByRole('main').getByRole('button', { name: /Empezar entrenamiento/ }).click();
  await page.getByRole('button', { name: '＋ Añadir ejercicio' }).click();
  await page.getByRole('dialog').getByRole('button', { name: /Press de banca con barra/ }).click();
  await page.getByLabel('Carga en kg, serie 1 de Press de banca con barra').fill('50');
  await page.getByLabel('Repeticiones, serie 1 de Press de banca con barra').fill('8');
}

test('series celebrate once and XP survives edits, completion and reload', async ({ page }, testInfo) => {
  test.setTimeout(60000);
  const browserErrors: string[] = [];
  page.on('pageerror', error => browserErrors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') browserErrors.push(message.text()); });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Resumen' })).toBeVisible();
  await page.locator('.summary-start img').evaluate(image => (image as HTMLImageElement).decode());
  await page.screenshot({ path: 'test-results/redesign-mobile.png', fullPage: true, animations: 'disabled' });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: 'test-results/redesign-desktop.png', fullPage: true, animations: 'disabled' });
  await page.screenshot({ path: 'test-results/redesign-preview.png', fullPage: false, animations: 'disabled' });
  await page.setViewportSize({ width: 390, height: 844 });

  await startEmptyWorkout(page);
  await page.getByRole('button', { name: 'Confirmar serie 1' }).click();
  await expect(page.locator('.celebration-set')).toContainText('SERIE CONQUISTADA.');
  await expect(page.locator('.celebration-reward')).toContainText('+60');
  await expect(page.getByRole('button', { name: 'Realizada 1' })).toBeDisabled();
  await page.getByRole('button', { name: 'Cerrar celebración' }).click();

  await page.getByLabel('Repeticiones, serie 1 de Press de banca con barra').fill('10');
  await page.getByRole('button', { name: 'Confirmar serie 1' }).click();
  await expect(page.locator('.celebration-stage')).toHaveCount(0);
  await expect(page.getByRole('status')).toContainText('Guardado en este dispositivo');
  await test.step('return to summary without losing the confirmed draft', async () => {
    await page.getByRole('navigation').getByRole('button', { name: 'Resumen', exact: true }).click();
  });
  await expect(page.locator('.xp-label > strong')).toHaveText(/64 \/ 800 XP/);

  await page.getByRole('button', { name: /Continuar entrenamiento/ }).click();
  await page.getByRole('button', { name: 'Finalizar entrenamiento' }).click();
  const victory = page.getByRole('dialog', { name: 'SESIÓN COMPLETADA.' });
  await expect(victory).toBeVisible();
  await expect(victory.locator('.celebration-reward')).toContainText('+350');
  await page.screenshot({ path: testInfo.outputPath('workout-victory.png'), animations: 'disabled' });
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.locator('.xp-label > strong')).toHaveText(/414 \/ 800 XP/);
  await expect(page.getByRole('status')).toContainText('Guardado en este dispositivo');
  await page.reload();
  await expect(page.locator('.xp-label > strong')).toHaveText(/414 \/ 800 XP/);
  await expect(page.locator('.stat-card').filter({ hasText: 'Series' }).locator('strong')).toHaveText('1');
  await expect(page.locator('.stat-card').filter({ hasText: 'Repeticiones' }).locator('strong')).toHaveText('10');
  expect(browserErrors).toEqual([]);
});

test('experience preferences persist and quiet mode still confirms a series', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Ajustes de Cheesit' }).click();
  const effects = page.getByRole('switch', { name: 'Efectos y confeti' });
  const sound = page.getByRole('switch', { name: 'Sonido de victoria' });
  await expect(effects).toBeChecked();
  await expect(sound).toBeChecked();
  await effects.click();
  await sound.click();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Ajustes', exact: true })).toBeVisible();
  await expect(effects).not.toBeChecked();
  await expect(sound).not.toBeChecked();

  await startEmptyWorkout(page);
  await page.getByRole('button', { name: 'Confirmar serie 1' }).click();
  await expect(page.locator('.celebration-stage')).toHaveClass(/celebration-quiet/);
  await expect(page.locator('.celebration-particles')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Realizada 1' })).toBeDisabled();
  await expect(page.getByRole('status')).toContainText('Guardado en este dispositivo');
});

test('discarding historical edits through new session preserves the original workout', async ({ page }) => {
  await page.goto('/');
  await startEmptyWorkout(page);
  await page.getByRole('button', { name: 'Confirmar serie 1' }).click();
  await page.getByRole('button', { name: 'Cerrar celebración' }).click();
  await page.getByRole('button', { name: 'Finalizar entrenamiento' }).click();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.getByRole('status')).toContainText('Guardado en este dispositivo');
  await page.getByRole('navigation').getByRole('button', { name: 'Calendario', exact: true }).click();
  await page.locator('.list-card .list-row').click();
  await page.getByRole('button', { name: 'Editar entrenamiento', exact: true }).click();
  await page.getByLabel('Carga en kg, serie 1 de Press de banca con barra').fill('90');
  await page.getByRole('navigation').getByRole('button', { name: 'Empezar entrenamiento', exact: true }).click();
  const unsaved = page.getByRole('dialog', { name: 'Cambios pendientes' });
  await expect(unsaved).toBeVisible();
  await unsaved.getByRole('button', { name: 'Descartar cambios' }).click();
  await expect(page.getByRole('heading', { name: 'Empezar entrenamiento', exact: true })).toBeVisible();
  await page.getByRole('navigation').getByRole('button', { name: 'Calendario', exact: true }).click();
  await page.locator('.list-card .list-row').click();
  await expect(page.getByText('50 kg × 8 reps')).toBeVisible();
  await expect(page.getByText('90 kg × 8 reps')).toHaveCount(0);
});
