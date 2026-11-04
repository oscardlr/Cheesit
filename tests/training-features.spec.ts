import { test, expect, type Page } from '@playwright/test';
import { CATALOG } from '../src/lib/catalog';
import { emptyData, exerciseSnapshot, newId, newSet, newWorkout, type AppData, type Routine } from '../src/lib/model';
import { normalizeGame } from '../src/lib/game';
import { captureMoments, groupWith, recoverMoments, type RoutineCycle } from '../src/lib/training-features';
import { addDays, todayMadrid } from '../src/lib/dates';

const routine = (name: string): Routine => ({ id: newId(), name, color: '#d8ff3e', archived: false, exercises: ['press-banca-barra', 'remo-polea-baja'].map(exerciseId => ({ id: newId(), exerciseId, sets: 2, setKinds: ['warmup', 'work'], targetWeight: 20, repsMin: 8 })) });
function fixture(): AppData {
  const a = routine('Superior A'), b = routine('Superior B');
  a.exercises = groupWith(a.exercises, a.exercises[0].id, a.exercises[1].id);
  const workouts = Array.from({ length: 4 }, (_, i) => ({ ...newWorkout(), status: 'finished' as const, date: addDays('2026-10-12', i * 7), name: `Sesión acreditada ${i + 1}`, exercises: [{ id: newId(), ...exerciseSnapshot(CATALOG.find(e => e.id === 'press-banca-barra')!), sets: [{ ...newSet(), weight: 40, reps: 8 + i, confirmed: true }] }] }));
  workouts[3].exercises[0].sets.unshift({ ...newSet(), weight: 10, reps: 12, kind: 'warmup', confirmed: true });
  const cycle: RoutineCycle = { id: newId(), name: 'Mi ciclo AB', routineIds: [a.id, b.id], position: 0, completedWorkoutIds: [] };
  const game = normalizeGame(); game.weeklyWorkoutGoal = 1;
  const companion = { id: newId(), kind: 'companion' as const, companionId: 'athlete', rarity: 'common' as const, acquiredAt: '2026-10-01T12:00:00Z', crateId: 'starter', sold: false };
  const gear = ['purple-tank', 'lime-shorts'].map((gearId, i) => ({ id: newId(), kind: 'gear' as const, gearId, rarity: i === 0 ? 'rare' as const : 'common' as const, acquiredAt: companion.acquiredAt, crateId: 'starter', sold: false }));
  game.inventory = [companion, ...gear]; game.cosmeticGear = { top: 'purple-tank', bottom: 'lime-shorts' }; game.transactions = game.inventory.map(item => ({ id: newId(), kind: 'crate' as const, itemId: item.id, amount: -100, createdAt: companion.acquiredAt })); game.equippedCompanionId = 'athlete';
  let data: AppData = { ...emptyData(), routines: [a, b], workouts, game, preferences: { effects: false, sound: false }, personalProfile: { displayName: 'Atleta privada', bio: '', photo: null }, training: { moments: [], cycles: [cycle], weeklyGoals: workouts.map(w => ({ week: w.date, observedOn: w.date, days: 1, sets: 30 })) } };
  data = recoverMoments(data); return captureMoments({ ...data, workouts: workouts.slice(0, 3) }, data, workouts[3]);
}
async function seed(page: Page, data: AppData) {
  await page.addInitScript(() => sessionStorage.setItem('grind-intro-v1', '1'));
  await page.goto('/');
  await page.evaluate(data => new Promise<void>((resolve, reject) => { const r = indexedDB.open('cheesit-guest', 1); r.onupgradeneeded = () => r.result.createObjectStore('state'); r.onsuccess = () => { const db = r.result, tx = db.transaction('state', 'readwrite'); tx.objectStore('state').put(data, 'local'); tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = () => reject(tx.error); }; }), data);
  await page.getByRole('button', { name: 'Continuar como invitado' }).click();
  await expect(page.getByRole('heading', { name: 'Resumen', exact: true })).toBeVisible();
}
async function read(page: Page): Promise<AppData> { return page.evaluate(() => new Promise(resolve => { const r = indexedDB.open('cheesit-guest', 1); r.onsuccess = () => { const db = r.result, tx = db.transaction('state'), q = tx.objectStore('state').get('local'); tx.oncomplete = () => { db.close(); resolve(q.result); }; }; })); }
async function profile(page: Page) { await page.getByLabel('Menú de perfil', { exact: true }).click(); await page.getByRole('button', { name: 'Mi perfil', exact: true }).click(); }
async function dismiss(page: Page) { const close = page.getByRole('button', { name: 'Cerrar celebración', exact: true }); if (await close.isVisible()) await close.click(); }

for (const width of [390, 1440]) test(`weekly summary, progress words, private album and image export at ${width}px`, async ({ page }, info) => {
  test.setTimeout(60000); const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.setViewportSize({ width, height: 950 }); await page.emulateMedia({ reducedMotion: 'reduce' });
  await seed(page, fixture());
  await expect(page.getByRole('heading', { name: 'Tu semana en Cheesit', exact: true })).toBeVisible();
  await expect(page.locator('.weekly-summary')).toContainText('En curso');
  await expect(page.locator('.weekly-summary')).toContainText('4 semanas seguidas');
  await page.screenshot({ path: info.outputPath(`summary-${width}.png`), fullPage: true });
  await page.locator('.weekly-summary').getByRole('button', { name: 'Semana anterior' }).click(); await expect(page.locator('.weekly-summary')).toContainText('Semana cerrada');
  await page.locator('.weekly-summary').getByRole('button', { name: 'Semana siguiente' }).click();
  await page.locator('.weekly-summary').getByRole('button', { name: 'Ver primera sesión →' }).click();
  await expect(page.locator('.progress-words')).toContainText('1 repetición más');
  await expect(page.locator('.progress-words')).toContainText('Constancia');
  await profile(page); await expect(page.getByRole('heading', { name: 'Álbum de momentos' })).toBeVisible();
  await expect(page.locator('.moment-card')).toHaveCount(2);
  await page.screenshot({ path: info.outputPath(`album-${width}.png`), fullPage: true });
  await page.locator('.moment-card').filter({ hasText: 'Récord personal' }).getByRole('button', { name: 'Previsualizar y exportar' }).click();
  await expect(page.getByRole('dialog', { name: 'Previsualizar imagen' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Tu imagen, tus datos' })).toBeVisible();
  await expect(page.getByLabel('Incluir nombre del perfil')).not.toBeChecked();
  await expect(page.locator('.training-card-image')).not.toContainText('Atleta privada');
  await page.getByLabel('Incluir título y datos').uncheck(); await expect(page.locator('.training-card-image')).not.toContainText('Récord personal'); await page.getByLabel('Incluir título y datos').check();
  const downloadPromise = page.waitForEvent('download'); await page.getByRole('button', { name: 'Descargar imagen PNG' }).click(); const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.png$/); await download.saveAs(info.outputPath(`moment-${width}.png`));
  await page.screenshot({ path: info.outputPath(`preview-${width}.png`), fullPage: false });
  await page.getByRole('button', { name: 'Cerrar previsualización' }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  expect(errors).toEqual([]);
});

test('routine types, superset rest, cycle completion, repeat/convert and recovered album persist in guest mode', async ({ page }, info) => {
  test.setTimeout(90000); const initial = fixture(); await seed(page, initial);
  await page.getByRole('navigation', { name: 'Navegación principal' }).getByRole('button', { name: 'Rutinas', exact: true }).click();
  await page.getByRole('button', { name: 'Superior A 2 ejercicios' }).click();
  await expect(page.getByRole('group', { name: 'Tipo de serie 1 de Press de banca con barra', exact: true }).getByRole('button', { name: 'Calentamiento', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('group', { name: 'Tipo de serie 2 de Press de banca con barra', exact: true }).getByRole('button', { name: 'Serie de trabajo', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.superset-badge').first()).toContainText('A1');
  await page.getByRole('button', { name: 'Guardar rutina', exact: true }).click();
  await page.locator('.cycle-card').getByRole('button', { name: 'Iniciar próxima →' }).click();
  await expect(page.getByRole('heading', { name: 'Entrenamiento', exact: true })).toBeVisible();
  await page.locator('.exercise-card').first().getByRole('button', { name: 'Copiar todas las series', exact: true }).click();
  await expect(page.getByLabel('Carga en kg, serie 1 de Press de banca con barra')).toHaveValue('10');
  await expect(page.getByLabel('Carga en kg, serie 2 de Press de banca con barra')).toHaveValue('40');
  await expect(page.getByRole('group', { name: 'Tipo de serie 1 de Press de banca con barra', exact: true }).getByRole('button', { name: 'Calentamiento', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('group', { name: 'Tipo de serie 2 de Press de banca con barra', exact: true }).getByRole('button', { name: 'Serie de trabajo', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByText('Ajustar descanso', { exact: true }).click(); await page.getByLabel('Iniciar al completar una serie o ronda de superserie').check();
  const cards = page.locator('.exercise-card');
  await cards.nth(0).getByRole('button', { name: 'Confirmar serie 1', exact: true }).click();
  await expect.poll(async () => (await read(page)).workouts.find(w => w.status === 'draft')?.restTimer).toBeUndefined();
  await cards.nth(1).getByRole('button', { name: 'Confirmar serie 1', exact: true }).click();
  await expect.poll(async () => Boolean((await read(page)).workouts.find(w => w.status === 'draft')?.restTimer)).toBe(true);
  await cards.nth(0).getByRole('button', { name: 'Confirmar serie 2', exact: true }).click(); await dismiss(page);
  await cards.nth(1).getByRole('button', { name: 'Confirmar serie 2', exact: true }).click(); await dismiss(page);
  await page.screenshot({ path: info.outputPath('session-superset-mobile.png'), fullPage: true });
  await page.getByRole('button', { name: 'Finalizar entrenamiento', exact: true }).click(); await dismiss(page);
  await expect(page.getByRole('heading', { name: 'Resumen', exact: true })).toBeVisible();
  await expect(page.locator('.cycle-card')).toContainText('Próxima · Superior B');
  await expect.poll(async () => (await read(page)).training!.cycles[0].completedWorkoutIds.length).toBe(1);
  const saved = await read(page), final = saved.workouts.find(w => w.cycleLink)!;
  expect(final.exercises[0].sets.map(s => s.kind)).toEqual(['warmup', 'work']);
  await page.reload();
  await expect(page.locator('.cycle-card')).toContainText('Próxima · Superior B');
  await page.goto(`/#view=detail&id=${final.id}`); await expect(page.locator('.history-sets')).toHaveCount(2);
  await expect(page.locator('.history-sets').first()).toContainText('Calentamiento');
  await page.getByRole('button', { name: 'Repetir sesión', exact: true }).click();
  await expect(page.getByRole('group', { name: 'Tipo de serie 1 de Press de banca con barra', exact: true }).getByRole('button', { name: 'Calentamiento', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.superset-badge').first()).toContainText('A1');
  await expect.poll(async () => (await read(page)).workouts.find(w => w.status === 'draft')?.cycleLink).toBeUndefined();
  await page.getByRole('button', { name: 'Volver', exact: true }).click();
  await expect(page.getByRole('heading', {name:'Resumen',exact:true})).toBeVisible();
  await page.getByRole('navigation', {name:'Navegación principal'}).getByRole('button', {name:'Calendario',exact:true}).click();
  await page.locator('.list-card .list-row').filter({hasText:final.name}).click();
  await page.getByRole('button', { name: 'Guardar como rutina', exact: true }).click();
  await expect(page.getByRole('group', { name: 'Tipo de serie 1 de Press de banca con barra', exact: true }).getByRole('button', { name: 'Calentamiento', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.superset-badge').first()).toContainText('A1');
});

test('warmup-only activity never appears as a latest mark or a completed weekly goal', async ({page}) => {
  const data=fixture(), warm=structuredClone(data.workouts[3]), previous=data.workouts[2];
  warm.id=newId();warm.date=todayMadrid();warm.exercises=warm.exercises.map(e=>({...e,id:newId(),sets:[{...newSet(),weight:500,reps:12,kind:'warmup',confirmed:true}]}));
  data.workouts=[previous,warm];data.training!.moments=[];
  await seed(page,data);
  await expect(page.locator('.evolution-section')).toContainText('40 kg');
  await expect(page.locator('.evolution-section')).not.toContainText('500 kg');
  await expect(page.locator('.week-count')).toContainText('0');
  await expect(page.locator('.week-strip .complete')).toHaveCount(0);
  await expect(page.locator('.week-card')).not.toContainText('Meta semanal conseguida');
  await expect(page.locator('.weekly-summary')).toContainText('1 calentamiento guardado');
});
