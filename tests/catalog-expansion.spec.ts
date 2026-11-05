import { expect, test } from '@playwright/test';

test('finds the expanded catalog by alias, muscle and equipment, then logs an exercise', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Continuar como invitado' }).click();
  const train = page.getByRole('navigation').getByRole('button', { name: 'Entrenar', exact: true });
  await train.click();
  await page.getByRole('button', { name: 'Catálogo de ejercicios', exact: true }).click();

  await page.getByRole('button', { name: 'Espalda', exact: true }).click();
  await page.getByRole('combobox', { name: 'Material', exact: true }).selectOption('Mancuernas');
  await page.getByLabel('Buscar ejercicio').fill('encogimientos');
  await expect(page.getByRole('button', { name: /Encogimientos de trapecio con mancuernas/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Encogimientos de trapecio con barra/ })).toHaveCount(0);

  await page.getByRole('combobox', { name: 'Material', exact: true }).selectOption('Polea');
  await page.getByRole('button', { name: 'Limpiar búsqueda y filtros' }).click();
  await expect(page.getByRole('combobox', { name: 'Material', exact: true })).toHaveValue('');
  await expect(page.getByRole('button', { name: 'Todos', exact: true })).toHaveAttribute('aria-pressed', 'true');

  await page.getByRole('combobox', { name: 'Material', exact: true }).selectOption('Polea');
  await page.getByRole('button', { name: 'Espalda', exact: true }).click();
  await page.getByLabel('Buscar ejercicio').fill('jalon con brazos rectos');
  await page.getByRole('button', { name: 'Ficha técnica pullover-polea-alta' }).click();
  const guide = page.getByRole('region', { name: 'Ficha: Pullover en polea alta' });
  await expect(guide).toContainText('Polea alta y barra recta');
  await expect.poll(() => guide.locator('img').evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);

  await page.getByRole('button', { name: 'Volver', exact: true }).click();
  await page.getByRole('button', { name: 'Empezar entreno', exact: true }).click();
  await page.getByRole('main').getByRole('button', { name: 'Empezar sin rutina', exact: true }).click();
  await page.getByRole('button', { name: 'Añadir ejercicio', exact: true }).click();
  const picker = page.getByRole('dialog', { name: 'Añadir ejercicio' });
  await picker.getByRole('button', { name: 'Hombro', exact: true }).click();
  await picker.getByRole('combobox', { name: 'Material', exact: true }).selectOption('Polea');
  await picker.getByLabel('Buscar ejercicio').fill('face pulls');
  await picker.getByRole('button', { name: /Face pull con cuerda/ }).click();
  await expect(picker).toBeHidden();

  await page.getByLabel('Carga en kg, serie 1 de Face pull con cuerda').fill('20');
  await page.getByLabel('Repeticiones, serie 1 de Face pull con cuerda').fill('12');
  await page.getByRole('button', { name: 'Confirmar serie 1' }).click();
  await expect(page.getByRole('button', { name: 'Realizada 1' })).toBeVisible();

  await page.reload();
  await expect(page.getByLabel('Carga en kg, serie 1 de Face pull con cuerda')).toHaveValue('20');
  await expect(page.getByLabel('Repeticiones, serie 1 de Face pull con cuerda')).toHaveValue('12');
  await expect(page.getByRole('button', { name: 'Realizada 1' })).toBeVisible();
});
