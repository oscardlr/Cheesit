import { test, expect, type Page } from '@playwright/test';
import { emptyData, newSet, newWorkout, type AppData } from '../src/lib/model';
import { normalizeGame } from '../src/lib/game';

test.use({ reducedMotion: 'reduce' });

async function seed(page: Page, source: Partial<AppData> = {}) {
  const data: AppData = { ...emptyData(), game: normalizeGame(), preferences: { effects: false, sound: false }, ...source };
  await page.goto('/manifest.webmanifest');
  await page.evaluate(async value => {
    sessionStorage.setItem('grind-intro-v1', '1');
    localStorage.setItem('entrenos-experience-v1', JSON.stringify(value.preferences));
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('entrenos-local', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('state');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('state', 'readwrite');
      tx.objectStore('state').put(value, 'local');
      tx.objectStore('state').put(0, 'local-revision');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }, data);
}

async function stored(page: Page): Promise<AppData> {
  return page.evaluate(async () => new Promise<AppData>((resolve, reject) => {
    const request = indexedDB.open('entrenos-local', 1);
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction('state', 'readonly');
      const read = tx.objectStore('state').get('local');
      tx.oncomplete = () => { db.close(); resolve(read.result); };
      tx.onerror = () => reject(tx.error);
    };
    request.onerror = () => reject(request.error);
  }));
}

test('calendar has inert gaps, accurate February/leap/Sunday layouts and working selection', async ({ page }) => {
  const workout = { ...newWorkout(), name: 'Sesión bisiesta', date: '2024-02-29', status: 'finished' as const };
  await seed(page, { workouts: [workout] });
  for (const [date, days, leading, total] of [
    ['2021-02-01', 28, 0, 28], ['2024-02-01', 29, 3, 35], ['2026-02-01', 28, 6, 35], ['2026-03-01', 31, 6, 42],
  ] as const) {
    await page.goto(`/#view=calendar&date=${date}`);
    const grid = page.locator('.calendar-grid');
    await expect(grid.locator('button')).toHaveCount(days);
    await expect(grid.locator('.calendar-blank')).toHaveCount(total - days);
    expect(await grid.locator(':scope > *').evaluateAll((elements, offset) => elements.slice(0, offset).every(el => el.tagName === 'SPAN' && el.textContent === '' && el.getAttribute('aria-hidden') === 'true' && !el.hasAttribute('tabindex')), leading)).toBe(true);
    expect(await grid.locator('button .day-number').allTextContents()).toEqual(Array.from({ length: days }, (_, index) => String(index + 1)));
  }
  await page.goto('/#view=calendar&date=2024-02-29');
  const selected = page.locator('.calendar-grid').getByRole('button', { name: /29 de febrero de 2024.*1 entrenamiento/ });
  await expect(selected).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: /Sesión bisiesta/ })).toBeVisible();
  await page.getByRole('button', { name: 'Mes siguiente', exact: true }).click();
  await expect(page.locator('.calendar-title h2')).toHaveText('marzo de 2024');
  await page.getByRole('button', { name: 'Mes anterior', exact: true }).click();
  await expect(selected).toHaveAttribute('aria-pressed', 'true');
  await page.locator('.calendar-grid').getByRole('button', { name: /^28 de febrero/ }).click();
  await expect(page.getByText('No hay entrenamientos este día.', { exact: true })).toBeVisible();
});

for (const width of [390, 1440]) test(`summary, calendar, routine create/edit and session at ${width}px`, async ({ page }, testInfo) => {
  test.setTimeout(90000);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width, height: 1000 });
  const routineId = crypto.randomUUID();
  const draft = newWorkout();
  draft.exercises = [{ id: crypto.randomUUID(), exerciseId: 'press-banca-barra', name: 'Press de banca con barra', group: 'Pecho', mode: 'external_load_reps', sets: [{ ...newSet(), weight: 50, reps: 8 }] }];
  await seed(page, { routines: [{ id: routineId, name: 'Rutina anterior', color: '#6638A6', archived: false, exercises: [{ id: crypto.randomUUID(), exerciseId: 'press-banca-barra', sets: 3 }] }], workouts: [draft] });
  const capture = async (name: string) => {
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), name).toBeLessThanOrEqual(1);
    await page.screenshot({ path: testInfo.outputPath(`${name}-${width}.png`), fullPage: true, animations: 'disabled' });
  };
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Resumen', exact: true })).toBeVisible();
  await expect(page.locator('.hero-card')).toHaveCount(0);
  await expect(page.locator('.summary-start img')).toHaveAttribute('src', '/assets/grind-dumbbell.webp');
  await expect(page.locator('.starter-top .lucide-dumbbell')).toBeVisible();
  const settings = page.getByRole('button', { name: 'Ajustes de Cheesit', exact: true });
  await expect(settings).toHaveText('');
  const box = await settings.boundingBox();
  expect(box!.width).toBeGreaterThanOrEqual(44);
  expect(box!.height).toBeGreaterThanOrEqual(44);
  await capture('summary');
  if (width === 390) {
    for (const smallWidth of [320, 360]) {
      await page.setViewportSize({ width: smallWidth, height: 1000 });
      const brandBox = await page.locator('.brand').boundingBox();
      const actionsBox = await page.locator('.topbar-actions').boundingBox();
      expect(brandBox!.x + brandBox!.width).toBeLessThanOrEqual(actionsBox!.x);
      await expect(settings).toBeInViewport();
      await capture('summary-small');
    }
    await page.setViewportSize({ width, height: 1000 });
  }
  await page.getByRole('navigation').getByRole('button', { name: 'Calendario', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Calendario', exact: true })).toBeVisible();
  await capture('calendar');
  await page.getByRole('navigation').getByRole('button', { name: 'Rutinas', exact: true }).click();
  await page.locator('.routine-main').click();
  await expect(page.getByRole('button', { name: 'Color actual (anterior)', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByLabel('Nombre de la rutina', { exact: true })).not.toHaveAttribute('placeholder', 'Opcional');
  await expect(page.getByLabel('Series previstas', { exact: true })).not.toHaveAttribute('placeholder', 'Opcional');
  for (const label of ['Notas de la rutina', 'Repeticiones mínimas', 'Repeticiones máximas', 'Carga objetivo, en kg', 'Descanso, en segundos', 'Notas del ejercicio']) {
    await expect(page.getByLabel(label, { exact: true })).toHaveAttribute('placeholder', 'Opcional');
    await expect(page.getByLabel(label, { exact: true })).toHaveValue('');
  }
  await expect(page.locator('.exercise-head img')).toBeVisible();
  for (const [label, value] of [['Carga objetivo, en kg', '22.5'], ['Repeticiones mínimas', '8'], ['Descanso, en segundos', '0']]) {
    await page.getByLabel(label, { exact: true }).fill(value);
    await page.getByLabel(label, { exact: true }).fill('');
  }
  await page.getByRole('button', { name: 'Icono Montaña', exact: true }).click();
  await capture('routine-edit');
  await page.getByRole('button', { name: 'Guardar rutina', exact: true }).click();
  await expect.poll(async () => (await stored(page)).routines[0].icon).toBe('mountain');
  const saved = (await stored(page)).routines[0];
  expect(saved.color).toBe('#6638A6');
  expect(saved.exercises[0].targetWeight).toBeUndefined();
  expect(saved.exercises[0].repsMin).toBeUndefined();
  expect(saved.exercises[0].restSeconds).toBeUndefined();
  await expect(page.locator('.routine-main .lucide-mountain')).toBeVisible();
  await page.getByRole('button', { name: 'Duplicar Rutina anterior', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Icono Montaña', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Guardar rutina', exact: true }).click();
  await expect.poll(async () => (await stored(page)).routines.length).toBe(2);
  expect((await stored(page)).routines[1].icon).toBe('mountain');
  await page.getByRole('button', { name: '＋ Crear rutina', exact: true }).click();
  await page.getByLabel('Nombre de la rutina', { exact: true }).fill('Rutina nueva');
  await page.getByRole('button', { name: 'Icono Objetivo', exact: true }).click();
  await page.getByRole('button', { name: 'Color jade', exact: true }).click();
  await page.getByRole('button', { name: '＋ Añadir ejercicio', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Añadir ejercicio' }).locator('img').first()).toBeVisible();
  await page.getByRole('button', { name: /Press de banca con barra.*Pecho/ }).click();
  await capture('routine-create');
  await page.getByRole('button', { name: 'Guardar rutina', exact: true }).click();
  await expect.poll(async () => (await stored(page)).routines.length).toBe(3);
  await page.reload();
  await expect(page.locator('.routine-main .lucide-target')).toBeVisible();
  await page.getByRole('navigation').getByRole('button', { name: 'Resumen', exact: true }).click();
  await expect(page.locator('.starter-top .lucide-mountain')).toHaveCount(2);
  await page.locator('.draft-card').filter({ hasText: 'Continuar entrenamiento' }).click();
  await expect(page.getByRole('heading', { name: 'Entrenamiento', exact: true })).toBeVisible();
  await expect(page.locator('.exercise-head img')).toBeVisible();
  expect(await page.locator('.exercise-head img').evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
  await capture('session');
  expect(errors).toEqual([]);
});
