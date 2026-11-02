import { expect, test, type Page } from '@playwright/test';
import { representativeWorkout } from '../scripts/simulate-season-progression';
import { normalizeGame, reconcileSeasonProgression, gameProgress } from '../src/lib/game';
import type { AppData } from '../src/lib/model';

async function seed(page: Page, data: AppData) {
  await page.addInitScript(() => sessionStorage.setItem('grind-intro-v1','1'));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Resumen', exact: true })).toBeVisible();
  await page.evaluate(async data => {
    await new Promise<void>((resolve, reject) => { const request=indexedDB.open('entrenos-local',1);request.onsuccess=()=>{const db=request.result,tx=db.transaction('state','readwrite');tx.objectStore('state').put(data,'local');tx.oncomplete=()=>{db.close();resolve()};tx.onerror=()=>reject(tx.error)};request.onerror=()=>reject(request.error) });
  }, data);
  await page.reload();
  await expect(page.getByRole('heading',{name:'Resumen',exact:true})).toBeVisible();
}
async function noOverflow(page: Page) {
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
}
for (const width of [390,1440]) {
  test(`civil monthly/annual rollover, historical selection and late focus at ${width}px`,async({page},info)=>{
    test.setTimeout(90000);
    const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
    await page.setViewportSize({width,height:width===390?844:1000});
    await page.clock.install({time:new Date('2026-12-31T22:50:00Z')});
    const workouts=[representativeWorkout('2025-12-31'),representativeWorkout('2026-11-01'),representativeWorkout('2026-12-31')];
    const game={...normalizeGame(),seasonProgressionVersion:1 as const,seasonProgressionStartedOn:'2026-01-01',seasonCrateProgress:[{season:'2026',baseline:1,reached:gameProgress(normalizeGame(),workouts,undefined,'2026').level}]};
    await seed(page,{routines:[],customExercises:[],workouts,game});
    await expect(page.locator('.level-card')).toContainText('Temporada 2026');
    await noOverflow(page);await page.screenshot({path:info.outputPath(`summary-${width}.png`),fullPage:true,animations:'disabled'});
    await page.getByRole('button',{name:'Créditos y cofres',exact:true}).click();
    await page.getByRole('tab',{name:'Cuerpo',exact:true}).click();
    await expect(page.locator('.body-detail')).toContainText('diciembre de 2026');
    await expect(page.locator('.body-detail-total strong')).toHaveText('3');
    await expect(page.getByRole('button',{name:'7 días',exact:true})).toHaveCount(0);
    await noOverflow(page);await page.screenshot({path:info.outputPath(`body-${width}.png`),fullPage:true,animations:'disabled'});
    await page.clock.setSystemTime(new Date('2026-12-31T23:00:00Z'));
    await page.clock.fastForward(1100);
    await expect(page.locator('.body-detail')).toContainText('enero de 2027');
    await expect(page.locator('.body-detail-total strong')).toHaveText('0');
    await expect(page.locator('.muscle-level-panel')).toContainText('NIVEL 1');
    await page.getByLabel('Mes muscular',{exact:true}).selectOption('2026-12');
    await expect(page.locator('.body-detail-total strong')).toHaveText('3');
    await expect(page.locator('.muscle-level-panel')).toContainText('TEMPORADA HISTÓRICA');
    await page.screenshot({path:info.outputPath(`body-history-${width}.png`),fullPage:true,animations:'disabled'});
    await page.getByRole('tab',{name:'Ascenso',exact:true}).click();
    await expect(page.locator('.arcade-ascent-hero')).toContainText('Temporada 2027');
    await expect(page.locator('.ascent-rank')).toContainText('NIVEL 1');
    await page.getByLabel('Año del personaje',{exact:true}).selectOption('2026');
    await expect(page.locator('.arcade-ascent-hero')).toContainText('histórica');
    await expect(page.locator('.ascent-rank')).not.toContainText('NIVEL 1');
    await noOverflow(page);await page.screenshot({path:info.outputPath(`ascent-history-${width}.png`),fullPage:true,animations:'disabled'});
    await page.getByRole('tab',{name:'Cofres',exact:true}).click();
    await expect(page.locator('.arcade-crate-intro .character-avatar')).toHaveAttribute('aria-label',/nivel 1,/);
    await page.getByRole('tab',{name:'Colección',exact:true}).click();
    await expect(page.locator('.wardrobe-stage .character-avatar')).toHaveAttribute('aria-label',/nivel 1,/);
    await page.getByRole('tab',{name:'Ascenso',exact:true}).click();
    await page.clock.setSystemTime(new Date('2028-05-01T12:00:00Z'));
    await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
    await page.getByLabel('Año del personaje',{exact:true}).selectOption('');
    await expect(page.locator('.arcade-ascent-hero')).toContainText('Temporada 2028');
    await expect(page.locator('.ascent-rank')).toContainText('NIVEL 1');
    await page.reload();
    await page.getByRole('navigation').getByRole('button',{name:'Resumen',exact:true}).click();
    await expect(page.locator('.level-card')).toContainText('Temporada 2028');
    await expect(page.locator('.xp-label > strong')).toContainText('0');
    expect(errors).toEqual([]);
  });
  test(`maximum 99 has a full bar and no level 100 at ${width}px`,async({page},info)=>{
    test.setTimeout(90000);
    await page.setViewportSize({width,height:width===390?844:1000});
    await page.clock.install({time:new Date('2026-11-02T12:00:00Z')});
    const workouts=Array.from({length:300},()=>representativeWorkout('2026-10-01'));
    const game=reconcileSeasonProgression(normalizeGame(),workouts,undefined,'2026-11-02');
    await seed(page,{routines:[],customExercises:[],workouts,game});
    await expect(page.locator('.level-card')).toContainText('Nivel máximo');
    await expect(page.locator('.level-card')).not.toContainText('NIVEL 100');
    await expect(page.locator('.level-card .progress-track > span')).toHaveAttribute('style','width: 100%;');
    await noOverflow(page);await page.screenshot({path:info.outputPath(`max-summary-${width}.png`),fullPage:true,animations:'disabled'});
    await page.getByRole('button',{name:'Créditos y cofres',exact:true}).click();
    await page.getByRole('tab',{name:'Ascenso',exact:true}).click();
    await expect(page.locator('.arcade-ascent-hero')).toContainText('Nivel máximo');
    await expect(page.locator('.arcade-ascent-hero [role=progressbar]')).toHaveAttribute('aria-valuenow','100');
    await expect(page.locator('.ascent-path')).not.toContainText('Nivel 100');
    // Collapse the long legacy entitlements to keep visual evidence focused.
    await page.locator('.arcade-ascent-hero').screenshot({path:info.outputPath(`max-ascent-${width}.png`),animations:'disabled'});
  });
}

test('January does not offer a historical year that had no activity or prizes',async({page})=>{
  await page.clock.install({time:new Date('2026-12-31T22:50:00Z')});
  const game=reconcileSeasonProgression(normalizeGame(),[],undefined,'2026-12-31');
  await seed(page,{routines:[],customExercises:[],workouts:[],game});
  await page.clock.setSystemTime(new Date('2026-12-31T23:00:00Z'));
  await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
  await page.getByRole('button',{name:'Créditos y cofres',exact:true}).click();
  await page.getByRole('tab',{name:'Ascenso',exact:true}).click();
  await expect(page.getByLabel('Año del personaje',{exact:true}).getByRole('option')).toHaveText(['2027 · actual']);
});
