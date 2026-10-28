import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { createBackup, previewBackup } from '../src/lib/backup';
import { todayMadrid, addDays } from '../src/lib/dates';
import { awardMissionRewards, normalizeGame } from '../src/lib/game';
import { emptyData, newWorkout, newSet, type AppData, type Routine, type Workout, type WorkoutExercise } from '../src/lib/model';
import { DEFAULT_PROFILE } from '../src/lib/strength';

test.use({ reducedMotion: 'reduce' });
const today = todayMadrid();
const yesterday = addDays(today, -1);
const exerciseName = 'Press de banca con barra';
const weightLabel = (row: number) => `Carga en kg, serie ${row} de ${exerciseName}`;
const repsLabel = (row: number) => `Repeticiones, serie ${row} de ${exerciseName}`;
const exercise = (weights: (number | null)[], confirmed = false): WorkoutExercise => ({ id: crypto.randomUUID(), exerciseId: 'press-banca-barra', name: exerciseName, group: 'Pecho', mode: 'external_load_reps', loadConvention: 'total', sets: weights.map(weight => ({ ...newSet(), weight, reps: weight === null ? null : 8, confirmed })) });
const workout = (name: string, status: Workout['status'] = 'draft', date = today, weights: (number | null)[] = [null]): Workout => ({ ...newWorkout(), date, name, status, createdAt: `${date}T08:00:00Z`, updatedAt: `${date}T08:00:00Z`, exercises: [exercise(weights, status === 'finished')] });
const routine = (): Routine => ({ id: crypto.randomUUID(), name: 'Rutina fiable', color: '#6638A6', archived: false, exercises: [{ id: crypto.randomUUID(), exerciseId: 'press-banca-barra', sets: 3 }] });

async function seed(page: Page, source: Partial<AppData> = {}) {
  const data: AppData = { ...emptyData(), profile: { ...DEFAULT_PROFILE }, preferences: { effects: false, sound: false }, ...source };
  data.game = awardMissionRewards(normalizeGame(data.game), data.workouts, today);
  // Seed on a same-origin resource before React starts, avoiding races with app autosaves.
  await page.goto('/manifest.webmanifest');
  await page.evaluate(async value => {
    localStorage.setItem('entrenos-experience-v1', JSON.stringify({ effects: false, sound: false }));
    sessionStorage.setItem('grind-intro-v1', '1');
    await new Promise<void>((resolve, reject) => {
      const open = indexedDB.open('entrenos-local', 1);
      open.onupgradeneeded = () => { if (!open.result.objectStoreNames.contains('state')) open.result.createObjectStore('state'); };
      open.onerror = () => reject(open.error);
      open.onsuccess = () => {
        const db = open.result;
        const tx = db.transaction('state', 'readwrite');
        tx.objectStore('state').put(value, 'local');
        tx.objectStore('state').put(0, 'local-revision');
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => { db.close(); reject(tx.error); };
      };
    });
  }, data);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Resumen', exact: true })).toBeVisible();
  return data;
}

async function stored(page: Page): Promise<AppData> {
  return page.evaluate(async () => await new Promise<AppData>((resolve, reject) => {
    const open = indexedDB.open('entrenos-local', 1);
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const tx = db.transaction('state', 'readonly');
      const request = tx.objectStore('state').get('local');
      tx.oncomplete = () => { db.close(); resolve(request.result); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    };
  }));
}

async function openDraft(page: Page, name?: string) {
  if (new URL(page.url()).hash.includes('view=editor')) { await expect(page.getByLabel(weightLabel(1))).toBeVisible(); return; }
  if (await page.getByLabel(weightLabel(1)).count()) return;
  const card = page.locator('.draft-card').filter(name ? { hasText: name } : {}).first();
  await card.click();
  await expect(page.getByLabel(weightLabel(1))).toBeVisible();
}

async function exportPending(page: Page): Promise<ReturnType<typeof createBackup>> {
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exportar lo pendiente', exact: true }).last().click();
  const file = await download;
  const path = await file.path();
  expect(path).not.toBeNull();
  return JSON.parse(await readFile(path!, 'utf8')) as ReturnType<typeof createBackup>;
}

test('all draft identifiers remain reachable and same-day sessions count as one training day', async ({ page }) => {
  const one = workout('Mañana', 'finished');
  const two = workout('Tarde', 'finished'); two.createdAt = `${today}T16:00:00Z`;
  const pendingYesterday = workout('Pendiente ayer', 'draft', yesterday);
  const pendingToday = workout('Pendiente hoy');
  await seed(page, { workouts: [one, two, pendingYesterday, pendingToday] });
  await expect(page.locator('.week-count')).toHaveText('1/ 3');
  await expect(page.locator('.draft-card')).toHaveCount(2);
  await openDraft(page, 'Pendiente ayer');
  await page.getByRole('navigation').getByRole('button', { name: 'Resumen', exact: true }).click();
  await openDraft(page, 'Pendiente hoy');
  await page.getByRole('navigation').getByRole('button', { name: 'Empezar entrenamiento', exact: true }).click();
  await page.getByRole('main').getByLabel('Nombre', { exact: true }).fill('Tercera sesión hoy');
  await page.getByRole('main').getByRole('button', { name: 'Empezar entrenamiento', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Entrenamiento', exact: true })).toBeVisible();
  await expect.poll(async () => (await stored(page)).workouts.filter(value => value.status === 'draft').length).toBe(3);
  await page.getByRole('navigation').getByRole('button', { name: 'Calendario', exact: true }).click();
  await expect(page.locator('.day.today')).toHaveAccessibleName(/2 entrenamientos/);
  await expect(page.locator('.draft-inline')).toHaveCount(2);
});

test('fractional routine sets are rejected and an incomplete routine survives reload', async ({ page }) => {
  const saved = routine();
  await seed(page, { routines: [saved] });
  await page.getByRole('navigation').getByRole('button', { name: 'Rutinas', exact: true }).click();
  await page.getByRole('button', { name: 'Rutina fiable 1 ejercicio', exact: true }).click();
  await page.getByLabel('Series previstas', { exact: true }).fill('2.5');
  await page.getByRole('button', { name: 'Guardar rutina', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Editar rutina', exact: true })).toBeVisible();
  await expect(page.getByText('Las series previstas deben ser un entero entre 1 y 20.')).toBeVisible();
  expect((await stored(page)).routines[0].exercises[0].sets).toBe(3);
  await expect.poll(async () => (await stored(page)).routineDraft?.exercises[0].sets).toBe(2.5);
  page.on('dialog', dialog => dialog.accept());
  await page.reload();
  await expect(page.getByLabel('Series previstas', { exact: true })).toHaveValue('2.5');
  await page.getByLabel('Series previstas', { exact: true }).fill('2');
  await page.getByRole('button', { name: 'Guardar rutina', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Rutinas', exact: true })).toBeVisible();
  expect((await stored(page)).routines[0].exercises[0].sets).toBe(2);
  expect((await stored(page)).routineDraft).toBeUndefined();
});

test('a recovered routine remains available while navigating other screens', async ({ page }) => {
  const saved = routine();
  const recovery = { ...saved, name: 'Rutina por revisar', exercises: saved.exercises.map(item => ({ ...item, sets: 2.5 })) };
  await seed(page, { routines: [saved], routineDraft: recovery });
  await page.getByRole('button', { name: 'Ajustes de Cheesit', exact: true }).click();
  await page.getByRole('navigation').getByRole('button', { name: 'Calendario', exact: true }).click();
  await page.getByRole('navigation').getByRole('button', { name: 'Resumen', exact: true }).click();
  await page.getByRole('button', { name: /Revisar rutina pendiente/ }).click();
  await expect(page.getByLabel('Nombre de la rutina', { exact: true })).toHaveValue('Rutina por revisar');
  await expect(page.getByLabel('Series previstas', { exact: true })).toHaveValue('2.5');
  expect((await stored(page)).routineDraft?.name).toBe('Rutina por revisar');
});

test('opening a new routine preserves an unseen recovered routine until explicitly resolved', async ({ page }) => {
  const saved = routine();
  const recovery = { ...saved, name: 'No perder esta edición', exercises: saved.exercises.map(item => ({ ...item, sets: null })) };
  await seed(page, { routines: [saved], routineDraft: recovery });
  await page.getByRole('navigation').getByRole('button', { name: 'Rutinas', exact: true }).click();
  await page.getByRole('button', { name: '＋ Crear rutina', exact: true }).click();
  await expect(page.getByLabel('Nombre de la rutina', { exact: true })).toHaveValue('No perder esta edición');
  await expect(page.getByText('Hay una rutina pendiente de revisar. Guárdala o descártala antes de abrir otra.', { exact: true })).toBeVisible();
  expect((await stored(page)).routineDraft?.id).toBe(saved.id);
});

test('saving a legacy pair-load session as routine preserves physical target load', async ({ page }) => {
  const legacy = workout('Sesión legacy', 'finished', yesterday, [40]);
  legacy.exercises = [{ ...exercise([40], true), exerciseId: 'press-inclinado-mancuernas', name: 'Press inclinado con mancuernas', loadConvention: 'total' }];
  await seed(page, { workouts: [legacy] });
  await page.getByRole('navigation').getByRole('button', { name: 'Calendario', exact: true }).click();
  const day = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${yesterday}T12:00:00Z`));
  await page.locator('.calendar-grid').getByRole('button', { name: new RegExp(`^${day}`) }).click();
  await page.getByRole('button', { name: /Sesión legacy/ }).click();
  await page.getByRole('button', { name: 'Guardar como rutina', exact: true }).click();
  await expect(page.getByLabel('Carga objetivo, en kg', { exact: true })).toHaveValue('20');
  await page.getByRole('button', { name: 'Guardar rutina', exact: true }).click();
  await page.getByRole('navigation').getByRole('button', { name: 'Empezar entrenamiento', exact: true }).click();
  await page.getByRole('combobox', { name: 'Rutina', exact: true }).selectOption({ label: 'Sesión legacy' });
  await page.getByRole('main').getByRole('button', { name: 'Empezar entrenamiento', exact: true }).click();
  await expect(page.getByLabel('Carga en kg, serie 1 de Press inclinado con mancuernas', { exact: true })).toHaveValue('20');
  const retained = (await stored(page)).workouts.find(value => value.id === legacy.id)!;
  expect(retained.exercises[0].sets[0].weight).toBe(40);
  expect(retained.exercises[0].loadConvention).toBe('total');
});

test('copying a third previous row creates missing rows and copying all never confirms them', async ({ page }) => {
  await seed(page, { workouts: [workout('Anterior', 'finished', yesterday, [50, 55, 60]), workout('Actual')] });
  await openDraft(page);
  await page.getByRole('button', { name: /60 kg.*Copiar serie 3/ }).click();
  await expect(page.getByLabel(weightLabel(3))).toHaveValue('60');
  await expect(page.getByLabel(weightLabel(2))).toHaveValue('');
  await expect(page.getByRole('button', { name: /^Confirmar serie/ })).toHaveCount(3);
  await page.getByRole('button', { name: 'Copiar todas las series', exact: true }).click();
  for (const [row, weight] of [[1, '50'], [2, '55'], [3, '60']] as const) await expect(page.getByLabel(weightLabel(row))).toHaveValue(weight);
  await expect(page.getByRole('button', { name: /^Realizada/ })).toHaveCount(0);
  await expect.poll(async () => (await stored(page)).workouts.find(value => value.name === 'Actual')!.exercises[0].sets.length).toBe(3);
  expect((await stored(page)).workouts.find(value => value.name === 'Actual')!.exercises[0].sets.every(set => !set.confirmed)).toBe(true);
});

test('paused and running rest timers recover their state after reload', async ({ page }) => {
  const pending = workout('Descanso');
  await seed(page, { workouts: [pending] });
  await openDraft(page);
  await page.getByText('Ajustar descanso', { exact: true }).click();
  await page.getByLabel('Segundos de descanso', { exact: true }).fill('120');
  await page.getByRole('button', { name: 'Iniciar descanso', exact: true }).click();
  await page.getByRole('button', { name: 'Pausar', exact: true }).click();
  await expect.poll(async () => (await stored(page)).workouts[0].restTimer?.endsAt).toBeNull();
  const paused = (await stored(page)).workouts[0].restTimer!.remainingSeconds;
  await page.reload(); await openDraft(page);
  await expect(page.getByRole('button', { name: 'Reanudar', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Reanudar', exact: true }).click();
  await expect.poll(async () => Boolean((await stored(page)).workouts[0].restTimer?.endsAt)).toBe(true);
  const endsAt = (await stored(page)).workouts[0].restTimer!.endsAt;
  await page.reload(); await openDraft(page);
  await expect(page.getByRole('button', { name: 'Pausar', exact: true })).toBeVisible();
  expect((await stored(page)).workouts[0].restTimer!.endsAt).toBe(endsAt);
  expect(paused).toBeGreaterThan(110);
});

for (const choice of ['local', 'incoming'] as const) test(`import conflict explicitly uses the ${choice} workout version`, async ({ page }) => {
  const saved = workout('Versión local', 'finished', yesterday, [50]);
  const source = await seed(page, { workouts: [saved] });
  const incoming = structuredClone(source); incoming.workouts[0].name = 'Versión de la copia';
  await page.getByRole('button', { name: 'Ajustes de Cheesit', exact: true }).click();
  await page.locator('input[type=file]').setInputFiles({ name: 'respaldo.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(createBackup(incoming))) });
  const modal = page.getByRole('dialog', { name: 'Revisar importación' });
  await expect(modal).toBeVisible();
  await expect(modal.getByRole('button', { name: 'Confirmar importación' })).toBeDisabled();
  await modal.getByRole('combobox', { name: 'Versión que conservar', exact: true }).selectOption(choice);
  await modal.getByRole('button', { name: 'Confirmar importación' }).click();
  await expect(modal).toHaveCount(0);
  await expect(page.getByText('Importación completada en este dispositivo.', { exact: true })).toBeVisible();
  expect((await stored(page)).workouts[0].name).toBe(choice === 'local' ? 'Versión local' : 'Versión de la copia');
  expect((await stored(page)).preferences).toEqual({ effects: false, sound: false });
});

test('a pristine installation restores backup preferences and athlete instead of first-run defaults', async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem('grind-intro-v1', '1'));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Resumen', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Ajustes de Cheesit', exact: true }).click();
  const source: AppData = { ...emptyData(), preferences: { effects: false, sound: false }, profile: { ...DEFAULT_PROFILE, weightKg: 83 } };
  await page.locator('input[type=file]').setInputFiles({ name: 'instalacion-anterior.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(createBackup(source))) });
  await page.getByRole('dialog', { name: 'Revisar importación' }).getByRole('button', { name: 'Confirmar importación' }).click();
  await expect(page.getByText('Importación completada en este dispositivo.', { exact: true })).toBeVisible();
  await expect(page.getByRole('switch', { name: 'Efectos y confeti', exact: true })).not.toBeChecked();
  await expect(page.getByRole('switch', { name: 'Sonido de victoria', exact: true })).not.toBeChecked();
  expect((await stored(page)).preferences).toEqual(source.preferences);
  expect((await stored(page)).profile?.weightKg).toBe(83);
});

test('failed finishing reports no success and supports exporting and retrying pending work', async ({ page }) => {
  const pending = workout('Sesión pendiente'); pending.exercises = [exercise([50], true)];
  await seed(page, { workouts: [pending] });
  await openDraft(page);
  await page.evaluate(() => {
    const state = window as Window & { __cheesitFailWrites?: boolean };
    const original = IDBObjectStore.prototype.put;
    state.__cheesitFailWrites = true;
    IDBObjectStore.prototype.put = function (this: IDBObjectStore, value: unknown, key?: IDBValidKey) {
      if (state.__cheesitFailWrites && this.name === 'state') throw new DOMException('Cuota de prueba agotada', 'QuotaExceededError');
      return key === undefined ? original.call(this, value) : original.call(this, value, key);
    };
  });
  await page.getByRole('button', { name: 'Finalizar entrenamiento', exact: true }).click();
  await expect(page.getByText('Cambios pendientes de guardar', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Entrenamiento', exact: true })).toBeVisible();
  await expect(page.locator('.celebration-workout')).toHaveCount(0);
  await expect(page.getByLabel(weightLabel(1))).toBeDisabled();
  await page.getByRole('navigation').getByRole('button', { name: 'Resumen', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Entrenamiento', exact: true })).toBeVisible();
  expect((await stored(page)).workouts[0].status).toBe('draft');
  const exported = await exportPending(page);
  expect(exported.data.workouts[0].exercises[0].sets[0].weight).toBe(50);
  expect(exported.data.workouts[0].exercises[0].sets[0].confirmed).toBe(true);
  expect(exported.data.workouts[0].status).toBe('finished');
  expect(() => previewBackup(exported, emptyData())).not.toThrow();
  await page.evaluate(() => { (window as Window & { __cheesitFailWrites?: boolean }).__cheesitFailWrites = false; });
  await page.getByRole('button', { name: 'Reintentar guardado', exact: true }).click();
  await expect(page.locator('.save-error-banner')).toHaveCount(0);
  await expect.poll(async () => (await stored(page)).workouts[0].status).toBe('finished');
  await expect(page.getByRole('heading', { name: 'Resumen', exact: true })).toBeVisible();
});

test('two tabs preserve committed history and export the other tabs pending routine edit', async ({ page, context }) => {
  const saved = routine();
  await seed(page, { routines: [saved] });
  const other = await context.newPage();
  await other.goto('/');
  await expect(other.getByRole('heading', { name: 'Resumen', exact: true })).toBeVisible();
  // Hold both debounce timers; the explicit Save in A still performs its real IDB transaction.
  for (const tab of [page, other]) {
    await tab.clock.install({ time: new Date() });
    await tab.clock.pauseAt(new Date(Date.now() + 100));
  }
  for (const tab of [page, other]) {
    await tab.getByRole('navigation').getByRole('button', { name: 'Rutinas', exact: true }).click();
    await tab.getByRole('button', { name: 'Rutina fiable 1 ejercicio', exact: true }).click();
  }
  await other.getByLabel('Nombre de la rutina', { exact: true }).fill('Edición pendiente B');
  await page.getByLabel('Nombre de la rutina', { exact: true }).fill('Guardada A');
  await page.getByRole('button', { name: 'Guardar rutina', exact: true }).click();
  await expect(other.getByRole('heading', { name: 'Otra pestaña ha guardado cambios' })).toBeVisible();
  expect((await stored(page)).routines[0].name).toBe('Guardada A');
  const exported = await exportPending(other);
  expect(exported.data.routineDraft?.name === 'Edición pendiente B' || exported.data.routines.some(value => value.name === 'Edición pendiente B')).toBe(true);
  await other.getByRole('button', { name: 'Recargar datos actuales', exact: true }).click();
  await expect(other.getByRole('heading', { name: 'Otra pestaña ha guardado cambios' })).toHaveCount(0);
  expect((await stored(other)).routines[0].name).toBe('Guardada A');
  await other.close();
});

test('blank draft date and raw incomplete inputs can be left, reloaded and restored safely', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  const pending = workout('Fecha pendiente');
  await seed(page, { workouts: [pending] });
  await openDraft(page);
  await page.getByLabel(weightLabel(1)).fill('12,');
  await page.getByLabel(repsLabel(1)).fill('0');
  await page.getByText('Detalles de la sesión', { exact: false }).click();
  await page.getByLabel('Fecha', { exact: true }).fill('');
  await page.getByRole('navigation').getByRole('button', { name: 'Resumen', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Resumen', exact: true })).toBeVisible();
  await page.reload();
  await openDraft(page);
  await expect(page.getByLabel(weightLabel(1))).toHaveValue('12,');
  await expect(page.getByLabel(repsLabel(1))).toHaveValue('0');
  expect(errors).toEqual([]);
});
