import { expect, test, type Page } from '@playwright/test';
import { COMPANIONS } from '../src/lib/companions';
import { getCompanionPassive } from '../src/lib/cheesit-passives';
import { normalizeGame, type InventoryItem } from '../src/lib/game';
import { exerciseSnapshot, newId, newSet, newWorkout, type AppData, type Workout } from '../src/lib/model';
import { CATALOG } from '../src/lib/catalog';
import { todayMadrid } from '../src/lib/dates';
import { DEFAULT_PROFILE } from '../src/lib/strength';

const nav = (page: Page) => page.getByRole('navigation', { name: 'Navegación principal' });
async function stored(page: Page): Promise<AppData> {
  return page.evaluate(() => new Promise<AppData>((resolve, reject) => {
    const request = indexedDB.open('entrenos-local', 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result, tx = db.transaction('state', 'readonly'), get = tx.objectStore('state').get('local');
      get.onsuccess = () => resolve(get.result);
      tx.oncomplete = () => db.close();
    };
  }));
}
async function seed(page: Page, owned: string[] = ['athlete', 'iris'], workouts: Workout[] = []) {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Resumen', exact: true })).toBeVisible();
  const date = new Date().toISOString();
  const inventory: InventoryItem[] = owned.map(companionId => ({ id: newId(), kind: 'companion', companionId, rarity: COMPANIONS.find(item => item.id === companionId)!.rarity, acquiredAt: date, crateId: 'starter', sold: false }));
  const game = { ...normalizeGame(), inventory, transactions: inventory.map(item => ({ id: newId(), kind: 'crate' as const, itemId: item.id, amount: -100, createdAt: date })), equippedCompanionId: owned[0] ?? null };
  const data: AppData = { routines: [], workouts, customExercises: [], game, profile: DEFAULT_PROFILE, preferences: { effects: true, sound: false } };
  await page.evaluate(data => new Promise<void>((resolve, reject) => {
    const request = indexedDB.open('entrenos-local', 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result, tx = db.transaction('state', 'readwrite');
      tx.objectStore('state').put(data, 'local');
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => reject(tx.error);
    };
  }), data);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Resumen', exact: true })).toBeVisible();
}
async function collection(page: Page) {
  await nav(page).getByRole('button', { name: 'Resumen', exact: true }).click();
  await page.getByRole('button', { name: 'Personalizar personaje', exact: true }).click();
  await expect(page.getByRole('tab', { name: 'Colección', exact: true })).toHaveAttribute('aria-selected', 'true');
}
async function begin(page: Page) {
  await nav(page).getByRole('button', { name: 'Empezar entrenamiento', exact: true }).click();
  await page.getByRole('main').getByRole('button', { name: /Empezar entrenamiento/ }).click();
  await expect(page.getByRole('heading', { name: 'Entrenamiento', exact: true })).toBeVisible();
  await expect.poll(async () => (await stored(page)).workouts.length).toBe(1);
  return (await stored(page)).workouts[0];
}
async function confirmOne(page: Page) {
  await page.getByRole('button', { name: '＋ Añadir ejercicio' }).click();
  await page.getByRole('dialog').getByRole('button', { name: /^Extensión de cuádriceps/ }).click();
  await page.getByLabel('Carga en kg, serie 1 de Extensión de cuádriceps').fill('30');
  await page.getByLabel('Repeticiones, serie 1 de Extensión de cuádriceps').fill('8');
  await page.getByRole('button', { name: 'Confirmar serie 1' }).click();
  await page.getByRole('button', { name: 'Cerrar celebración' }).click();
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem('grind-intro-v1', '1'));
});

test('eight cheesit cards expose exact passives and owned, equipped and pending states', async ({ page }, info) => {
  test.setTimeout(60000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await seed(page);
  await expect(page.locator('.summary-character-copy [data-passive-status="equipped"]')).toHaveCount(1);
  await collection(page);
  await page.locator('.collection-subtabs').getByRole('button', { name: 'Aspectos', exact: true }).click();
  await page.locator('.cosmetic-slot-filters').getByRole('button', { name: 'Cheesit', exact: true }).click();
  const cards = page.locator('.wardrobe-looks article[data-item-kind="companion"]');
  await expect(cards).toHaveCount(8);
  for (const companion of COMPANIONS) {
    const card = page.locator(`.wardrobe-looks article[data-item-kind="companion"][data-companion-id="${companion.id}"]`), passive = getCompanionPassive(companion.id)!;
    await expect(card).toContainText(companion.name);
    await expect(card).toContainText(passive.name);
    await expect(card).toContainText(passive.valueLabel);
    await expect(card).toContainText(passive.description);
    await expect(card.locator('.companion-sprite')).toHaveCount(1);
    await expect(card.getByText(/cargas|Activar|Preparar/)).toHaveCount(0);
  }
  await expect(cards.locator('[data-passive-status="equipped"]')).toHaveCount(1);
  await expect(cards.locator('[data-passive-status="available"]')).toHaveCount(1);
  await expect(cards.locator('[data-passive-status="locked"]')).toHaveCount(6);
  for (const width of [320, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width + 1);
    await page.screenshot({ path: info.outputPath(`cheesit-cards-${width}.png`), fullPage: true, animations: 'disabled' });
  }
});

test('equipment controls one passive, snapshot survives a mid-session change, editing and reload', async ({ page }, info) => {
  test.setTimeout(60000);
  await seed(page);
  const original = await begin(page);
  expect(original.companionPassive?.companionId).toBe('athlete');
  await collection(page);
  const iris = page.locator('.loot-item-card[data-definition-id="iris"]');
  await iris.getByRole('button', { name: 'Equipar cheesit', exact: true }).click();
  await expect.poll(async () => (await stored(page)).game?.equippedCompanionId).toBe('iris');
  await expect(page.locator('.wardrobe-slot-companion [data-passive-status="equipped"]')).toHaveCount(1);
  await page.goto(`/#view=editor&id=${original.id}`);
  await expect(page.getByRole('complementary', { name: 'Pasiva del cheesit de esta sesión' })).toContainText('Vega');
  await confirmOne(page);
  await page.getByRole('button', { name: 'Finalizar entrenamiento', exact: true }).click();
  const celebration = page.getByRole('dialog', { name: 'SESIÓN COMPLETADA.', exact: true });
  await expect(celebration.getByLabel('Bonificación del cheesit')).toContainText('+20 XP');
  await expect(celebration.getByLabel('Bonificación del cheesit')).toContainText('Vega');
  await expect(celebration.locator('.companion-sprite')).toHaveAttribute('data-companion-id', 'athlete');
  const announcedXp = Number((await celebration.locator('.celebration-reward').getAttribute('aria-label'))?.split(' ')[0]);
  await expect(celebration.locator('.celebration-reward>span')).toHaveText(`+${new Intl.NumberFormat('es-ES').format(announcedXp)}`);
  await celebration.screenshot({ path: info.outputPath('cheesit-session-celebration.png'), animations: 'disabled' });
  const first = await stored(page), award = first.workouts[0].companionReward;
  expect(award?.bonusXp).toBe(20);
  expect(first.game?.abilityUses ?? []).toHaveLength(0);
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  await page.goto(`/#view=detail&id=${original.id}`);
  await expect(page.getByLabel('Recompensas del entrenamiento')).toContainText('Bonificación del cheesit');
  await page.getByRole('button', { name: 'Editar entrenamiento', exact: true }).click();
  await page.getByRole('button', { name: 'Guardar cambios', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Resumen', exact: true })).toBeVisible();
  await page.reload();
  expect((await stored(page)).workouts[0].companionReward).toEqual(award);
  expect((await stored(page)).game?.abilityUses ?? []).toHaveLength(0);
  await collection(page);
  await page.locator('.loot-item-card[data-definition-id="iris"]').getByRole('button', { name: 'Quitar cheesit', exact: true }).click();
  await expect.poll(async () => (await stored(page)).game?.equippedCompanionId).toBe(null);
  await nav(page).getByRole('button', { name: 'Resumen', exact: true }).click();
  await expect(page.locator('.summary-character-copy [data-passive-status="equipped"]')).toHaveCount(0);
  expect((await stored(page)).workouts[0].companionReward).toEqual(award);
});

test('legacy drafts remain ineligible and history repetitions snapshot the currently equipped cheesit', async ({ page }) => {
  test.setTimeout(60000);
  const legacy = newWorkout();
  delete legacy.companionPassive;
  const exercise = CATALOG.find(item => item.id === 'extension-cuadriceps') ?? CATALOG.find(item => item.group === 'Pierna y glúteo')!;
  legacy.exercises = [{ id: newId(), ...exerciseSnapshot(exercise, DEFAULT_PROFILE), sets: [{ ...newSet(), confirmed: true, weight: 20, weightText: '20', reps: 8, repsText: '8' }] }];
  await seed(page, ['iris'], [legacy]);
  await page.goto(`/#view=editor&id=${legacy.id}`);
  await expect(page.getByLabel('Pasiva del cheesit de esta sesión')).toContainText('sin bonificaciones retroactivas');
  await page.getByRole('button', { name: 'Finalizar entrenamiento', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'SESIÓN COMPLETADA.', exact: true })).toBeVisible();
  expect((await stored(page)).workouts[0].companionReward).toBeUndefined();
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  await page.goto(`/#view=detail&id=${legacy.id}`);
  await page.getByRole('button', { name: 'Repetir sesión', exact: true }).click();
  await expect.poll(async () => (await stored(page)).workouts.length).toBe(2);
  const repeated = (await stored(page)).workouts.find(item => item.id !== legacy.id)!;
  expect(repeated.companionPassive?.companionId).toBe('iris');
  expect(repeated.companionPassive?.workoutId).toBe(repeated.id);
  expect(repeated.companionReward).toBeUndefined();
  expect(repeated.date).toBe(todayMadrid());
});

test('the preview keeps all eight static in reduced motion and fits mobile and desktop', async ({ page }, info) => {
  test.setTimeout(60000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/dev/cheesits');
  await expect(page.getByRole('heading', { name: 'Los ocho cheesits' })).toBeVisible();
  await expect(page.locator('.cheesit-inspection-card')).toHaveCount(8);
  await page.getByRole('button', { name: 'Celebración', exact: true }).click();
  await expect.poll(() => page.locator('.cheesit-figure,.cheesit-aura,.cheesit-spark').evaluateAll(elements => elements.length >= 8 && elements.every(element => getComputedStyle(element).animationName === 'none'))).toBe(true);
  await page.getByRole('button', { name: 'Mostrar estados pendientes', exact: true }).click();
  await expect(page.locator('[data-passive-status="locked"]')).toHaveCount(6);
  await page.getByRole('button', { name: 'Mostrar todos disponibles', exact: true }).click();
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 1100 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width + 1);
    await page.screenshot({ path: info.outputPath(`cheesits-contact-sheet-${width}.png`), fullPage: true, animations: 'disabled' });
  }
});

test('summary loads only the equipped portrait and app effects can disable all its motion', async ({ page }) => {
  const portraits = new Set<string>();
  page.on('request', request => {
    const pathname = new URL(request.url()).pathname;
    if (pathname.startsWith('/assets/cheesits/')) portraits.add(pathname);
  });
  await seed(page, COMPANIONS.map(companion => companion.id));
  const sprite = page.locator('.summary-character-stage .companion-sprite');
  await expect(sprite).toHaveAttribute('data-companion-id', 'athlete');
  await expect(sprite.locator('img')).toBeVisible();
  expect([...portraits]).toEqual(['/assets/cheesits/athlete.png']);
  await page.getByRole('button', { name: 'Ajustes de Cheesit', exact: true }).click();
  await page.getByRole('switch', { name: 'Efectos y confeti', exact: true }).click();
  await nav(page).getByRole('button', { name: 'Resumen', exact: true }).click();
  await expect(sprite).toHaveAttribute('data-running', 'false');
  for (const layer of ['.cheesit-figure', '.cheesit-aura', '.cheesit-spark']) {
    await expect(sprite.locator(layer).first()).toHaveCSS('animation-name', 'none');
  }
});

test('visible cheesits animate in idle and celebration while offscreen and paused cheesits remain still', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/dev/cheesits');
  const first = page.locator('.companion-sprite').first(), last = page.locator('.companion-sprite').last();
  const activeNames = () => first.locator('.cheesit-figure,.cheesit-aura,.cheesit-spark').evaluateAll(elements => elements.flatMap(element => getComputedStyle(element).animationName.split(',').map(name => name.trim())).filter(name => name.startsWith('cheesit-')).sort().join(','));
  await first.scrollIntoViewIfNeeded();
  await expect(first).toHaveAttribute('data-motion', 'idle');
  await expect(first).toHaveAttribute('data-running', 'true');
  await expect(last).toHaveAttribute('data-running', 'false');
  await expect.poll(activeNames).not.toBe('');
  const idle = await activeNames();
  await page.getByRole('button', { name: 'Celebración', exact: true }).click();
  await expect(first).toHaveAttribute('data-motion', 'celebrate');
  await expect.poll(activeNames).not.toBe(idle);
  await expect.poll(activeNames).not.toBe('');
  await page.getByRole('button', { name: 'Pausar animaciones', exact: true }).click();
  await expect.poll(() => page.locator('.companion-sprite').evaluateAll(elements => elements.length === 8 && elements.every(element => element.getAttribute('data-running') === 'false'))).toBe(true);
  await expect.poll(() => page.locator('.cheesit-figure,.cheesit-aura,.cheesit-spark').evaluateAll(elements => elements.every(element => getComputedStyle(element).animationName === 'none'))).toBe(true);
});
