import { expect, test, type Page } from '@playwright/test';
import { recordBodyWeight } from '../src/lib/body-weight';
import { emptyData, type AppData } from '../src/lib/model';
import { DEFAULT_PROFILE } from '../src/lib/strength';

test.use({ timezoneId: 'America/Los_Angeles', actionTimeout: 15000 });
async function seedGuest(page: Page, data: AppData = emptyData()) {
  await page.addInitScript(() => sessionStorage.setItem('grind-intro-v1', '1'));
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Continuar como invitado', exact: true })).toBeVisible();
  await page.evaluate(value => new Promise<void>((resolve, reject) => {
    const request = indexedDB.open('cheesit-guest', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('state');
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result, tx = db.transaction('state', 'readwrite');
      tx.objectStore('state').put(value, 'local');
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    };
  }), data);
  await page.getByRole('button', { name: 'Continuar como invitado', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Resumen', exact: true })).toBeVisible();
}
async function stored(page: Page): Promise<AppData> {
  return page.evaluate(() => new Promise((resolve, reject) => {
    const request = indexedDB.open('cheesit-guest', 1);
    request.onsuccess = () => { const db = request.result, tx = db.transaction('state'), q = tx.objectStore('state').get('local'); tx.oncomplete = () => { resolve(q.result); db.close(); }; tx.onerror = () => reject(tx.error); };
  }));
}

test('summary appears only Saturday/Sunday in Madrid, including transitions while the app stays open', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-06T22:59:59Z'));
  await seedGuest(page);
  await expect(page.getByRole('region', { name: 'Tu semana en Cheesit', exact: true })).toHaveCount(0);
  for (const [instant, visible] of [
    ['2026-11-06T23:00:00Z', true],
    ['2026-11-08T12:00:00Z', true],
    ['2026-11-08T23:00:00Z', false],
    ['2026-11-10T12:00:00Z', false],
    ['2026-11-11T12:00:00Z', false],
    ['2026-11-12T12:00:00Z', false],
    ['2026-11-13T12:00:00Z', false],
  ] as const) {
    await page.clock.setFixedTime(new Date(instant));
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    const summary = page.getByRole('region', { name: 'Tu semana en Cheesit', exact: true });
    await expect(summary).toHaveCount(visible ? 1 : 0);
    if (visible) await expect(summary.locator('.period-row strong')).toHaveText('2026-11-02 — 2026-11-08');
  }
});

test('new weight always uses Madrid today at save time and corrections keep their historical date without a selector', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-04T22:59:30Z'));
  const profile = recordBodyWeight(DEFAULT_PROFILE, { date: '2026-11-01', weightKg: 72 }, '2026-11-04');
  await seedGuest(page, { ...emptyData(), profile });
  await page.getByRole('navigation', { name: 'Navegación principal' }).getByRole('button', { name: 'Progreso', exact: true }).click();
  const section = page.locator('.body-weight-progress');
  await expect(section).toBeVisible();
  await expect(section.locator('input[type="date"]')).toHaveCount(0);
  await section.getByLabel('Peso corporal (kg)', { exact: true }).fill('73');
  // No remount or input edit after midnight: submission must resolve the new Madrid date itself.
  await page.clock.setFixedTime(new Date('2026-11-04T23:00:01Z'));
  await section.getByRole('button', { name: 'Guardar peso', exact: true }).click();
  await expect(section.getByText('Peso guardado.', { exact: true })).toBeVisible();
  expect((await stored(page)).profile?.weightTracking?.entries).toEqual([{ date: '2026-11-01', weightKg: 72 }, { date: '2026-11-05', weightKg: 73 }]);
  await section.locator('.body-weight-history summary').click();
  await section.getByLabel('Corregir peso del 2026-11-01', { exact: true }).click();
  await expect(section.locator('.body-weight-date time')).toHaveAttribute('datetime', '2026-11-01');
  await expect(section.locator('input[type="date"]')).toHaveCount(0);
  await section.getByLabel('Peso corporal (kg)', { exact: true }).fill('71');
  await page.clock.setFixedTime(new Date('2026-11-05T23:00:01Z'));
  await section.getByRole('button', { name: 'Guardar corrección', exact: true }).click();
  await expect(section.getByText('Registro corregido. La XP no se vuelve a premiar.', { exact: true })).toBeVisible();
  const corrected = (await stored(page)).profile!;
  expect(corrected.weightTracking?.entries).toEqual([{ date: '2026-11-01', weightKg: 71 }, { date: '2026-11-05', weightKg: 73 }]);
  expect(corrected.weightKg).toBe(73);
  await page.reload();
  // Production remembers explicit guest access in this tab across reloads.
  await page.getByRole('navigation', { name: 'Navegación principal' }).getByRole('button', { name: 'Progreso', exact: true }).click();
  await expect(section).toBeVisible();
  await expect(section.locator('input[type="date"]')).toHaveCount(0);
  expect((await stored(page)).profile?.weightTracking?.entries).toEqual(corrected.weightTracking?.entries);
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await section.screenshot({ path: `artifacts/weekend-weight/body-weight-${width}.png`, animations: 'disabled' });
  }
});
