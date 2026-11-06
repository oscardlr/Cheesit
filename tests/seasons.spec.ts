import { expect, test, type Page } from '@playwright/test';
import { representativeWorkout } from '../scripts/simulate-season-progression';
import { normalizeGame, reconcileSeasonProgression, gameProgress, levelCrate } from '../src/lib/game';
import type { AppData } from '../src/lib/model';

async function seed(page: Page, data: AppData) {
  await page.addInitScript(() => {
    sessionStorage.setItem('grind-intro-v1', '1');
    sessionStorage.setItem('cheesit-access-mode', 'guest');
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Inicio', exact: true })).toBeVisible();
  await page.evaluate(data => new Promise<void>((resolve, reject) => {
    const request = indexedDB.open('cheesit-guest', 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result, tx = db.transaction('state', 'readwrite');
      const store = tx.objectStore('state');
      const revision = store.get('local-revision');
      revision.onsuccess = () => {
        store.put(data, 'local');
        store.put((revision.result ?? 0) + 1, 'local-revision');
      };
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    };
  }), data);
  await page.reload();
  await expect(page.getByRole('heading',{name:'Inicio',exact:true})).toBeVisible();
}
async function noOverflow(page: Page) {
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
}
for (const width of [390,1440]) {
  test(`permanent level through New Year, cumulative muscle activity and late focus at ${width}px`,async({page},info)=>{
    test.setTimeout(90000);
    const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
    await page.setViewportSize({width,height:width===390?844:1000});
    await page.clock.install({time:new Date('2026-12-31T22:50:00Z')});
    const workouts=[representativeWorkout('2025-12-31'),representativeWorkout('2026-11-01'),representativeWorkout('2026-12-31')];
    const game={...normalizeGame(),seasonProgressionVersion:1 as const,seasonProgressionStartedOn:'2026-01-01',seasonCrateProgress:[{season:'2026',baseline:1,reached:gameProgress(normalizeGame(),workouts,undefined,'2026').level}]};
    await seed(page,{routines:[],customExercises:[],workouts,game});
    const progress = gameProgress(game, workouts);
    const arcade = () => page.getByRole('navigation', { name: 'Navegación principal' }).getByRole('button', { name: 'Arcade', exact: true }).click();
    await expect(page.locator('.summary-character-rank strong')).toHaveText(`Nivel ${progress.level}`);
    await expect(page.locator('.character-season')).toContainText('XP acumulada');
    await noOverflow(page);await page.screenshot({path:info.outputPath(`summary-${width}.png`),fullPage:true,animations:'disabled'});
    await page.getByRole('navigation', { name: 'Navegación principal' }).getByRole('button', { name: 'Progreso', exact: true }).click();
    await page.getByRole('button', { name: 'Cuerpo', exact: true }).click();
    await expect(page.locator('.body-detail-total strong')).toHaveText('9');
    const level = page.locator('.muscle-level-panel strong');
    const progressBar = page.getByRole('progressbar', { name: 'Nivel muscular de Pecho' });
    const earnedLevel = await level.innerText();
    const earnedProgress = await progressBar.getAttribute('aria-valuenow');
    expect(earnedLevel).toBe('NIVEL 2');
    expect(Number(earnedProgress)).toBeGreaterThan(0);
    await expect(page.getByLabel('Mes muscular', { exact: true })).toHaveCount(0);
    await noOverflow(page);
    await page.clock.setSystemTime(new Date('2026-12-31T23:00:00Z'));
    await page.clock.fastForward(1100);
    await expect(page.locator('.body-detail-total strong')).toHaveText('9');
    await expect(level).toHaveText(earnedLevel);
    await expect(progressBar).toHaveAttribute('aria-valuenow', earnedProgress!);
    await page.reload();
    await expect(level).toHaveText(earnedLevel);
    await expect(progressBar).toHaveAttribute('aria-valuenow', earnedProgress!);
    await arcade();
    await page.getByRole('button', { name: 'Nivel y recompensas', exact: true }).click();
    await expect(page.locator('.arcade-ascent-hero')).toContainText('XP acumulada');
    await expect(page.locator('.ascent-rank')).toContainText(`NIVEL ${progress.level}`);
    await expect(page.getByLabel('Año del personaje', { exact: true })).toHaveCount(0);
    const crate = page.locator('.level-reward-card').filter({ has: page.getByRole('heading', { name: 'Cofre de ascenso nivel 2', exact: true }) });
    await expect(crate).toBeVisible();
    await expect(crate).toHaveText('Cofre de ascenso nivel 2Abrir gratis');
    const art = crate.locator('.level-reward-art');
    await expect(art).toHaveAttribute('src', '/assets/grind-chest-ascent.webp');
    await expect.poll(() => art.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
    await crate.screenshot({ path: info.outputPath(`level-crate-${width}.png`), animations: 'disabled' });
    await crate.getByRole('button', { name: 'Información sobre Probabilidades · Cofre de ascenso nivel 2' }).click();
    const odds = page.getByRole('dialog', { name: 'Probabilidades · Cofre de ascenso nivel 2' });
    await expect(odds.locator('.crate-odds strong')).toHaveText(Object.values(levelCrate(2).odds).map(value => `${value}%`));
    await odds.getByRole('button', { name: 'Cerrar información' }).click();
    await noOverflow(page);
    await page.screenshot({ path: info.outputPath(`ascent-${width}.png`), fullPage: true, animations: 'disabled' });
    await page.clock.setSystemTime(new Date('2028-05-01T12:00:00Z'));
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(page.locator('.ascent-rank')).toContainText(`NIVEL ${progress.level}`);
    await page.reload();
    await expect(page.locator('.ascent-rank')).toContainText(`NIVEL ${progress.level}`);
    await page.getByRole('navigation', { name: 'Navegación principal' }).getByRole('button', { name: 'Inicio', exact: true }).click();
    await expect(page.locator('.character-season')).toContainText('XP acumulada');
    expect(errors).toEqual([]);
  });
  test(`maximum 99 has a full bar and no level 100 at ${width}px`,async({page},info)=>{
    test.setTimeout(90000);
    await page.setViewportSize({width,height:width===390?844:1000});
    await page.clock.install({time:new Date('2026-11-02T12:00:00Z')});
    const workouts=Array.from({length:300},()=>representativeWorkout('2026-10-01'));
    const game=reconcileSeasonProgression(normalizeGame(),workouts,undefined,'2026-11-02');
    await seed(page,{routines:[],customExercises:[],workouts,game});
    await expect(page.locator('.summary-character')).toContainText('Nivel máximo');
    await expect(page.locator('.summary-character')).not.toContainText('NIVEL 100');
    await expect(page.locator('.summary-character .progress-track > span')).toHaveAttribute('style','width: 100%;');
    await noOverflow(page);await page.screenshot({path:info.outputPath(`max-summary-${width}.png`),fullPage:true,animations:'disabled'});
    await page.getByRole('navigation', { name: 'Navegación principal' }).getByRole('button', { name: 'Arcade', exact: true }).click();
    await page.getByRole('button', { name: 'Nivel y recompensas', exact: true }).click();
    await expect(page.locator('.arcade-ascent-hero')).toContainText('Nivel máximo');
    await expect(page.locator('.arcade-ascent-hero [role=progressbar]')).toHaveAttribute('aria-valuenow','100');
    await expect(page.locator('.ascent-path')).not.toContainText('Nivel 100');
    // Collapse the long legacy entitlements to keep visual evidence focused.
    await page.locator('.arcade-ascent-hero').screenshot({path:info.outputPath(`max-ascent-${width}.png`),animations:'disabled'});
  });
}

test('level up shows the new ascent chest and the same chest can be claimed for free', async ({ page }, info) => {
  await page.clock.setFixedTime(new Date('2026-11-06T12:00:00Z'));
  const draft = representativeWorkout('2026-11-06');
  draft.status = 'draft';
  draft.exercises = draft.exercises.slice(0, 1);
  draft.exercises[0].sets = draft.exercises[0].sets.slice(0, 1);
  draft.exercises[0].sets[0].confirmed = false;
  const arcadeGrant = { season: '2026', xp: 790, credits: 0, grantedAt: '2026-11-01T12:00:00Z', charges: {} };
  await seed(page, {
    routines: [], customExercises: [], workouts: [draft],
    game: { ...normalizeGame(), arcadeGrant },
    preferences: { effects: false, sound: false },
  });
  await page.getByRole('button', { name: 'Continuar entreno', exact: true }).click();
  await page.getByRole('button', { name: 'Confirmar serie 1', exact: true }).click();
  const celebration = page.locator('.celebration-level-scene');
  await expect(celebration).toHaveText('Cofre de ascenso nivel 2');
  const art = celebration.locator('img');
  await expect(art).toHaveAttribute('src', '/assets/grind-chest-ascent.webp');
  await expect.poll(() => art.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
  await celebration.screenshot({ path: info.outputPath('level-up-chest.png'), animations: 'disabled' });
  await page.getByRole('button', { name: 'Cerrar celebración', exact: true }).click();

  await page.getByRole('navigation', { name: 'Navegación principal' }).getByRole('button', { name: 'Arcade', exact: true }).click();
  await page.getByRole('button', { name: 'Cofres', exact: true }).click();
  const crate = page.locator('.level-reward-card').filter({ hasText: 'Cofre de ascenso nivel 2' });
  await expect(crate.locator('img')).toHaveAttribute('src', '/assets/grind-chest-ascent.webp');
  const wallet = page.locator('.arcade-wallet');
  const balance = await wallet.getAttribute('aria-label');
  await crate.getByRole('button', { name: 'Abrir gratis', exact: true }).click();
  const result = page.getByRole('dialog');
  await expect(result.getByRole('heading', { name: 'Recompensa obtenida' })).toBeVisible();
  await result.getByRole('button', { name: 'Guardar en colección', exact: true }).click();
  await expect(wallet).toHaveAttribute('aria-label', balance!);
  await page.getByRole('button', { name: 'Inicio de Arcade', exact: true }).click();
  await page.getByRole('button', { name: 'Nivel y recompensas', exact: true }).click();
  await page.getByText('Cofres reclamados', { exact: true }).click();
  await expect(crate.getByRole('button', { name: 'Reclamado', exact: true })).toBeDisabled();
});
