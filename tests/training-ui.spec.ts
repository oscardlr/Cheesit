import { test, expect } from '@playwright/test';
import { todayMadrid, addDays } from '../src/lib/dates';
import { normalizeGame } from '../src/lib/game';
import { newWorkout, newSet, type AppData } from '../src/lib/model';

test('training, routines and progress fit four widths and keep keyboard navigation usable', async ({ page }, testInfo) => {
  test.setTimeout(90000);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const today = todayMadrid();
  const draft = newWorkout();
  draft.exercises = [{ id: crypto.randomUUID(), exerciseId: 'press-banca-barra', name: 'Press de banca con barra', group: 'Pecho', mode: 'external_load_reps', loadConvention: 'total', sets: [{ ...newSet(), weight: 50, reps: 8 }] }];
  const previous = { ...structuredClone(draft), id: crypto.randomUUID(), status: 'finished' as const, date: addDays(today, -1), exercises: draft.exercises.map(ex => ({ ...ex, id: crypto.randomUUID(), sets: [{ ...newSet(), weight: 45, reps: 8, confirmed: true }] })) };
  const data: AppData = { routines: [{ id: crypto.randomUUID(), name: 'Rutina de prueba con un nombre largo y descriptivo', color: '#6638A6', archived: false, exercises: [{ id: crypto.randomUUID(), exerciseId: 'press-banca-barra', sets: 3, repsMin: 8, repsMax: 12, targetWeight: 50, restSeconds: 90 }] }], workouts: [previous, draft], customExercises: [], game: normalizeGame(), preferences: { effects: false, sound: false } };
  await page.goto('/manifest.webmanifest');
  await page.evaluate(async value => {
    sessionStorage.setItem('grind-intro-v1', '1');
    const db = await new Promise<IDBDatabase>((resolve, reject) => { const request = indexedDB.open('entrenos-local', 1); request.onupgradeneeded = () => request.result.createObjectStore('state'); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    await new Promise<void>((resolve, reject) => { const tx = db.transaction('state', 'readwrite'); tx.objectStore('state').put(value, 'local'); tx.objectStore('state').put(0, 'local-revision'); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); });
    db.close();
  }, data);
  await page.goto(`/#view=editor&id=${draft.id}`);
  await expect(page.getByRole('heading', { name: 'Entrenamiento', exact: true })).toBeVisible();
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    const check = async (name: string) => {
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), `${name} at ${width}`).toBeLessThanOrEqual(1);
    };
    await check('Session');
    if (width === 390 || width === 1440) await page.screenshot({ path: testInfo.outputPath(`session-${width}.png`), fullPage: true, animations: 'disabled' });
    await page.getByRole('button', { name: 'Ver progreso', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Progreso', exact: true })).toBeVisible();
    await check('Progress');
    await expect(page.locator('.progress-table tbody tr')).toHaveCount(1);
    await page.getByRole('button', { name: 'Volver', exact: true }).click();
    await page.getByRole('navigation').getByRole('button', { name: 'Rutinas', exact: true }).click();
    await page.locator('.routine-main').click();
    await check('Routine');
    await page.getByRole('button', { name: 'Volver', exact: true }).click();
    await page.getByRole('navigation').getByRole('button', { name: 'Resumen', exact: true }).click();
    await page.locator('.draft-card').filter({ hasText: 'Continuar entrenamiento' }).click();
  }
  // Browser zoom reflows against a smaller CSS viewport; CSS zoom does not change
  // media queries and would incorrectly retain the desktop sidebar here.
  await page.setViewportSize({ width: 384, height: 500 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), '200% reflow equivalent on a 768px viewport').toBeLessThanOrEqual(1);
  await expect(page.getByLabel('Carga en kg, serie 1 de Press de banca con barra')).toHaveCSS('font-size', '16px');
  await page.getByRole('navigation').getByRole('button', { name: 'Rutinas', exact: true }).click();
  await page.locator('.routine-main').click();
  await page.getByLabel('Nombre de la rutina', { exact: true }).fill('Cambio pendiente');
  await page.getByRole('navigation').getByRole('button', { name: 'Resumen', exact: true }).click();
  const modal = page.getByRole('dialog', { name: 'Cambios pendientes' });
  await expect(modal).toBeVisible();
  await modal.getByRole('button', { name: 'Seguir editando' }).focus();
  await page.keyboard.press('Tab');
  await expect(modal.getByRole('button', { name: 'Cerrar', exact: true })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(modal.getByRole('button', { name: 'Seguir editando' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(modal).toHaveCount(0);
  expect(errors).toEqual([]);
});
