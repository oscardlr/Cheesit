import { test, expect, type Page } from '@playwright/test';
import { COMPANIONS } from '../src/lib/companions';
import { GEAR } from '../src/lib/gear';
import { isGameState, normalizeGame, type GameState } from '../src/lib/game';
import { inspectionGame } from '../src/lib/character-inspection';
import { DEFAULT_PROFILE } from '../src/lib/strength';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem('grind-intro-v1', '1'));
});

async function seed(page: Page, game: GameState) {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Continuar como invitado', exact: true })).toBeVisible();
  await page.evaluate(data => new Promise<void>((resolve, reject) => {
    const request = indexedDB.open('cheesit-guest', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('state');
    request.onsuccess = () => {
      const db = request.result, tx = db.transaction('state', 'readwrite');
      tx.objectStore('state').put(data, 'local');
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => reject(tx.error);
    };
    request.onerror = () => reject(request.error);
  }), { routines: [], workouts: [], customExercises: [], profile: DEFAULT_PROFILE, game, preferences: { effects: false, sound: false } });
  await page.getByRole('button', { name: 'Continuar como invitado', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Resumen', exact: true })).toBeVisible();
}

test('every active mobile destination scrolls smoothly without replacing its view or state', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await seed(page, normalizeGame());
  const nav = page.getByRole('navigation', { name: 'Navegación principal' });
  for (const label of ['Resumen', 'Calendario', 'Rutinas', 'Progreso', 'Arcade']) {
    const button = nav.getByRole('button', { name: label, exact: true });
    await button.click();
    if (label === 'Calendario') await page.getByRole('button', { name: 'Mes anterior', exact: true }).click();
    if (label === 'Arcade') await page.getByRole('button', { name: 'Personalizar personaje', exact: true }).click();
    const hash = await page.evaluate(() => location.hash);
    const state = label === 'Calendario' ? await page.locator('.calendar-title h2').textContent() : '';
    await page.locator('main.app-content').evaluate(main => {
      main.setAttribute('data-instance', 'preserved');
      main.style.minHeight = '2000px';
      const native = Element.prototype.scrollTo;
      Element.prototype.scrollTo = function (this: Element, options: ScrollToOptions) {
        document.documentElement.dataset.scrollBehavior = options.behavior;
        Reflect.apply(native, this, [options]);
      } as typeof Element.prototype.scrollTo;
      window.scrollTo({ top: 500, behavior: 'instant' });
    });
    await expect.poll(() => page.evaluate(() => document.scrollingElement!.scrollTop)).toBeGreaterThan(100);
    await button.click();
    await expect.poll(() => page.evaluate(() => document.scrollingElement!.scrollTop)).toBe(0);
    await expect(page.locator('html')).toHaveAttribute('data-scroll-behavior', 'smooth');
    await expect(page.locator('main.app-content')).toHaveAttribute('data-instance', 'preserved');
    expect(await page.evaluate(() => location.hash)).toBe(hash);
    if (label === 'Calendario') await expect(page.locator('.calendar-title h2')).toHaveText(state!);
    if (label === 'Arcade') await expect(page.getByRole('tab', { name: 'Colección', exact: true })).toHaveAttribute('aria-selected', 'true');
  }
});

test('active tabs find a nested scroll container and reduced motion returns instantly', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await seed(page, normalizeGame());
  await page.locator('main.app-content').evaluate(main => {
    main.style.cssText = 'height:400px;overflow-y:auto';
    const spacer = document.createElement('div');
    spacer.style.height = '2000px';
    main.append(spacer);
    main.scrollTop = 500;
  });
  await expect.poll(() => page.locator('main.app-content').evaluate(main => main.scrollTop)).toBe(500);
  await page.getByRole('navigation', { name: 'Navegación principal' }).getByRole('button', { name: 'Resumen', exact: true }).click();
  await expect.poll(() => page.locator('main.app-content').evaluate(main => main.scrollTop)).toBe(0);
});

test('all companions share a wide stage, hide portrait names and restore the unchanged solo pose', async ({ page }, info) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/dev/character');
  const live = page.locator('.inspection-live');
  const party = live.locator('.character-party');
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.getByRole('combobox', { name: 'Cheesit', exact: true }).selectOption('');
    const solo = await live.locator('.character-layers').boundingBox();
    for (const companion of COMPANIONS) {
      await page.getByRole('combobox', { name: 'Cheesit', exact: true }).selectOption(companion.id);
      await expect(party).toHaveClass(/has-companion/);
      await expect(live.getByText(companion.name, { exact: true })).toBeHidden();
      await expect(live.locator('.party-level')).toBeVisible();
      const boxes = await party.evaluate(element => {
        const box = (selector: string) => {
          const r = element.querySelector(selector)!.getBoundingClientRect();
          return { x: r.x, y: r.y, right: r.right, bottom: r.bottom, width: r.width };
        };
        return { stage: element.getBoundingClientRect().toJSON(), body: box('.character-layers'), companion: box('.character-companion'), platform: box('.party-platform'), level: box('.party-level') };
      });
      expect(boxes.body.right).toBeLessThanOrEqual(boxes.companion.x + 1);
      expect(boxes.platform.width).toBeGreaterThan(boxes.stage.width * .9);
      for (const member of [boxes.body, boxes.companion, boxes.level]) {
        expect(member.x).toBeGreaterThanOrEqual(boxes.stage.x - 1);
        expect(member.right).toBeLessThanOrEqual(boxes.stage.right + 1);
        expect(member.y).toBeGreaterThanOrEqual(boxes.stage.y - 1);
        expect(member.bottom).toBeLessThanOrEqual(boxes.stage.bottom + 1);
      }
      expect(boxes.level.y).toBeGreaterThan(boxes.companion.bottom);
      if (['athlete', 'dragon-queen'].includes(companion.id)) await live.screenshot({ path: info.outputPath(`duo-${companion.id}-${width}.png`) });
    }
    await page.getByRole('combobox', { name: 'Cheesit', exact: true }).selectOption('');
    await expect(live.locator('.party-platform')).toHaveCount(0);
    expect(await live.locator('.character-layers').boundingBox()).toEqual(solo);
    await expect(live.locator('.character-avatar>.character-level')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width + 1);
  }
});

test('equipped slots use all four rarity backgrounds and collection cards still equip and remove', async ({ page }, info) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const game = inspectionGame([]);
  game.inventory = game.inventory.map(item => ({ ...item, id: crypto.randomUUID() }));
  game.transactions = game.inventory.map(item => ({ id: crypto.randomUUID(), kind: 'crate', itemId: item.id, amount: -100, createdAt: item.acquiredAt }));
  expect(isGameState(game)).toBe(true);
  await seed(page, game);
  await page.getByRole('button', { name: 'Personalizar personaje', exact: true }).click();
  const panel = page.getByRole('navigation', { name: 'Organizar colección' });
  await panel.getByRole('button', { name: 'Aspectos', exact: true }).click();
  const backgrounds = new Set<string>();
  for (const rarity of ['common', 'rare', 'epic', 'legendary'] as const) {
    const gear = GEAR.find(item => item.rarity === rarity)!;
    const card = page.locator(`.cosmetic-card[data-gear-id="${gear.id}"]`);
    await card.getByRole('button', { name: 'Usar aspecto', exact: true }).click();
    const slot = page.locator(`.wardrobe-slot[data-slot="${gear.slot}"]`);
    await expect(slot).toHaveAttribute('data-rarity', rarity);
    await expect(slot).toContainText(gear.name);
    await expect(slot.getByRole('button', { name: /Quitar/ })).toHaveCount(0);
    for (const width of [320, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      const style = await slot.evaluate(element => ({ background: getComputedStyle(element).backgroundColor, radius: getComputedStyle(element).borderRadius }));
      expect(style.background).not.toBe('rgba(0, 0, 0, 0)');
      expect(parseInt(style.radius)).toBeGreaterThan(0);
      backgrounds.add(style.background);
      await slot.screenshot({ path: info.outputPath(`slot-${rarity}-${width}.png`) });
    }
    await card.getByRole('button', { name: 'Quitar aspecto', exact: true }).click();
    await expect(slot).not.toHaveAttribute('data-rarity');
  }
  expect(backgrounds.size).toBe(4);
  for (const companion of COMPANIONS.slice(0, 4)) {
    await page.locator(`.cosmetic-card[data-companion-id="${companion.id}"]`).getByRole('button', { name: 'Equipar cheesit', exact: true }).click();
    await expect(page.locator('.wardrobe-slot-companion')).toHaveAttribute('data-rarity', companion.rarity);
  }
  const companion = COMPANIONS[0];
  const companionCard = page.locator(`.cosmetic-card[data-companion-id="${companion.id}"]`);
  await companionCard.getByRole('button', { name: 'Equipar cheesit', exact: true }).click();
  await expect(page.locator('.wardrobe-slot-companion')).toHaveAttribute('data-rarity', companion.rarity);
  await expect(page.locator('.wardrobe-slot-companion')).toContainText(companion.name);
  await expect(page.locator('.wardrobe-character-preview').getByText(companion.name, { exact: true })).toBeHidden();
  await page.reload();
  await expect(page.locator('.wardrobe-slot-companion')).toHaveAttribute('data-rarity', companion.rarity);
  await expect(page.locator('.wardrobe-stage .party-level')).toBeVisible();
  for (const width of [320, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.getByRole('tab', { name: 'Cofres', exact: true }).click();
    await expect(page.locator('.arcade-crate-intro .party-level')).toBeVisible();
    await expect(page.locator('.arcade-crate-intro').getByText(companion.name, { exact: true })).toBeHidden();
    await page.locator('.arcade-crate-intro').screenshot({ path: info.outputPath(`crates-duo-${width}.png`) });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width + 1);
  }
  await page.getByRole('navigation', { name: 'Navegación principal' }).getByRole('button', { name: 'Resumen', exact: true }).click();
  await expect(page.locator('.summary-character .party-level')).toBeVisible();
  await expect(page.locator('.summary-character').getByText(companion.name, { exact: true })).toBeHidden();
  await page.locator('.summary-character').screenshot({ path: info.outputPath('summary-duo.png') });
});
