import { test, expect, type Page } from '@playwright/test';
import { gameProgress } from '../src/lib/game';
import type { AppData } from '../src/lib/model';

const nav = (page: Page) => page.getByRole('navigation', { name: 'Navegación principal' });

async function stored(page: Page): Promise<AppData> {
  return page.evaluate(() => new Promise<AppData>((resolve, reject) => {
    const request = indexedDB.open('cheesit-guest', 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result, tx = db.transaction('state', 'readonly');
      const get = tx.objectStore('state').get('local');
      get.onsuccess = () => resolve(get.result);
      get.onerror = () => reject(get.error);
      tx.oncomplete = () => db.close();
    };
  }));
}

async function objectives(page: Page) {
  await nav(page).getByRole('button', { name: 'Arcade', exact: true }).click();
  await page.getByRole('button', { name: 'Retos y logros', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Retos y logros' })).toBeVisible();
}

async function credits(page: Page) {
  const label = await page.locator('.arcade-wallet').getAttribute('aria-label');
  expect(label).toMatch(/créditos disponibles/);
  return Number(label!.replace(/\D/g, ''));
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.setItem('grind-intro-v1', '1');
    sessionStorage.setItem('cheesit-access-mode', 'guest');
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

test('weekly objectives show XP and credits and rotate across Madrid midnight, even after time away', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-11-08T22:50:00Z') });
  await page.goto('/');
  await objectives(page);
  const weekly = page.locator('[data-mission-scope="weekly"]');
  const keys = () => weekly.evaluateAll(cards => cards.map(card => card.getAttribute('data-mission-id')!.split(':')[0]));
  await expect(weekly).toHaveCount(3);
  await expect(page.locator('[data-mission-scope="career"]')).toHaveCount(35);
  for (const card of await weekly.all()) {
    const xp = Number(await card.getAttribute('data-mission-xp'));
    await expect(card).toContainText(`+${xp} XP`);
    await expect(card).toContainText(`+${xp / 5} créditos`);
  }
  const previous = await keys();
  await page.getByRole('button', { name: 'Recompensados', exact: true }).click();
  await expect(weekly).toHaveCount(3);
  expect(await keys()).toEqual(previous);
  await page.reload();
  await expect(weekly).toHaveCount(3);
  expect(await keys()).toEqual(previous);
  await page.clock.setSystemTime(new Date('2026-11-08T23:00:00Z'));
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(weekly.first()).toHaveAttribute('data-mission-id', /:2026-11-09$/);
  expect((await keys()).every(key => !previous.includes(key))).toBe(true);

  await page.clock.setSystemTime(new Date('2026-12-01T12:00:00Z'));
  await page.reload();
  await expect(weekly.first()).toHaveAttribute('data-mission-id', /:2026-11-30$/);
  await expect(weekly).toHaveCount(3);
});

test('saving a workout grants objective XP and credits once and preserves them through reload', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-04T12:00:00Z'));
  await page.goto('/');
  await expect(page.locator('.xp-label > strong')).toHaveText(/0\s*\/\s*800 XP/);
  await objectives(page);
  const startingCredits = await credits(page);
  expect((await stored(page)).game?.missionRewards ?? []).toEqual([]);

  await nav(page).getByRole('button', { name: 'Inicio', exact: true }).click();
  await page.getByRole('button', { name: 'Empezar entreno', exact: true }).click();
  await page.getByRole('button', { name: 'Empezar sin rutina', exact: true }).click();
  await page.getByRole('button', { name: 'Añadir ejercicio', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: /^Press de banca con barra/ }).click();
  await page.getByLabel('Carga en kg, serie 1 de Press de banca con barra').fill('50');
  await page.getByLabel('Repeticiones, serie 1 de Press de banca con barra').fill('8');
  await page.getByRole('button', { name: 'Confirmar serie 1', exact: true }).click();
  const close = page.getByRole('button', { name: 'Cerrar celebración', exact: true });
  if (await close.isVisible()) await close.click();
  expect((await stored(page)).game?.missionRewards ?? []).toEqual([]);
  await page.getByRole('button', { name: 'Guardar entrenamiento', exact: true }).click();
  await page.getByRole('dialog', { name: 'Finalizar entrenamiento' }).getByRole('button', { name: 'Guardar entrenamiento', exact: true }).click();
  await expect.poll(async () => (await stored(page)).game?.missionRewards?.length ?? 0).toBe(2);
  const celebration = page.getByRole('button', { name: 'Continuar', exact: true });
  if (await celebration.isVisible()) await celebration.click();

  const saved = await stored(page);
  const rewards = saved.game!.missionRewards!;
  expect(saved.workouts).toHaveLength(1);
  expect(saved.workouts[0].status).toBe('finished');
  expect(rewards.map(({ id, xp }) => ({ id, xp })).sort((a, b) => a.xp - b.xp)).toEqual([
    { id: 'career-groups-1', xp: 50 },
    { id: 'career-sessions-1', xp: 100 },
  ]);
  expect(gameProgress(saved.game!, saved.workouts, saved.profile).xp).toBe(410);
  await objectives(page);
  await expect(page.locator('[data-mission-id].completed')).toHaveCount(2);
  expect(await credits(page)).toBe(startingCredits + 82);
  await page.reload();
  await expect(page.locator('[data-mission-id].completed')).toHaveCount(2);
  expect(await credits(page)).toBe(startingCredits + 82);
  expect((await stored(page)).game?.missionRewards).toEqual(rewards);
});
