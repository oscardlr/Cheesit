import { test, expect, type Page } from '@playwright/test';
import { GEAR } from '../src/lib/gear';
import { COMPANIONS } from '../src/lib/companions';
import { CHARACTER_ART, CHARACTER_ATLAS, CHARACTER_MASTER } from '../src/lib/character-art';
import { CHARACTER_COMBINATION_COUNT, PARTY_COMBINATION_COUNT, INSPECTION_SLOTS, INSPECTION_SLOT_ITEMS, OVERLAP_INSPECTION_PRESETS, inspectionCombination } from '../src/lib/character-inspection';

async function openInspection(page: Page) {
  const response = await page.goto('/dev/character');
  test.skip(response?.status() === 404, 'La herramienta de inspección solo está disponible con next dev.');
  await expect(page.getByRole('heading', { name: 'Inspección del personaje', exact: true })).toBeVisible();
}

const live = (page: Page) => page.locator('.inspection-live');
const animations = (page: Page) => live(page).evaluate(element => element.getAnimations({ subtree: true }).filter(animation => animation.playState === 'running').length);

test('the actual catalog enumerates every valid independent combination exactly once', () => {
  expect(GEAR).toHaveLength(35);
  expect(INSPECTION_SLOTS.map(slot => INSPECTION_SLOT_ITEMS[slot].length)).toEqual([7, 8, 7, 7, 6]);
  expect(CHARACTER_COMBINATION_COUNT).toBe(32256);
  expect(PARTY_COMBINATION_COUNT).toBe(161280);
  expect(PARTY_COMBINATION_COUNT).toBe(CHARACTER_COMBINATION_COUNT * (COMPANIONS.length + 1));
  expect(Object.values(CHARACTER_ART).filter(art => art.origin === 'tailored')).toHaveLength(29);
  expect(Object.values(CHARACTER_ART).filter(art => art.origin === 'reused')).toHaveLength(6);
  for (const gear of GEAR) {
    const art = CHARACTER_ART[gear.id];
    expect(art, `${gear.id} has a registered resource`).toBeDefined();
    expect(art.slot).toBe(gear.slot);
    expect(Math.abs(art.source[2] / art.target[2] - art.source[3] / art.target[3]), `${gear.id} uses uniform scaling`).toBeLessThan(.001);
    expect(art.source[0] + art.source[2]).toBeLessThanOrEqual(CHARACTER_ATLAS.width);
    expect(art.source[1] + art.source[3]).toBeLessThanOrEqual(CHARACTER_ATLAS.height);
    if (gear.slot === 'head' || gear.slot === 'hand') {
      expect(art.origin, `${gear.id} is drawn on this master`).toBe('tailored');
      expect(art.source.slice(2), `${gear.id} preserves authored pixels`).toEqual(art.target.slice(2));
    }
    expect(!!art.replacesHand, `${gear.id} has its own hand only in the hand slot`).toBe(gear.slot === 'hand');
  }
  const seen = new Set<string>();
  const covered = new Set<string>();
  const invalid: number[] = [];
  for (let index = 0; index < CHARACTER_COMBINATION_COUNT; index++) {
    const ids = inspectionCombination(index);
    if (new Set(ids.map(id => GEAR.find(item => item.id === id)!.slot)).size !== ids.length) invalid.push(index);
    ids.forEach(id => covered.add(id));
    seen.add(ids.join('|'));
  }
  expect(seen.size).toBe(CHARACTER_COMBINATION_COUNT);
  expect(invalid, 'Every combination respects one item per slot').toEqual([]);
  expect(covered.size).toBe(GEAR.length);
  expect(inspectionCombination(0)).toEqual([]);
});

test('the local tool inspects all 35 garments with their matching thumbnail and no player storage', async ({ page }, info) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openInspection(page);
  await expect(page.locator('.character-inspection > header')).toContainText('32.256');
  await expect(page.locator('.character-inspection > header')).toContainText('161.280');
  await expect(page.locator('[data-inspection-gear]')).toHaveCount(35);
  for (const item of GEAR) {
    const card = page.locator(`[data-inspection-gear="${item.id}"]`);
    await expect(card.locator(`.character-equipped[data-gear-id="${item.id}"]`)).toHaveCount(1);
    await expect(card.locator(`.gear-sprite[data-gear-id="${item.id}"]`)).toHaveCount(1);
    await expect(card.getByRole('heading', { name: item.name, exact: true })).toBeVisible();
  }
  for (const width of [320, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
    await page.locator('.inspection-workbench').screenshot({ path: info.outputPath(`inspection-controls-${width}.png`), animations: 'disabled' });
  }
  const registration = await page.locator('[data-inspection-gear]').evaluateAll(cards => cards.map(card => {
    const body = card.querySelector('.character-base')!.getBoundingClientRect();
    const layer = card.querySelector('.character-equipped')!.getBoundingClientRect();
    return { id: card.getAttribute('data-inspection-gear'), delta: Math.max(Math.abs(body.x - layer.x), Math.abs(body.y - layer.y), Math.abs(body.width - layer.width), Math.abs(body.height - layer.height)) };
  }));
  for (const item of registration) expect(item.delta, `${item.id} preserves the master canvas`).toBeLessThan(.5);
  await page.locator('.inspection-catalog').screenshot({ path: info.outputPath('all-35-worn-and-thumbnails.png'), animations: 'disabled' });
  const databases = await page.evaluate(() => indexedDB.databases());
  expect(databases.some(database => database.name === 'entrenos-local')).toBe(false);
});

test('all seven authored grips replace the open hand only while equipped and keep the same canvas', async ({ page }, info) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openInspection(page);
  const bodyImage = live(page).locator('.character-body image');
  const canvasBox = () => live(page).locator('.character-layers').evaluate(element => {
    const canvas = element.getBoundingClientRect(), container = element.closest('.inspection-live')!.getBoundingClientRect();
    return { x: canvas.x - container.x, y: canvas.y - container.y, width: canvas.width, height: canvas.height };
  });
  const initial = await canvasBox();
  await expect(bodyImage).not.toHaveAttribute('mask');
  for (const hand of GEAR.filter(gear => gear.slot === 'hand')) {
    await page.getByRole('combobox', { name: 'Mano', exact: true }).selectOption(hand.id);
    await expect(live(page).locator(`.character-equipped[data-gear-id="${hand.id}"]`)).toHaveCount(1);
    await expect(bodyImage).toHaveAttribute('mask', /url\(#.+\)/);
    await expect(live(page).locator('.character-foreground')).toHaveCount(0);
    expect(await canvasBox()).toEqual(initial);
    await live(page).screenshot({ path: info.outputPath(`authored-grip-${hand.id}.png`), animations: 'disabled' });
  }
  await page.getByRole('button', { name: 'Quitar todo', exact: true }).click();
  await expect(bodyImage).not.toHaveAttribute('mask');
  await expect(live(page).locator('.character-equipped')).toHaveCount(0);
  expect(await canvasBox()).toEqual(initial);
});

test('inspection mixes every slot and companion, pauses motion and respects effects and reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await openInspection(page);
  const labels = ['Cabeza', 'Torso', 'Piernas', 'Mano', 'Espalda'];
  for (let index = 0; index < INSPECTION_SLOTS.length; index++) await page.getByRole('combobox', { name: labels[index], exact: true }).selectOption(`ronin-${INSPECTION_SLOTS[index]}`);
  await page.getByRole('combobox', { name: 'Compañera', exact: true }).selectOption('dragon-queen');
  await expect(live(page).locator('.character-equipped')).toHaveCount(5);
  await expect(live(page).locator('.character-companion')).toHaveCount(1);
  await page.getByRole('navigation', { name: 'Animaciones de inspección' }).getByRole('button', { name: 'Poder', exact: true }).click();
  await expect.poll(() => animations(page)).toBeGreaterThan(0);
  const layers = live(page).locator('.character-layers');
  const first = await layers.evaluate(element => getComputedStyle(element).transform);
  await expect.poll(() => layers.evaluate(element => getComputedStyle(element).transform)).not.toBe(first);
  await page.getByRole('button', { name: 'Pausar animación', exact: true }).click();
  await expect.poll(() => animations(page)).toBe(0);
  await page.getByRole('button', { name: 'Reanudar animación', exact: true }).click();
  await expect.poll(() => animations(page)).toBeGreaterThan(0);
  await page.getByLabel('Efectos activados', { exact: true }).uncheck();
  await expect.poll(() => animations(page)).toBe(0);
  await page.getByLabel('Efectos activados', { exact: true }).check();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect.poll(() => animations(page)).toBe(0);
  await page.getByRole('button', { name: 'Quitar todo', exact: true }).click();
  await expect(live(page).locator('.character-equipped')).toHaveCount(0);
  await expect(live(page).locator('.character-companion')).toHaveCount(0);
  await page.getByLabel('Índice de combinación', { exact: false }).fill(String(CHARACTER_COMBINATION_COUNT - 1));
  await page.getByRole('button', { name: 'Cargar combinación', exact: true }).click();
  await expect(live(page).locator('.character-equipped')).toHaveCount(5);
  for (const id of inspectionCombination(CHARACTER_COMBINATION_COUNT - 1)) await expect(live(page).locator(`.character-equipped[data-gear-id="${id}"]`)).toHaveCount(1);
});

test('the overlap matrix includes every armor, classic cape or wings, and held item', async ({ page }, info) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openInspection(page);
  await expect(page.locator('.inspection-figure')).toHaveCount(3);
  await page.getByRole('button', { name: 'Mostrar todos los cruces', exact: true }).click();
  await expect(page.locator('#inspection-overlaps .inspection-figure')).toHaveCount(OVERLAP_INSPECTION_PRESETS.length);
  for (const preset of OVERLAP_INSPECTION_PRESETS) {
    const figure = page.locator(`[data-risk-id="${preset.id}"]`);
    await expect(figure.locator('.character-equipped')).toHaveCount(3);
    for (const id of preset.gearIds) await expect(figure.locator(`.character-equipped[data-gear-id="${id}"]`)).toHaveCount(1);
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.locator('[aria-labelledby="inspection-collections-title"]').screenshot({ path: info.outputPath('complete-collections.png'), animations: 'disabled' });
  await page.locator('#inspection-overlaps').screenshot({ path: info.outputPath('all-105-overlap-combinations.png'), animations: 'disabled' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
});

test('summary leads with the shared renderer and keeps training and customization reachable', async ({ page }, info) => {
  await page.addInitScript(() => sessionStorage.setItem('grind-intro-v1', '1'));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Resumen', exact: true })).toBeVisible();
  await expect(page.locator('main > section').first()).toHaveClass(/summary-character/);
  await expect(page.locator('.summary-character .character-avatar')).toHaveCount(1);
  await expect(page.locator('.summary-character')).toContainText('Nivel 1');
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
    await page.locator('.summary-character').screenshot({ path: info.outputPath(`summary-protagonist-${width}.png`), animations: 'disabled' });
  }
  await page.getByRole('button', { name: 'Personalizar personaje', exact: true }).click();
  await expect(page.getByRole('tab', { name: 'Colección', exact: true })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('navigation', { name: 'Navegación principal' }).getByRole('button', { name: 'Resumen', exact: true }).click();
  await page.locator('.summary-character-start').click();
  await expect(page.getByRole('heading', { name: 'Empezar entrenamiento', exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test('ascent renders in mobile and desktop and stops motion when requested', async ({ page }, info) => {
  await page.addInitScript(() => {
    sessionStorage.setItem('grind-intro-v1', '1');
    localStorage.setItem('entrenos-experience-v1', JSON.stringify({ effects: true, sound: false }));
  });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');
  await page.getByRole('button', { name: 'Ver ascenso de niveles', exact: true }).click();
  await expect(page.getByRole('tab', { name: 'Ascenso', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('heading', { name: 'Ascenso', exact: true })).toBeVisible();
  const artwork = page.locator('.ascent-art');
  await expect.poll(() => artwork.evaluate(element => element.getAnimations({ subtree: true }).filter(animation => animation.playState === 'running').length)).toBeGreaterThan(0);
  for (const width of [320, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
    await page.locator('.arcade-ascent-hero').screenshot({ path: info.outputPath(`ascent-${width}.png`), animations: 'disabled' });
  }
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect.poll(() => artwork.evaluate(element => element.getAnimations({ subtree: true }).filter(animation => animation.playState === 'running').length)).toBe(0);
});

test('failed clothing images keep a stable character frame', async ({ page }, info) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route(`**${CHARACTER_ATLAS.src}`, route => route.abort());
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await openInspection(page);
  await expect(page.locator('[data-inspection-gear="purple-tank"] [data-art-fallback="purple-tank"]')).toHaveCount(2);
  const before = await live(page).locator('.character-layers').boundingBox();
  await page.getByRole('combobox', { name: 'Torso', exact: true }).selectOption('purple-tank');
  await expect(live(page).locator('[data-art-fallback="purple-tank"]')).toHaveCount(1);
  const after = await live(page).locator('.character-layers').boundingBox();
  expect(after).toEqual(before);
  await expect(live(page).locator('.character-body image')).toHaveCount(1);
  await page.getByRole('combobox', { name: 'Mano', exact: true }).selectOption('titan-sword');
  await expect(live(page).locator('[data-art-fallback="titan-sword"]')).toHaveCount(1);
  await expect(live(page).locator('.character-body image')).not.toHaveAttribute('mask');
  expect(await live(page).locator('.character-layers').boundingBox()).toEqual(before);
  await page.locator('.inspection-live').screenshot({ path: info.outputPath('stable-clothing-fallback.png'), animations: 'disabled' });
  expect(errors).toEqual([]);
});

test('a failed master image shows the stable silhouette', async ({ page }, info) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route(`**${CHARACTER_MASTER.src}`, route => route.abort());
  await openInspection(page);
  await expect(live(page).locator('[data-art-fallback="master"]')).toHaveCount(1);
  await page.locator('.inspection-live').screenshot({ path: info.outputPath('stable-resource-fallback.png'), animations: 'disabled' });
});
