import { test, expect, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { DEFAULT_PROFILE } from '../src/lib/strength';
import { GEAR } from '../src/lib/gear';
import { GEAR_CATALOG_ART } from '../src/lib/gear-catalog-art';
import { normalizeGame } from '../src/lib/game';
import { CATALOG } from '../src/lib/catalog';
import { emptyData, exerciseSnapshot, newId, newSet, newWorkout, type AppData, type Workout } from '../src/lib/model';
import { settings } from './account-navigation';

async function enter(page: Page) {
  await page.goto('/');
  await page.reload();
  const guestButton = page.getByRole('button', { name: 'Continuar como invitado' });
  await expect(guestButton.or(page.getByRole('heading', { name: 'Inicio', exact: true }))).toBeVisible();
  if (await guestButton.isVisible()) await guestButton.click();
  await expect(page.getByRole('heading', { name: 'Inicio', exact: true })).toBeVisible();
}
async function stored(page: Page): Promise<AppData> {
  return page.evaluate(() => new Promise((resolve, reject) => {
    const request = indexedDB.open('cheesit-guest', 1);
    request.onsuccess = () => { const db = request.result, tx = db.transaction('state'), q = tx.objectStore('state').get('local'); tx.oncomplete = () => { resolve(q.result); db.close(); }; tx.onerror = () => reject(tx.error); };
  }));
}
async function seed(page: Page, data: AppData) {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Continuar como invitado' })).toBeVisible();
  await page.evaluate(data => new Promise<void>((resolve, reject) => {
    const request = indexedDB.open('cheesit-guest', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('state');
    request.onsuccess = () => { const db = request.result, tx = db.transaction('state', 'readwrite'); tx.objectStore('state').put(data, 'local'); tx.oncomplete = () => { resolve(); db.close(); }; tx.onerror = () => reject(tx.error); };
  }), data);
  await page.getByRole('button', { name: 'Continuar como invitado' }).click();
  await expect(page.getByRole('heading', { name: 'Inicio', exact: true })).toBeVisible();
}
async function progress(page: Page, tab: 'Marcas' | 'Cuerpo' | 'Peso') {
  await page.getByRole('navigation', { name: 'Navegación principal' }).getByRole('button', { name: 'Progreso', exact: true }).click();
  await page.getByRole('button', { name: tab, exact: true }).click();
}

async function record(page: Page, date: string, weight: string) {
  await page.clock.setFixedTime(new Date(date + 'T12:00:00Z'));
  await page.getByLabel('Peso corporal (kg)', { exact: true }).fill(weight);
  await page.getByRole('button', { name: 'Guardar peso', exact: true }).click();
  await expect(page.getByText('Peso guardado.', { exact: true })).toBeVisible();
}

test('weight has its own mobile tab, retains measurements and keeps goal editing in the profile', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.clock.setFixedTime(new Date('2026-11-01T12:00:00Z'));
  await seed(page, { ...emptyData(), profile: DEFAULT_PROFILE, preferences: { effects: false, sound: false } });

  await settings(page);
  await expect(page.getByLabel('Peso corporal (kg)', { exact: true })).toHaveCount(0);
  await page.getByLabel('Menú de perfil', { exact: true }).click();
  await page.getByRole('button', { name: 'Objetivos', exact: true }).click();
  await page.getByRole('button', { name: 'Nuevo objetivo', exact: true }).click();
  await page.getByRole('combobox', { name: 'Tipo de objetivo', exact: true }).selectOption('body');
  await page.getByLabel('Peso objetivo (kg)', { exact: true }).fill('80');
  await page.getByRole('button', { name: 'Guardar objetivo', exact: true }).click();
  await expect(page.getByText('Objetivo de peso guardado.')).toBeVisible();

  await progress(page, 'Cuerpo');
  const muscle = page.getByRole('heading', { name: 'Actividad por músculo', exact: true });
  const body = page.getByRole('region', { name: 'Peso corporal', exact: true });
  await expect(muscle).toBeVisible();
  await expect(body).toHaveCount(0);
  const tabs = page.getByRole('navigation', { name: 'Vistas de progreso' }).getByRole('button');
  await expect(tabs).toHaveText(['Historial', 'Marcas', 'Cuerpo', 'Peso']);
  await page.getByRole('button', { name: 'Peso', exact: true }).click();
  await expect(muscle).toHaveCount(0);
  await expect(body.getByText('70 kg', { exact: true })).toBeVisible();
  await expect(body.getByRole('button', { name: 'Guardar objetivo' })).toHaveCount(0);
  await expect(body.getByLabel('Objetivo de peso (kg)')).toHaveCount(0);
  await record(page, '2026-11-01', '72');
  expect((await stored(page)).profile?.weightTracking?.rewards).toEqual([{ date: '2026-11-01', xp: 200 }]);
  await record(page, '2026-11-02', '71');
  await record(page, '2026-11-03', '72');

  await page.getByText('Historial de peso · 3 registros').click();
  await page.getByLabel('Corregir peso del 2026-11-03').click();
  await expect(body.locator('time[datetime="2026-11-03"]').first()).toBeVisible();
  await page.getByLabel('Peso corporal (kg)', { exact: true }).fill('73');
  await page.getByRole('button', { name: 'Guardar corrección' }).click();
  await expect(page.getByText('Registro corregido. La XP no se vuelve a premiar.')).toBeVisible();
  await expect(page.locator('.body-weight-goal-line')).toBeVisible();
  expect((await stored(page)).profile?.weightTracking?.rewards).toHaveLength(1);
  await mkdir('artifacts/progress-weight', { recursive: true });
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    for (const tab of await tabs.all()) {
      const box = (await tab.boundingBox())!;
      expect(box.height).toBeGreaterThanOrEqual(44);
      expect(box.x + box.width).toBeLessThanOrEqual(width);
      await tab.click();
      await expect(tab).toHaveAttribute('aria-current', 'page');
    }
    await body.screenshot({ path: `artifacts/progress-weight/body-${width}.png` });
  }
  await page.reload();
  await expect(page).toHaveURL(/tab=weight/);
  await expect(body.getByText('73 kg', { exact: true }).first()).toBeVisible();
  expect((await stored(page)).profile?.weightTracking).toMatchObject({ goalKg: 80, rewards: [{ date: '2026-11-01', xp: 200 }] });
  expect(errors).toEqual([]);
});

test('exercise history shows the best kg × reps, strict records and five recent sessions', async ({ page }, info) => {
  const bench = CATALOG.find(exercise => exercise.id === 'press-banca-barra')!;
  const workouts: Workout[] = [40, 60, 45, 60, 58, 62].map((weight, index) => {
    const date = `2026-11-0${index + 1}`;
    return {
      ...newWorkout(), date, createdAt: `${date}T10:00:00Z`, status: 'finished', name: `Sesión ${index + 1}`,
      exercises: [{
        ...exerciseSnapshot(bench), id: newId(),
        sets: [
          { ...newSet(), weight, reps: 8, confirmed: true },
          { ...newSet(), weight: weight + 10, reps: 5, confirmed: true },
          { ...newSet(), weight: 90, reps: 12, confirmed: true, kind: 'warmup' },
        ],
      }],
    };
  });
  await page.clock.setFixedTime(new Date('2026-11-08T12:00:00Z'));
  await seed(page, { ...emptyData(), workouts, preferences: { effects: false, sound: false } });
  await progress(page, 'Marcas');

  const search = page.getByRole('searchbox', { name: 'Buscar ejercicio', exact: true });
  const groups = page.getByRole('group', { name: 'Grupo muscular', exact: true });
  await groups.getByRole('button', { name: 'Pecho', exact: true }).click();
  await search.fill('banca');
  const exercise = page.locator('.progress-search-list').getByRole('button', { name: /Press de banca con barra/ });
  await expect(exercise.locator('img')).toHaveAttribute('src', /\/assets\/exercises\//);
  await exercise.click();

  await expect(search).toHaveCount(0);
  await expect(groups).toHaveCount(0);
  await expect(page.getByRole('group', { name: 'Métrica', exact: true })).toHaveCount(0);
  const table = page.getByRole('table');
  await expect(table.getByRole('columnheader')).toHaveText(['Sesión', 'kg × reps']);
  await expect(table.getByRole('cell')).toHaveText(['496 Nueva marca', '464', '480', '360', '480 Nueva marca']);
  await expect(page.getByRole('img', { name: /Evolución en kg × reps de 6 sesiones/ })).toBeVisible();
  const words = page.getByRole('region', { name: 'Tu progreso explicado' });
  expect(await table.evaluate(element => Boolean(element.compareDocumentPosition(document.querySelector('.progress-words')!) & Node.DOCUMENT_POSITION_FOLLOWING))).toBe(true);
  await expect(words.getByText(/Con 496 kg × reps superaste/)).toBeVisible();
  await page.getByRole('button', { name: 'Ver más', exact: true }).click();
  await expect(table.getByRole('row')).toHaveCount(7);
  await expect(table.getByRole('cell').last()).toHaveText('320');
  await page.getByRole('button', { name: 'Ver menos', exact: true }).click();
  await expect(table.getByRole('row')).toHaveCount(6);
  await page.screenshot({ path: info.outputPath('marcas.png'), fullPage: true });
  await page.getByRole('button', { name: 'Volver', exact: true }).click();
  await expect(search).toHaveValue('banca');
  await expect(groups.getByRole('button', { name: 'Pecho', exact: true })).toHaveAttribute('aria-pressed', 'true');
});

test('collection uses all original objects, category icons and a larger static character without overlap', async ({ page }) => {
  const inventory = GEAR.map(g => ({ id: crypto.randomUUID(), gearId: g.id, kind: 'gear' as const, rarity: g.rarity, acquiredAt: '2026-10-01T10:00:00Z', crateId: 'starter', sold: false }));
  await seed(page, { ...emptyData(), game: { ...normalizeGame(), inventory, transactions: inventory.map(item => ({ id: crypto.randomUUID(), kind: 'crate' as const, itemId: item.id, amount: -100, createdAt: item.acquiredAt, testFunded: true })) }, preferences: { effects: true, sound: false } });
  await page.getByRole('button', { name: 'Personalizar personaje', exact: true }).click();
  await expect(page.locator('.character-motion-controls')).toHaveCount(0);
  await expect(page.locator('.wardrobe-slots .empty-slot-icon')).toHaveCount(6);
  await expect(page.getByRole('button', { name: 'Pausar animación' })).toHaveCount(0);
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    const character = page.locator('.wardrobe-character-preview .character-avatar');
    expect(await character.locator('.character-layers').evaluate(el => getComputedStyle(el).animationName)).toBe('none');
    const cb = (await character.boundingBox())!, slots = (await page.locator('.wardrobe-slots').boundingBox())!;
    expect(cb.x).toBeGreaterThanOrEqual(0); expect(cb.x + cb.width).toBeLessThanOrEqual(width);
    if (width <= 760) { expect(cb.width).toBeGreaterThan(235); expect(cb.y + cb.height).toBeLessThanOrEqual(slots.y); }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.locator('.wardrobe-stage').screenshot({ path: `artifacts/progress-weight/collection-${width}.png` });
  }
  await page.getByRole('navigation', { name: 'Organizar colección' }).getByRole('button', { name: 'Inventario', exact: true }).click();
  const catalog = page.locator('.loot-item-card .gear-catalog');
  await expect(catalog).toHaveCount(GEAR.length);
  for (const art of await catalog.evaluateAll(els => els.map(el => ({ id: el.getAttribute('data-gear-id')!, src: el.querySelector('image')?.getAttribute('href') })))) expect(art.src).toBe(GEAR_CATALOG_ART[art.id].src);
  const first = page.locator('.loot-item-card').filter({ has: page.locator('[data-gear-id="purple-tank"]') });
  await first.getByRole('button', { name: /Usar aspecto/ }).click();
  await page.getByRole('navigation', { name: 'Organizar colección' }).getByRole('button', { name: 'Aspectos', exact: true }).click();
  await expect(page.locator('.wardrobe-character-preview .character-equipped[data-gear-id="purple-tank"]')).toBeVisible();
  await page.locator('.cosmetic-card[data-gear-id="purple-tank"]').getByRole('button', { name: 'Quitar aspecto', exact: true }).click();
  await expect(page.locator('.wardrobe-character-preview .character-equipped[data-gear-id="purple-tank"]')).toHaveCount(0);
});

test('crate rewards show the original object, persist once and equip the registered layer', async ({ page }) => {
  await seed(page, { ...emptyData(), game: normalizeGame(), preferences: { effects: false, sound: false } });
  await page.getByRole('navigation', { name: 'Navegación principal' }).getByRole('button', { name: 'Arcade', exact: true }).click();
  await page.getByRole('button', { name: 'Cofres', exact: true }).click();
  await page.evaluate(() => { crypto.getRandomValues = (array: ArrayBufferView | null) => { if (array instanceof Uint32Array) array.fill(0); return array; }; });
  await page.locator('.arcade-crate').first().getByRole('button', { name: /Abrir cofre/ }).click();
  await expect(page.getByRole('heading', { name: 'Recompensa obtenida' })).toBeVisible({ timeout: 15000 });
  const result = page.locator('.opening-result-art .gear-catalog');
  await expect(result).toBeVisible();
  const id = (await result.getAttribute('data-gear-id'))!;
  await expect(result.locator('image')).toHaveAttribute('href', GEAR_CATALOG_ART[id].src);
  await page.screenshot({ path: 'artifacts/progress-weight/crate-result.png' });
  await page.getByRole('button', { name: 'Usar aspecto', exact: true }).click();
  await page.getByRole('button', { name: 'Inicio de Arcade', exact: true }).click();
  await page.getByRole('button', { name: 'Personaje', exact: true }).click();
  await expect(page.locator(`.wardrobe-character-preview .character-equipped[data-gear-id="${id}"]`)).toBeVisible();
  const data = await stored(page);
  expect(data.game?.inventory).toHaveLength(1); expect(data.game?.transactions).toHaveLength(1);
  expect(data.game?.pendingOpening).toBeNull();
  await enter(page);
  expect((await stored(page)).game?.inventory).toHaveLength(1);
});

test('Entrenar resumes the same draft as Inicio after a reload', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-03T12:00:00Z'));
  const bench = CATALOG.find(exercise => exercise.id === 'press-banca-barra')!;
  const workout = {
    ...newWorkout(),
    name: 'Empuje pendiente',
    exercises: [{
      ...exerciseSnapshot(bench),
      id: newId(),
      sets: [{ ...newSet(), weight: 62.5, reps: 8, confirmed: true }, { ...newSet(), weight: 55, reps: 6 }],
    }],
  };
  const older = { ...newWorkout(), name: 'Sesión anterior', updatedAt: '2026-11-02T10:00:00Z' };
  await seed(page, { ...emptyData(), workouts: [older, workout] });
  const navigation = page.getByRole('navigation', { name: 'Navegación principal' });
  await expect(page.locator('.next-session')).toContainText(workout.name);
  await navigation.getByRole('button', { name: 'Entrenar', exact: true }).click();
  const notice = page.getByRole('region', { name: 'Entrenamiento pendiente' });
  await expect(notice).toContainText(workout.name);
  await page.reload();
  await notice.getByRole('button', { name: 'Continuar entrenamiento', exact: true }).click();
  const checkEditor = async () => {
    await expect(page).toHaveURL(new RegExp(`view=editor&id=${workout.id}`));
    await expect(page.getByLabel(`Carga en kg, serie 1 de ${bench.name}`)).toHaveValue('62.5');
    await expect(page.getByLabel(`Repeticiones, serie 2 de ${bench.name}`)).toHaveValue('6');
    await expect(page.getByRole('button', { name: 'Realizada 1', exact: true })).toBeDisabled();
  };
  await checkEditor();
  await page.reload();
  await checkEditor();
});

test('Cofre Maestro blocks insufficient credit and resumes one reserved prize at 1.000 credits', async ({ page }, info) => {
  const grant = { season: '2026', xp: 0, credits: 1100, grantedAt: '2026-11-01T12:00:00Z', charges: {} };
  await seed(page, { ...emptyData(), game: { ...normalizeGame(), arcadeGrant: grant }, preferences: { effects: true, sound: false } });
  const navigation = page.getByRole('navigation', { name: 'Navegación principal' });
  await navigation.getByRole('button', { name: 'Entrenar', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Entrenamiento pendiente' })).toHaveCount(0);
  await navigation.getByRole('button', { name: 'Arcade', exact: true }).click();
  await page.getByRole('button', { name: 'Cofres', exact: true }).click();
  const card = page.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Cofre Maestro', exact: true }) });
  const buy = card.getByRole('button', { name: /Abrir cofre/ });
  await card.getByRole('button', { name: 'Información sobre Probabilidades · Cofre Maestro' }).click();
  const odds = page.getByRole('dialog', { name: 'Probabilidades · Cofre Maestro' });
  await expect(odds.locator('.crate-odds > span')).toHaveText(['Común0%', 'Rara25%', 'Épica50%', 'Legendaria25%']);
  await odds.getByRole('button', { name: 'Cerrar información' }).click();
  await expect(odds).toHaveCount(0);
  await expect(buy).toHaveAccessibleName(/1\.?000 créditos/);
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const artwork = card.locator('img.crate-illustration');
    await expect.poll(() => artwork.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
    await expect(artwork).toHaveCSS('animation-name', 'crate-hover');
    await expect(artwork).toHaveCSS('animation-duration', '4s');
    await expect(card.locator('.crate-halo')).toHaveCSS('background-color', 'rgba(255, 52, 52, 0.2)');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width + 1);
    await card.screenshot({ path: info.outputPath(`master-card-${width}.png`), animations: 'disabled' });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await buy.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'Sorteando rareza', exact: true })).toBeVisible();
  await expect(dialog.getByLabel('Ruleta de rarezas')).toBeVisible();
  const reserved = (await stored(page)).game!;
  expect(reserved.inventory).toHaveLength(1);
  expect(reserved.transactions).toHaveLength(1);
  expect(reserved.transactions[0].amount).toBe(-1000);
  expect(reserved.pendingOpening?.itemId).toBe(reserved.inventory[0].id);
  await page.reload();
  await expect(card.getByRole('button', { name: /Faltan créditos/ })).toBeDisabled();
  await page.getByRole('button', { name: 'Continuar apertura', exact: true }).click();
  const reveal = dialog.getByRole('status', { name: 'Abriendo recompensa' });
  await expect(reveal.locator('.opening-crate-lid')).toBeVisible({ timeout: 8000 });
  await expect(reveal.getByText('ROMPIENDO EL SELLO', { exact: true })).toBeVisible();
  await expect(dialog.getByRole('heading', { name: 'Recompensa obtenida' })).toBeVisible();
  await dialog.screenshot({ path: info.outputPath('master-opening-390.png'), animations: 'disabled' });
  await page.setViewportSize({ width: 1440, height: 900 });
  await dialog.screenshot({ path: info.outputPath('master-opening-1440.png'), animations: 'disabled' });
  await dialog.getByRole('button', { name: 'Guardar en colección' }).click();
  await expect(card.getByRole('button', { name: /Faltan créditos/ })).toBeDisabled();
  await expect(page.getByRole('button', { name: '200 créditos disponibles' })).toBeVisible();
  await page.reload();
  const revealed = (await stored(page)).game!;
  expect(revealed.pendingOpening).toBeNull();
  expect(revealed.inventory).toEqual(reserved.inventory);
  expect(revealed.transactions).toEqual(reserved.transactions);
});
