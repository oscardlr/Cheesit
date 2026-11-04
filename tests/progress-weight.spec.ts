import { test, expect, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { DEFAULT_PROFILE } from '../src/lib/strength';
import { GEAR } from '../src/lib/gear';
import { GEAR_CATALOG_ART } from '../src/lib/gear-catalog-art';
import { normalizeGame } from '../src/lib/game';
import { emptyData, type AppData } from '../src/lib/model';
import { settings } from './account-navigation';

async function enter(page: Page) {
  await page.goto('/');
  await page.reload();
  const guestButton = page.getByRole('button', { name: 'Continuar como invitado' });
  await expect(guestButton.or(page.getByRole('heading', { name: 'Resumen', exact: true }))).toBeVisible();
  if (await guestButton.isVisible()) await guestButton.click();
  await expect(page.getByRole('heading', { name: 'Resumen', exact: true })).toBeVisible();
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
  await expect(page.getByRole('heading', { name: 'Resumen', exact: true })).toBeVisible();
}
async function progress(page: Page) { await page.getByRole('button', { name: /(?:Buscar|Ver) progreso →/ }).click(); await expect(page.getByRole('heading', { name: 'Progreso', exact: true })).toBeVisible(); }
async function record(page: Page, date: string, weight: string) {
  await page.getByLabel('Fecha del peso').fill(date);
  await page.getByLabel('Peso corporal (kg)', { exact: true }).fill(weight);
  await page.getByRole('button', { name: 'Guardar peso', exact: true }).click();
  await expect(page.getByText('Peso guardado.', { exact: true })).toBeVisible();
}

test('weight, goal, XP, corrections, original exercise images and repeated startup work on mobile', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await seed(page, { ...emptyData(), profile: DEFAULT_PROFILE });
  // Observe the entire startup interval, including a new sessionStorage state.
  await page.evaluate(() => { sessionStorage.clear(); (window as unknown as { introObserved: boolean }).introObserved = false; new MutationObserver(() => { if (document.querySelector('.arcade-intro')) (window as unknown as { introObserved: boolean }).introObserved = true; }).observe(document.body, { subtree: true, childList: true }); });
  await page.waitForTimeout(2600);
  expect(await page.evaluate(() => (window as unknown as { introObserved: boolean }).introObserved)).toBe(false);
  await settings(page);
  await expect(page.getByLabel('Peso corporal (kg)', { exact: true })).toHaveCount(0);
  await expect(page.locator('.athlete-profile-editor')).toHaveCount(0);
  await page.getByRole('navigation', { name: 'Navegación principal' }).getByRole('button', { name: 'Resumen', exact: true }).click();
  await progress(page);
  await expect(page.getByText('70 kg', { exact: true })).toBeVisible();
  await page.getByLabel('Objetivo de peso (kg)').fill('80');
  await page.getByRole('button', { name: 'Guardar objetivo' }).click();
  await expect(page.getByText('Objetivo de peso guardado.')).toBeVisible();
  await record(page, '2026-11-01', '72');
  expect((await stored(page)).profile?.weightTracking?.rewards).toEqual([{ date: '2026-11-01', xp: 200 }]);
  await record(page, '2026-11-01', '72');
  await record(page, '2026-11-02', '71');
  await record(page, '2026-11-03', '72');
  expect((await stored(page)).profile?.weightTracking?.rewards).toHaveLength(1);
  await page.getByText('Historial de peso · 3 registros').click();
  await page.getByLabel('Corregir peso del 2026-11-03').click();
  await page.getByLabel('Peso corporal (kg)', { exact: true }).fill('73');
  await page.getByRole('button', { name: 'Guardar corrección' }).click();
  await expect(page.getByText('Registro corregido. La XP no se vuelve a premiar.')).toBeVisible();
  expect((await stored(page)).profile?.weightTracking?.rewards).toHaveLength(1);
  await expect(page.locator('.body-weight-goal-line')).toBeVisible();
  await expect(page.getByLabel('Fecha del peso')).toHaveValue('2026-11-03');
  const image = page.locator('.progress-search-list img').first();
  await expect(image).toHaveAttribute('src', /\/assets\/exercises\//);
  expect(await image.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true);
  await mkdir('artifacts/progress-weight', { recursive: true });
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `artifacts/progress-weight/progress-${width}.png`, fullPage: true });
  }
  await enter(page); await progress(page);
  await expect(page.getByText('73 kg', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('Llegar a 80 kg', { exact: true })).toBeVisible();
  expect((await stored(page)).profile?.weightTracking?.rewards).toHaveLength(1);
  await page.waitForTimeout(2600); await expect(page.locator('.arcade-intro')).toHaveCount(0);
  expect(errors).toEqual([]);
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
  await page.getByRole('button', { name: 'Personalizar personaje', exact: true }).click();
  await page.getByRole('tab', { name: 'Cofres', exact: true }).click();
  await page.evaluate(() => { crypto.getRandomValues = (array: ArrayBufferView | null) => { if (array instanceof Uint32Array) array.fill(0); return array; }; });
  await page.locator('.arcade-crate').first().getByRole('button').click();
  await expect(page.getByRole('heading', { name: 'Recompensa obtenida' })).toBeVisible({ timeout: 15000 });
  const result = page.locator('.opening-result-art .gear-catalog');
  await expect(result).toBeVisible();
  const id = (await result.getAttribute('data-gear-id'))!;
  await expect(result.locator('image')).toHaveAttribute('href', GEAR_CATALOG_ART[id].src);
  await page.screenshot({ path: 'artifacts/progress-weight/crate-result.png' });
  await page.getByRole('button', { name: 'Usar aspecto', exact: true }).click();
  await page.getByRole('tab', { name: 'Colección', exact: true }).click();
  await page.getByRole('navigation', { name: 'Organizar colección' }).getByRole('button', { name: 'Aspectos', exact: true }).click();
  await expect(page.locator(`.wardrobe-character-preview .character-equipped[data-gear-id="${id}"]`)).toBeVisible();
  const data = await stored(page);
  expect(data.game?.inventory).toHaveLength(1); expect(data.game?.transactions).toHaveLength(1);
  expect(data.game?.pendingOpening).toBeNull();
  await enter(page);
  expect((await stored(page)).game?.inventory).toHaveLength(1);
});
