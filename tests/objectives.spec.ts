import { test, expect, type Page } from '@playwright/test';
import { gameProgress, normalizeGame } from '../src/lib/game';
import type { AppData } from '../src/lib/model';
import { DEFAULT_PROFILE } from '../src/lib/strength';

const nav=(page:Page)=>page.getByRole('navigation',{name:'Navegación principal'});

async function stored(page:Page):Promise<AppData>{
  return page.evaluate(()=>new Promise<AppData>((resolve,reject)=>{
    const request=indexedDB.open('entrenos-local',1);
    request.onerror=()=>reject(request.error);
    request.onsuccess=()=>{
      const db=request.result,tx=db.transaction('state','readonly');
      const get=tx.objectStore('state').get('local');
      get.onsuccess=()=>resolve(get.result);get.onerror=()=>reject(get.error);
      tx.oncomplete=()=>db.close();
    };
  }));
}

async function freshAccount(page:Page){
  await page.goto('/');
  await expect(page.getByRole('heading',{name:'Resumen'})).toBeVisible();
  await expect(page.locator('.dashboard-footer .storage-status')).toContainText('Guardado en este dispositivo');
  const data:AppData={routines:[],workouts:[],customExercises:[],game:normalizeGame(),profile:DEFAULT_PROFILE,preferences:{effects:false,sound:false}};
  await page.evaluate(value=>new Promise<void>((resolve,reject)=>{
    const request=indexedDB.open('entrenos-local',1);request.onerror=()=>reject(request.error);
    request.onsuccess=()=>{
      const db=request.result,tx=db.transaction('state','readwrite');
      tx.objectStore('state').put(value,'local');
      tx.oncomplete=()=>{db.close();resolve()};tx.onerror=()=>reject(tx.error);
    };
  }),data);
  await page.reload();
  await expect(page.getByRole('heading',{name:'Resumen'})).toBeVisible();
}

async function objectives(page:Page){
  await nav(page).getByRole('button',{name:'Arcade',exact:true}).click();
  await expect(page.getByRole('tab',{name:'Objetivos',exact:true})).toHaveAttribute('aria-selected','true');
}

async function credits(page:Page){
  const label=await page.locator('.arcade-wallet').getAttribute('aria-label');
  expect(label).toMatch(/créditos disponibles/);
  return Number(label!.replace(/\D/g,''));
}

test.beforeEach(async({page})=>{
  await page.addInitScript(()=>sessionStorage.setItem('grind-intro-v1','1'));
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.clock.setFixedTime(new Date('2026-10-28T12:00:00Z'));
});

test('52 objectives show their XP and automatically award one completed workout exactly once through reload',async({page},info)=>{
  test.setTimeout(60000);
  await freshAccount(page);
  await expect(page.locator('.xp-label > strong')).toHaveText(/0\s*\/\s*800 XP/);
  await objectives(page);
  const missions=page.locator('[data-mission-id]');
  await expect(missions).toHaveCount(52);
  await expect(page.locator('[data-mission-scope="weekly"]')).toHaveCount(17);
  await expect(page.locator('[data-mission-scope="career"]')).toHaveCount(35);
  const missionXp=await missions.evaluateAll(elements=>elements.map(element=>Number(element.getAttribute('data-mission-xp'))));
  expect(missionXp.every(xp=>Number.isInteger(xp)&&xp>0)).toBe(true);
  await expect(missions).toContainText(missionXp.map(xp=>new RegExp(`\\+?${xp}\\s*XP`)));
  await expect(missions.getByRole('button')).toHaveCount(0);
  await expect(page.getByLabel('Días de entreno por semana', {exact:true})).toBeVisible();
  await expect(page.locator('.arcade-goal-editor').getByRole('spinbutton')).toHaveCount(1);
  await expect(page.getByLabel('Series por semana', {exact:true})).toHaveCount(0);
  const startingCredits=await credits(page);
  expect((await stored(page)).game?.missionRewards??[]).toEqual([]);

  await nav(page).getByRole('button',{name:'Empezar entrenamiento',exact:true}).click();
  await page.getByRole('main').getByRole('button',{name:/Empezar entrenamiento/}).click();
  await page.getByRole('button',{name:'＋ Añadir ejercicio',exact:true}).click();
  await page.getByRole('dialog').getByRole('button',{name:/^Press de banca con barra/}).click();
  await page.getByLabel('Carga en kg, serie 1 de Press de banca con barra').fill('50');
  await page.getByLabel('Repeticiones, serie 1 de Press de banca con barra').fill('8');
  await page.getByRole('button',{name:'Confirmar serie 1',exact:true}).click();
  await expect(page.locator('.celebration-reward')).toContainText('+60');
  await page.getByRole('button',{name:'Cerrar celebración',exact:true}).click();
  expect((await stored(page)).game?.missionRewards??[]).toEqual([]);
  await page.getByRole('button',{name:'Finalizar entrenamiento',exact:true}).click();
  await expect(page.getByRole('dialog',{name:'SESIÓN COMPLETADA.',exact:true})).toBeVisible();
  await expect.poll(async()=>(await stored(page)).game?.missionRewards?.length??0).toBe(2);
  await page.getByRole('button',{name:'Continuar',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Resumen'})).toBeVisible();
  await expect(page.locator('.xp-label > strong')).toHaveText(/410\s*\/\s*800 XP/);

  const saved=await stored(page),rewards=saved.game!.missionRewards!;
  expect(saved.workouts).toHaveLength(1);
  expect(saved.workouts[0].status).toBe('finished');
  expect(saved.workouts[0].exercises[0].sets[0]).toMatchObject({weight:50,reps:8,confirmed:true});
  expect(rewards.map(reward=>({id:reward.id,xp:reward.xp})).sort((a,b)=>a.xp-b.xp)).toEqual([
    {id:'career-groups-1',xp:50},
    {id:'career-sessions-1',xp:100},
  ]);
  expect(rewards.reduce((sum,reward)=>sum+reward.xp,0)).toBe(150);
  expect(gameProgress(saved.game!,saved.workouts,saved.profile).xp).toBe(410);
  await objectives(page);
  await expect(missions).toHaveCount(52);
  await expect(page.locator('[data-mission-id].completed')).toHaveCount(2);
  await expect(page.locator('[data-mission-id="career-sessions-1"]')).toHaveAttribute('data-mission-xp','100');
  await expect(page.locator('[data-mission-id="career-groups-1"]')).toHaveAttribute('data-mission-xp','50');
  await expect(missions.getByRole('button')).toHaveCount(0);
  expect(await credits(page)).toBe(startingCredits+82);
  const awardedCreditsLabel=await page.locator('.arcade-wallet').getAttribute('aria-label');
  for(const width of [390,1440]){
    await page.setViewportSize({width,height:1000});
    await page.evaluate(()=>window.scrollTo(0,0));
    await page.screenshot({path:info.outputPath(`objectives-first-cards-${width}.png`),animations:'disabled'});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width+1);
  }

  await nav(page).getByRole('button',{name:'Resumen',exact:true}).click();
  await page.reload();
  await expect(page.getByRole('heading',{name:'Resumen'})).toBeVisible();
  await expect(page.locator('.xp-label > strong')).toHaveText(/410\s*\/\s*800 XP/);
  const reloaded=await stored(page);
  expect(reloaded.game?.missionRewards).toEqual(rewards);
  expect(reloaded.workouts).toEqual(saved.workouts);
  expect(gameProgress(reloaded.game!,reloaded.workouts,reloaded.profile).xp).toBe(410);
  await objectives(page);
  await expect(page.locator('.arcade-wallet')).toHaveAttribute('aria-label',awardedCreditsLabel!);
  await expect(missions).toHaveCount(52);
  await expect(page.locator('[data-mission-id].completed')).toHaveCount(2);
  expect((await stored(page)).game?.missionRewards).toEqual(rewards);
});
