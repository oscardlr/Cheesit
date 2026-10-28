import { test, expect } from '@playwright/test';

test('routine, confirmed series, recovery and calendar persist locally', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Resumen' })).toBeVisible();
  await page.getByRole('navigation').getByRole('button', { name: 'Rutinas' }).click();
  await page.getByRole('button', { name: '＋ Crear rutina' }).click();
  await page.getByLabel('Nombre de la rutina').fill('Fuerza de prueba');
  await page.getByRole('button', { name: 'Color morado', exact: true }).click();
  await page.getByRole('button', { name: '＋ Añadir ejercicio' }).click();
  await page.getByRole('dialog').getByRole('button', { name: /Press de banca con barra/ }).click();
  await page.getByRole('button', { name: 'Guardar rutina' }).click();
  await expect(page.getByRole('button', { name: 'Fuerza de prueba 1 ejercicio' })).toBeVisible();

  await page.getByRole('button', { name: 'Empezar entrenamiento', exact: true }).click();
  await expect(page.locator('.color-field')).toHaveCount(0);
  await page.getByRole('combobox', { name: 'Rutina', exact: true }).selectOption({ label: 'Fuerza de prueba' });
  await page.getByRole('main').getByRole('button', { name: /Empezar entrenamiento/ }).click();
  await expect(page.getByLabel('Carga en kg, serie 1 de Press de banca con barra')).toBeVisible();
  await expect(page.locator('.color-field')).toHaveCount(0);
  await page.getByRole('button', { name: 'Finalizar entrenamiento' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Confirma al menos una serie' })).toBeVisible();
  await page.getByLabel('Carga en kg, serie 1 de Press de banca con barra').fill('50');
  await page.getByLabel('Repeticiones, serie 1 de Press de banca con barra').fill('8');
  await page.getByRole('button', { name: 'Confirmar serie 1' }).click();
  await expect(page.getByRole('button', { name: 'Realizada 1' })).toBeVisible();
  await expect(page.getByRole('status')).toContainText('Guardado en este dispositivo');

  await page.reload();
  await page.getByRole('button', { name: /Continuar entrenamiento/ }).click();
  await expect(page.getByLabel('Carga en kg, serie 1 de Press de banca con barra')).toHaveValue('50');
  await expect(page.getByLabel('Repeticiones, serie 1 de Press de banca con barra')).toHaveValue('8');
  await expect(page.getByRole('button', { name: 'Realizada 1' })).toBeVisible();
  page.once('dialog', async dialog => {
    expect(dialog.message()).toContain('2 series sin confirmar');
    await dialog.accept();
  });
  await page.getByRole('button', { name: 'Finalizar entrenamiento' }).click();
  await expect(page.getByRole('dialog', { name: 'OTRO NIVEL.' })).toBeVisible();
  await page.getByRole('button', { name: 'A por el siguiente nivel' }).click();
  await expect(page.getByRole('heading', { name: 'Resumen' })).toBeVisible();
  await expect(page.getByRole('status')).toContainText('Guardado en este dispositivo');
  await expect(page.locator('.stat-card').filter({ hasText: 'Series' }).locator('strong')).toHaveText('1');
  await expect(page.locator('.stat-card').filter({ hasText: 'Repeticiones' }).locator('strong')).toHaveText('8');
  await expect(page.locator('.stat-card').filter({ hasText: 'Volumen' }).locator('strong')).toHaveText('400');

  await page.reload();
  await page.getByRole('navigation').getByRole('button', { name: 'Calendario' }).click();
  const today = page.locator('.day.today');
  await expect(today).toHaveAccessibleName(/1 entrenamiento/);
  await expect(today.locator('.day-number')).toHaveCSS('background-color', 'rgb(216, 255, 62)');
  await expect(today.locator('.day-number')).toHaveCSS('color', 'rgb(33, 23, 41)');
  await page.getByRole('button', { name: /Fuerza de prueba/ }).click();
  await expect(page.getByText('50 kg × 8 reps')).toBeVisible();
});
