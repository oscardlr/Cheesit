/** Local visual QA in fresh, isolated browser contexts. Never opens a saved
 * browser profile or writes to the user's actual Cheesit storage. */
import { chromium, type Browser, type Page } from '@playwright/test';
import { copyFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { COMPANIONS } from '../src/lib/companions';
import { GEAR } from '../src/lib/gear';
import { normalizeGame, type InventoryItem } from '../src/lib/game';
import { CATALOG } from '../src/lib/catalog';
import { todayMadrid } from '../src/lib/dates';
import { DEFAULT_PROFILE } from '../src/lib/strength';
import { exerciseSnapshot, newId, newSet, newWorkout, type AppData } from '../src/lib/model';

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000';
const output = path.resolve('docs/block-three/views');
export async function captureCheesits(browser: Browser) {
const temporary = await mkdtemp(path.join(tmpdir(), 'cheesit-visual-capture-'));
await mkdir(output, { recursive: true });
const today = todayMadrid();
const dayBefore = (days: number) => new Date(Date.parse(`${today}T12:00:00Z`) - days * 86_400_000).toISOString().slice(0, 10);
const gearIds = ['headphones', 'purple-tank', 'lime-shorts', 'starlight-gauntlet', 'violet-cape', 'golden-armor', 'champion-crown', 'titan-sword'];
const acquiredAt = `${dayBefore(35)}T12:00:00.000Z`;
const inventory: InventoryItem[] = [
  ...gearIds.map(gearId => ({ id: newId(), kind: 'gear' as const, gearId, rarity: GEAR.find(item => item.id === gearId)!.rarity, acquiredAt, crateId: 'starter', sold: false })),
  ...COMPANIONS.map(companion => ({ id: newId(), kind: 'companion' as const, companionId: companion.id, rarity: companion.rarity, acquiredAt, crateId: 'starter', sold: false })),
];
const game = { ...normalizeGame(), inventory, transactions: inventory.map(item => ({ id: newId(), kind: 'crate' as const, itemId: item.id, amount: -100, createdAt: acquiredAt })), cosmeticGear: Object.fromEntries(gearIds.slice(0, 5).map(id => [GEAR.find(item => item.id === id)!.slot, id])), equippedCompanionId: 'iris' };
const exercises = ['Pecho', 'Espalda', 'Pierna y glúteo'].map(group => CATALOG.find(item => item.group === group && item.mode === 'external_load_reps')!);
const workouts = Array.from({ length: 10 }, (_, index) => {
  const date = dayBefore((9 - index) * 3 + 1), startedAt = `${date}T16:00:00.000Z`;
  return { ...newWorkout(), name: 'Fuerza equilibrada', date, status: 'finished' as const, createdAt: startedAt, updatedAt: `${date}T16:45:00.000Z`, startedAt, finishedAt: `${date}T16:45:00.000Z`, companionPassive: null,
    exercises: exercises.map(exercise => ({ id: newId(), ...exerciseSnapshot(exercise, DEFAULT_PROFILE), sets: Array.from({ length: 3 }, () => ({ ...newSet(), confirmed: true, weight: 30, weightText: '30', reps: 10, repsText: '10' })) })) };
});
const fixture: AppData = { routines: [], workouts, customExercises: [], game, profile: DEFAULT_PROFILE, preferences: { effects: true, sound: false } };

async function ready(page: Page) {
  await page.evaluate(async () => {
    document.querySelectorAll<HTMLImageElement>('img').forEach(image => { image.loading = 'eager'; });
    await Promise.all(Array.from(document.images).map(image => image.decode().catch(() => undefined)));
    await document.fonts.ready;
  });
  await page.waitForLoadState('networkidle');
}
async function seed(page: Page) {
  await page.goto(baseURL);
  await page.getByRole('heading', { name: 'Resumen', exact: true }).waitFor();
  await page.locator('.dashboard-footer .storage-status').filter({ hasText: 'Guardado en este dispositivo' }).waitFor();
  await page.evaluate(data => new Promise<void>((resolve, reject) => {
    const request = indexedDB.open('entrenos-local', 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result, tx = db.transaction('state', 'readwrite');
      tx.objectStore('state').put(data, 'local');
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => reject(tx.error);
    };
  }), fixture);
  await page.reload();
  await page.getByRole('heading', { name: 'Resumen', exact: true }).waitFor();
  await page.locator('.summary-character-stage [data-companion-id="iris"] img').waitFor();
  await ready(page);
}

try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  await context.addInitScript(() => sessionStorage.setItem('grind-intro-v1', '1'));
  const page = await context.newPage();
  await seed(page);
  await page.screenshot({ path: path.join(output, 'summary-desktop.png'), fullPage: true, animations: 'disabled' });
  await page.setViewportSize({ width: 390, height: 1000 });
  await ready(page);
  await page.screenshot({ path: path.join(output, 'summary-mobile.png'), fullPage: true, animations: 'disabled' });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole('button', { name: 'Personalizar personaje', exact: true }).click();
  await page.locator('.collection-subtabs').getByRole('button', { name: 'Aspectos', exact: true }).click();
  await page.locator('.cosmetic-slot-filters').getByRole('button', { name: 'Cheesit', exact: true }).click();
  await ready(page);
  await page.screenshot({ path: path.join(output, 'wardrobe.png'), fullPage: true, animations: 'disabled' });
  // Warm the development-only route before opening the recorded context.
  await page.goto(`${baseURL}/dev/cheesits`);
  await page.getByRole('heading', { name: 'Los ocho cheesits' }).waitFor();
  await ready(page);
  await context.close();

  const compactCSS = `.cheesit-inspection{max-width:1440px;padding:20px 30px 14px}.cheesit-inspection>header{margin-bottom:8px}.cheesit-inspection>header>a,.cheesit-inspection>header>p,.cheesit-inspection-note{display:none}.cheesit-inspection h1{font-size:32px;margin:6px 0}.cheesit-inspection-controls{margin:12px 0}.cheesit-inspection-grid{gap:12px;grid-template-columns:repeat(4,minmax(0,1fr))}.cheesit-inspection-card{height:350px;padding:14px}.cheesit-inspection-card>p,.cheesit-inspection-card>.cheesit-passive,.cheesit-inspection-card>button{display:none}.cheesit-inspection-art{height:246px;margin:2px 0}.cheesit-inspection-art>.companion-sprite{width:146px;height:244px}.cheesit-inspection-card>h2{font-size:17px;line-height:1.4;margin:8px 0 0}`;
  const videoContext = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'no-preference', recordVideo: { dir: temporary, size: { width: 1440, height: 1000 } } });
  await videoContext.addInitScript(css => {
    sessionStorage.setItem('grind-intro-v1', '1');
    document.addEventListener('DOMContentLoaded', () => { const style = document.createElement('style'); style.textContent = css; document.head.appendChild(style); }, { once: true });
  }, compactCSS);
  const motionPage = await videoContext.newPage();
  await motionPage.goto(`${baseURL}/dev/cheesits`);
  await motionPage.getByRole('heading', { name: 'Los ocho cheesits' }).waitFor();
  await ready(motionPage);
  await motionPage.screenshot({ path: path.join(output, 'cheesits-motion-idle.png') });
  await motionPage.waitForTimeout(3000);
  await motionPage.getByRole('button', { name: 'Celebración', exact: true }).click();
  await motionPage.waitForTimeout(4000);
  await motionPage.screenshot({ path: path.join(output, 'cheesits-motion-celebrate.png') });
  await motionPage.getByRole('button', { name: 'Pausar animaciones', exact: true }).click();
  await motionPage.waitForTimeout(1000);
  await motionPage.getByRole('button', { name: 'Reanudar animaciones', exact: true }).click();
  await motionPage.waitForTimeout(2000);
  const video = motionPage.video()!;
  await videoContext.close();
  const videoSource = await video.path();
  await copyFile(videoSource, path.join(output, 'cheesits-motion.webm'));

  console.log(JSON.stringify({ screenshots: ['summary-mobile.png', 'summary-desktop.png', 'wardrobe.png'], video: 'cheesits-motion.webm' }, null, 2));

} finally {
  await rm(temporary, { recursive: true, force: true });
}

}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try { await captureCheesits(browser); } finally { await browser.close(); }
}
