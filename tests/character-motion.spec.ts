import { test, expect, type Locator, type Page } from '@playwright/test';
import { GEAR } from '../src/lib/gear';
import { normalizeGame, type InventoryItem } from '../src/lib/game';
import type { AppData } from '../src/lib/model';
import { DEFAULT_PROFILE } from '../src/lib/strength';

const collections = ['ronin', 'glacier', 'cosmic'] as const;
const collectionLabels = { ronin: 'Ronin Carmesí', glacier: 'Guardián glacial', cosmic: 'Explorador cósmico' };
const slots = ['head', 'top', 'bottom', 'hand', 'back'] as const;
const newGearIds = collections.flatMap(collection => slots.map(slot => `${collection}-${slot}`));
const motions = [
  { label: 'Reposo', id: 'idle' },
  { label: 'Caminar', id: 'walk' },
  { label: 'Entrenar', id: 'train' },
  { label: 'Victoria', id: 'victory' },
  { label: 'Poder', id: 'power' },
] as const;
const avatar = (page: Page) => page.locator('.wardrobe-stage .character-avatar');
const motionControls = (page: Page) => page.getByRole('navigation', { name: 'Animaciones del personaje' });

async function stored(page: Page): Promise<AppData> {
  return page.evaluate(() => new Promise<AppData>((resolve, reject) => {
    const request = indexedDB.open('entrenos-local', 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction('state', 'readonly');
      const get = tx.objectStore('state').get('local');
      get.onsuccess = () => resolve(get.result);
      tx.oncomplete = () => db.close();
    };
  }));
}

async function seed(page: Page, equipped = true) {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Resumen', exact: true })).toBeVisible();
  const date = new Date().toISOString();
  const inventory: InventoryItem[] = newGearIds.map(gearId => ({
    id: crypto.randomUUID(), kind: 'gear', gearId,
    rarity: GEAR.find(gear => gear.id === gearId)!.rarity,
    acquiredAt: date, crateId: 'starter', sold: false,
  }));
  const game = {
    ...normalizeGame(), inventory,
    transactions: inventory.map(item => ({ id: crypto.randomUUID(), kind: 'crate' as const, itemId: item.id, amount: -100, createdAt: date })),
    cosmeticGear: equipped ? Object.fromEntries(slots.map(slot => [slot, `ronin-${slot}`])) : {},
  };
  const data: AppData = { routines: [], workouts: [], customExercises: [], game, profile: DEFAULT_PROFILE, preferences: { effects: true, sound: false } };
  await page.evaluate(value => new Promise<void>((resolve, reject) => {
    const request = indexedDB.open('entrenos-local', 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction('state', 'readwrite');
      tx.objectStore('state').put(value, 'local');
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => reject(tx.error);
    };
  }), data);
  await page.reload();
  await openWardrobe(page);
}

async function openWardrobe(page: Page) {
  await page.getByRole('navigation', { name: 'Navegación principal' }).getByRole('button', { name: 'Resumen', exact: true }).click();
  await page.getByRole('button', { name: 'Personalizar personaje', exact: true }).click();
  await expect(page.getByRole('tab', { name: 'Colección', exact: true })).toHaveAttribute('aria-selected', 'true');
}

const transforms = (locator: Locator) => locator.evaluateAll(elements => elements.map(element => getComputedStyle(element).transform));
const runningAnimations = (locator: Locator) => locator.evaluate(element => element.getAnimations({ subtree: true }).filter(animation => animation.playState === 'running').length);

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.setItem('grind-intro-v1', '1');
    if (!localStorage.getItem('entrenos-experience-v1')) localStorage.setItem('entrenos-experience-v1', JSON.stringify({ effects: true, sound: false }));
  });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
});

test('five accessible animation modes move the articulated body independently', async ({ page }, info) => {
  await seed(page);
  const character = avatar(page);
  const bodyJoints = character.locator('.character-body .character-joint');
  await expect(bodyJoints).toHaveCount(10);
  // Translation of the whole character cannot satisfy this check: the body joints
  // themselves must rotate, and opposing limbs must have different transforms.
  for (const motion of motions) {
    const button = motionControls(page).getByRole('button', { name: motion.label, exact: true });
    await button.click();
    await expect(button).toHaveAttribute('aria-pressed', 'true');
    await expect(character).toHaveAttribute('data-motion', motion.id);
    const first = await transforms(bodyJoints);
    await expect.poll(() => transforms(bodyJoints), { message: `${motion.label} should animate the individual body joints` }).not.toEqual(first);
  }
  await motionControls(page).getByRole('button', { name: 'Caminar', exact: true }).click();
  await expect.poll(async () => {
    const left = await transforms(character.locator('.character-body [data-joint="left-thigh"]'));
    const right = await transforms(character.locator('.character-body [data-joint="right-thigh"]'));
    return left[0] !== right[0];
  }).toBe(true);
  await page.getByRole('button', { name: 'Pausar animación', exact: true }).click();
  await expect.poll(() => runningAnimations(character)).toBe(0);
  const still = await transforms(bodyJoints);
  await expect.poll(() => transforms(bodyJoints)).toEqual(still);
  await page.getByRole('button', { name: 'Reanudar animación', exact: true }).click();
  await expect.poll(() => runningAnimations(character)).toBeGreaterThan(2);
  for (const width of [320, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width + 1);
    await page.locator('.wardrobe-character-preview').screenshot({ path: info.outputPath(`articulated-character-${width}.png`), animations: 'disabled' });
  }
});

test('held equipment and clothing share the body joint animation', async ({ page }) => {
  await seed(page);
  await motionControls(page).getByRole('button', { name: 'Entrenar', exact: true }).click();
  const character = avatar(page);
  await expect(character.locator('.character-equipped')).toHaveCount(5);
  // Freeze every timeline at the same moment to compare complete attachment
  // chains without timing differences between separate browser reads.
  const attachments = await character.evaluate(element => {
    for (const animation of element.getAnimations({ subtree: true })) {
      animation.pause();
      animation.currentTime = 375;
    }
    return ['torso', 'right-upper-arm', 'right-forearm'].map(joint => {
      const body = element.querySelector(`.character-body [data-joint="${joint}"]`)!;
      const gear = element.querySelector(`.character-slot-hand [data-joint="${joint}"]`)!;
      return { joint, body: getComputedStyle(body).transform, gear: getComputedStyle(gear).transform };
    });
  });
  for (const attachment of attachments) expect(attachment.gear, `The hand item follows ${attachment.joint}`).toBe(attachment.body);
  await expect(character.locator('.character-slot-head [data-joint="head"]')).toHaveCount(1);
  await expect(character.locator('.character-slot-top [data-joint="torso"]')).toHaveCount(1);
  for (const side of ['left', 'right']) await expect(character.locator(`.character-slot-bottom [data-joint="${side}-thigh"]`)).toHaveCount(1);
});

test('reduced motion and the saved effects preference stop articulated animations', async ({ page }) => {
  await seed(page);
  await motionControls(page).getByRole('button', { name: 'Poder', exact: true }).click();
  await expect.poll(() => runningAnimations(avatar(page))).toBeGreaterThan(2);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect.poll(() => runningAnimations(avatar(page))).toBe(0);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect.poll(() => runningAnimations(avatar(page))).toBeGreaterThan(2);
  await page.getByRole('button', { name: 'Ajustes de Cheesit', exact: true }).click();
  await page.getByRole('switch', { name: 'Efectos y confeti', exact: true }).click();
  await expect.poll(async () => (await stored(page)).preferences?.effects).toBe(false);
  await page.getByRole('navigation', { name: 'Navegación principal' }).getByRole('button', { name: 'Resumen', exact: true }).click();
  await openWardrobe(page);
  await expect.poll(() => runningAnimations(avatar(page))).toBe(0);
  await motionControls(page).getByRole('button', { name: 'Victoria', exact: true }).click();
  await expect(avatar(page)).toHaveAttribute('data-motion', 'victory');
  await expect.poll(() => runningAnimations(avatar(page))).toBe(0);
});

test('each new collection equips all five native designs and its abilities persist', async ({ page }, info) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await seed(page, false);
  await page.locator('.collection-subtabs').getByRole('button', { name: 'Aspectos', exact: true }).click();
  const collectionFilters = page.getByRole('navigation', { name: 'Filtrar aspectos por colección' });
  for (const collection of collections) {
    const filter = collectionFilters.getByRole('button', { name: collectionLabels[collection], exact: true });
    await filter.click();
    await expect(filter).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.cosmetic-card')).toHaveCount(5);
    for (const slot of slots) {
      const gearId = `${collection}-${slot}`;
      const card = page.locator(`.cosmetic-card[data-gear-id="${gearId}"]`);
      await expect(card.getByRole('heading', { name: GEAR.find(gear => gear.id === gearId)!.name, exact: true })).toBeVisible();
      await card.getByRole('button', { name: 'Usar aspecto', exact: true }).click();
      await expect.poll(async () => (await stored(page)).game?.cosmeticGear?.[slot]).toBe(gearId);
      await expect(avatar(page).locator(`.character-equipped[data-gear-id="${gearId}"]`)).toHaveCount(1);
      await card.getByRole('button', { name: 'Preparar habilidad', exact: true }).click();
      await expect.poll(async () => (await stored(page)).game?.activeAbilityId).toBe(gearId);
    }
    await page.locator('.wardrobe-stage').screenshot({ path: info.outputPath(`${collection}-equipped.png`), animations: 'disabled' });
    await page.locator('.wardrobe-looks > .cosmetic-grid').screenshot({ path: info.outputPath(`${collection}-designs.png`), animations: 'disabled' });
  }
  await collectionFilters.getByRole('button', { name: 'Todas', exact: true }).click();
  await expect(page.locator('.cosmetic-card')).toHaveCount(15);
  await page.reload();
  await openWardrobe(page);
  await expect(avatar(page).locator('.character-equipped')).toHaveCount(5);
  for (const slot of slots) await expect(avatar(page).locator(`.character-equipped[data-gear-id="cosmic-${slot}"]`)).toHaveCount(1);
  await page.locator('.collection-subtabs').getByRole('button', { name: 'Habilidades', exact: true }).click();
  await expect(page.locator('.ability-card[data-ability-id="cosmic-back"]')).toHaveClass(/is-active/);
  await expect(page.locator('.ability-card[data-ability-id="cosmic-back"] .ability-charge-row strong')).toHaveText('1');
});
