import { test, expect, type Page } from '@playwright/test';
import { CATALOG } from '../src/lib/catalog';
import { addDays, todayMadrid } from '../src/lib/dates';
import { emptyData, exerciseSnapshot, newId, newSet, newWorkout, type AppData, type Routine } from '../src/lib/model';
import { normalizeGame } from '../src/lib/game';

async function seed(page: Page) {
  const routine: Routine = { id: newId(), name: 'Fuerza A', color: '#d8ff3e', archived: false, exercises: ['press-banca-barra', 'remo-polea-baja'].map(exerciseId => ({ id: newId(), exerciseId, sets: 2, targetWeight: 20, repsMin: 8 })) };
  const workout = { ...newWorkout(), date: addDays(todayMadrid(), -1), status: 'finished' as const, exercises: [{ id: newId(), ...exerciseSnapshot(CATALOG.find(ex => ex.id === 'press-banca-barra')!), sets: [{ ...newSet(), weight: 40, reps: 8, confirmed: true }] }] };
  const data: AppData = { ...emptyData(), routines: [routine], workouts: [workout], game: normalizeGame(), preferences: { effects: false, sound: false }, training: { moments: [], weeklyGoals: [], cycles: [{ id: newId(), name: 'Split existente', routineIds: [routine.id], position: 0, completedWorkoutIds: [] }] } };
  await page.goto('/');
  await page.evaluate(data => new Promise<void>((resolve, reject) => {
    const r = indexedDB.open('cheesit-guest', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('state');
    r.onerror = () => reject(r.error);
    r.onsuccess = () => { const db = r.result, tx = db.transaction('state', 'readwrite'); tx.objectStore('state').put(data, 'local'); tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = () => reject(tx.error); };
  }), data);
  await page.getByRole('button', { name: 'Continuar como invitado', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Resumen', exact: true })).toBeVisible();
}

async function read(page: Page): Promise<AppData> {
  return page.evaluate(() => new Promise((resolve, reject) => {
    const r = indexedDB.open('cheesit-guest', 1); r.onerror = () => reject(r.error);
    r.onsuccess = () => { const db = r.result, tx = db.transaction('state'), q = tx.objectStore('state').get('local'); tx.oncomplete = () => { db.close(); resolve(q.result); }; };
  }));
}

for (const width of [320, 1440]) test(`button choices, superseries switch, splits, progress filters and collection order at ${width}px`, async ({ page }, info) => {
  test.setTimeout(60000);
  await page.setViewportSize({ width, height: 950 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await seed(page);
  await expect(page.getByRole('heading', { name: 'Tus splits', exact: true })).toBeVisible();
  await page.locator('.cycle-card').getByRole('button', { name: 'Iniciar próxima →' }).click();
  const type = page.getByRole('group', { name: 'Tipo de serie 1 de Press de banca con barra', exact: true });
  await expect(type.getByRole('button', { name: 'Serie de trabajo', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(type.getByRole('combobox')).toHaveCount(0);
  await type.getByRole('button', { name: 'Calentamiento', exact: true }).click();
  await expect(type.getByRole('button', { name: 'Calentamiento', exact: true })).toHaveAttribute('aria-pressed', 'true');
  const firstSwitch = page.getByRole('switch', { name: 'Superserie de Press de banca con barra', exact: true });
  const secondSwitch = page.getByRole('switch', { name: 'Superserie de Remo en polea baja', exact: true });
  const choices = page.locator('.exercise-card').first().locator('.superset-exercises');
  await expect(firstSwitch).not.toBeChecked(); await expect(choices).toBeHidden();
  await firstSwitch.press('Space'); await expect(firstSwitch).toBeChecked(); await expect(choices).toBeVisible();
  await secondSwitch.click();
  await page.locator('.exercise-card').nth(1).locator('.superset-exercises').getByRole('button', { name: 'Press de banca con barra', exact: true }).click();
  await expect(secondSwitch).toBeChecked(); await expect(page.locator('.superset-badge')).toHaveText(['A1 · Superserie', 'A2 · Superserie']);
  await secondSwitch.click(); await expect(firstSwitch).not.toBeChecked(); await expect(page.locator('.superset-badge')).toHaveCount(0);
  await firstSwitch.click(); await choices.getByRole('button', { name: 'Remo en polea baja', exact: true }).click();
  await expect.poll(async () => (await read(page)).workouts.find(w => w.status === 'draft')?.exercises[0].sets[0].kind).toBe('warmup');
  await expect.poll(async () => Boolean((await read(page)).workouts.find(w => w.status === 'draft')?.exercises[1].supersetId)).toBe(true);
  await page.reload(); await expect(firstSwitch).toBeChecked();
  await expect(type.getByRole('button', { name: 'Calentamiento', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.locator('.exercise-card').first().screenshot({ path: info.outputPath(`training-controls-${width}.png`) });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);

  const nav = page.getByRole('navigation', { name: 'Navegación principal' });
  await nav.getByRole('button', { name: 'Progreso', exact: true }).click();
  await expect(page.getByRole('combobox')).toHaveCount(0);
  const groups = page.getByRole('group', { name: 'Grupo muscular', exact: true });
  await groups.getByRole('button', { name: 'Pecho', exact: true }).click();
  const search = page.getByRole('searchbox', { name: 'Buscar ejercicio', exact: true });
  await expect(search).toHaveAttribute('placeholder', 'Buscar ejercicio'); await search.fill('remo');
  await expect(page.getByRole('status').filter({ hasText: 'No hay ejercicios' })).toBeVisible();
  await groups.getByRole('button', { name: 'Espalda', exact: true }).click();
  await expect(page.locator('.progress-search-list .list-row')).toHaveCount(3);
  await search.fill('JALON'); await expect(page.locator('.progress-search-list .list-row')).toHaveCount(1);
  await page.locator('.progress-search-list').getByRole('button', { name: /Jalón al pecho/ }).click();
  await expect(page.locator('.progress-hero')).toContainText('Jalón al pecho');
  await page.getByRole('button', { name: 'Cambiar ejercicio', exact: true }).click();
  await groups.getByRole('button', { name: 'Pecho', exact: true }).click(); await search.fill('banca');
  await page.locator('.progress-search-list').getByRole('button', { name: /Press de banca con barra/ }).click();
  await page.getByRole('group', { name: 'Métrica', exact: true }).getByRole('button', { name: 'Repeticiones', exact: true }).click();
  await expect(page.locator('.progress-table tbody tr')).toHaveCount(1);
  await page.getByRole('group', { name: 'Periodo', exact: true }).getByRole('button', { name: 'Últimos 30 días', exact: true }).click();
  await expect(page.getByRole('combobox')).toHaveCount(0);
  await page.screenshot({ path: info.outputPath(`progress-buttons-${width}.png`), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);

  await nav.getByRole('button', { name: 'Rutinas', exact: true }).click();
  await expect(page.getByRole('button', { name: '＋ Crear split', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Fuerza A 2 ejercicios', exact: true }).click();
  await type.getByRole('button', { name: 'Calentamiento', exact: true }).click();
  await page.getByRole('button', { name: 'Guardar rutina', exact: true }).click();
  await expect.poll(async () => (await read(page)).routines[0].exercises[0].setKinds?.[0]).toBe('warmup');
  await nav.getByRole('button', { name: 'Arcade', exact: true }).click();
  await page.getByRole('button', { name: 'Personalizar personaje', exact: true }).click();
  const tabs = page.getByRole('navigation', { name: 'Organizar colección' });
  await expect(tabs.getByRole('button')).toHaveText(['Aspectos', 'Habilidades', 'Inventario']);
  await tabs.screenshot({ path: info.outputPath(`collection-order-${width}.png`) });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
});
