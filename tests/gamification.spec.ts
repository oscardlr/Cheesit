import { test, expect, type Page } from '@playwright/test';
import { getItemDefinition, RARITIES, REVEAL_DURATION_MS, SPIN_DURATION_MS } from '../src/lib/game';
import { todayMadrid } from '../src/lib/dates';
import { formatCreditBalance } from '../src/lib/test-credits';
import type { AppData, Workout } from '../src/lib/model';

const navigation = (page: Page) => page.getByRole('navigation', { name: 'Navegación principal' });
const wallet = (page: Page) => page.locator('.arcade-wallet strong');
const rouletteBlur = (page: Page) => page.locator('.crate-opening-shade feGaussianBlur').evaluate(node=>(node as SVGFEGaussianBlurElement).stdDeviationX.baseVal);
const roulettePosition = (page: Page) => page.locator('.rarity-roulette-track').evaluate(node=>{
  const card=node.firstElementChild as HTMLElement;
  const spacing=card.offsetWidth+parseFloat(getComputedStyle(node).columnGap);
  const blur=node.closest('.crate-opening-shade')!.querySelector('feGaussianBlur') as SVGFEGaussianBlurElement;
  return {time:Date.now(),cards:-new DOMMatrixReadOnly(getComputedStyle(node).transform).m41/spacing,blur:blur.stdDeviationX.baseVal};
});
async function winningPosition(page: Page) {
  return page.locator('.rarity-roulette').evaluate(container=>{
    const winner=container.querySelector('.rarity-roulette-card.is-winner')!.getBoundingClientRect();
    const marker=container.querySelector('.rarity-roulette-pointer')!.getBoundingClientRect();
    return (marker.left+marker.width/2-winner.left)/winner.width;
  });
}
async function openArcade(page: Page) {
  await navigation(page).getByRole('button', { name: 'Universo RPG', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Zona arcade' })).toBeVisible();
}
async function savedData(page: Page): Promise<AppData | null> {
  return page.evaluate(() => new Promise<AppData | null>((resolve, reject) => {
    const request = indexedDB.open('entrenos-local', 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result, transaction = db.transaction('state', 'readonly');
      const get = transaction.objectStore('state').get('local');
      get.onsuccess = () => resolve(get.result ?? null);
      get.onerror = () => reject(get.error);
      transaction.oncomplete = () => db.close();
    };
  }));
}
async function seedData(page: Page, data: AppData) {
  await expect.poll(async () => Boolean(await savedData(page))).toBeTruthy();
  await page.evaluate(value => new Promise<void>((resolve, reject) => {
    const request = indexedDB.open('entrenos-local', 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db=request.result, tx=db.transaction('state','readwrite');
      tx.objectStore('state').put(value,'local');
      tx.oncomplete=()=>{db.close();resolve()};
      tx.onerror=()=>reject(tx.error);
    };
  }), data);
  await page.reload();
}
function thresholdWorkout(): Workout {
  const date=todayMadrid();
  return {id:crypto.randomUUID(),date,name:'Ascenso de prueba',color:'#0057C2',status:'draft',createdAt:date+'T12:00:00Z',updatedAt:date+'T12:00:00Z',
    exercises:[{id:crypto.randomUUID(),exerciseId:'press-banca-barra',name:'Press de banca con barra',group:'Pecho',mode:'external_load_reps',
    sets:Array.from({length:17},(_,index)=>({id:crypto.randomUUID(),weight:index<16?50:null,reps:index<16?8:null,confirmed:index<16}))}]};
}
test.beforeEach(async ({page})=>{await page.addInitScript(()=>sessionStorage.setItem('grind-intro-v1','1'))});

test('five RPG sections, profile and weekly day goal persist', async ({ page }) => {
  await page.goto('/'); await openArcade(page);
  for(const name of ['Objetivos','Cuerpo','Cofres','Colección','Ascenso']) {
    await page.getByRole('tab',{name,exact:true}).click();
    await expect(page.getByRole('tab',{name,exact:true})).toHaveAttribute('aria-selected','true');
    await expect(page.getByRole('tabpanel')).toBeVisible();
  }
  await page.getByRole('tab',{name:'Objetivos',exact:true}).click();
  await page.getByLabel('Días de entreno por semana').fill('4');
  await expect(page.getByLabel('Series por semana')).toHaveCount(0);
  await page.getByRole('button',{name:'Guardar objetivos'}).click();
  await page.getByLabel('Peso corporal (kg)').fill('72');
  await page.getByLabel('Altura (cm)').fill('180');
  await page.getByLabel('Edad',{exact:true}).fill('20');
  await page.getByRole('button',{name:'Guardar perfil'}).click();
  await expect.poll(async()=>(await savedData(page))?.profile?.weightKg).toBe(72);
  await page.reload(); await openArcade(page);
  await expect(page.getByLabel('Días de entreno por semana')).toHaveValue('4');
  await expect(page.getByLabel('Series por semana')).toHaveCount(0);
  await expect(page.getByLabel('Peso corporal (kg)')).toHaveValue('72');
  await expect(page.locator('.athlete-profile-editor')).toContainText('no son percentiles');
});

test('training updates direct and secondary muscle XP for life independently of period', async ({page})=>{
  await page.goto('/');
  await openArcade(page);
  const initialBalance=Number((await page.locator('.arcade-wallet').getAttribute('aria-label'))!.replace(/\D/g,''));
  await navigation(page).getByRole('button',{name:'Empezar entrenamiento',exact:true}).click();
  await page.getByRole('main').getByRole('button',{name:/Empezar entrenamiento/}).click();
  await page.getByRole('button',{name:'＋ Añadir ejercicio'}).click();
  await page.getByRole('dialog').getByRole('button',{name:/Press de banca con barra/}).click();
  await page.getByLabel('Carga en kg, serie 1 de Press de banca con barra').fill('50');
  await page.getByLabel('Repeticiones, serie 1 de Press de banca con barra').fill('8');
  await page.getByRole('button',{name:'Confirmar serie 1'}).click();
  await expect(page.locator('.celebration-reward')).toContainText('+60');
  await page.getByRole('button',{name:'Cerrar celebración'}).click();
  await page.getByRole('button',{name:'Finalizar entrenamiento'}).click();
  await expect(page.locator('.celebration-session-total')).toContainText('410 XP');
  await page.getByRole('button',{name:'A por el siguiente nivel'}).click();
  await openArcade(page); await expect(wallet(page)).toHaveText(formatCreditBalance(initialBalance+82));
  await expect(page.locator('.arcade-wallet')).toHaveAttribute('aria-label',`${new Intl.NumberFormat('es-ES',{maximumFractionDigits:1}).format(initialBalance+82)} créditos disponibles`);
  await page.getByRole('tab',{name:'Cuerpo',exact:true}).click();
  await expect(page.getByRole('button',{name:'Pecho: 1 series directas, 0 secundarias',exact:true})).toHaveCSS('fill','rgb(113, 96, 160)');
  await expect(page.locator('.muscle-level-xp')).toContainText('60 / 500 XP');
  await page.getByRole('button',{name:'Tríceps: 0 series directas, 1 secundarias',exact:true}).locator('path').first().click();
  await expect(page.locator('.body-detail-total strong')).toHaveText('0,5');
  await expect(page.locator('.muscle-level-xp')).toContainText('30 / 500 XP');
  await page.getByRole('button',{name:'30 días',exact:true}).click();
  await expect(page.locator('.muscle-level-xp')).toContainText('30 / 500 XP');
});

test('a real five second roulette moves, resumes after reload and automatically opens the prize once', async ({page},testInfo)=>{
  test.setTimeout(45000);
  await page.goto('/'); await openArcade(page);
  await page.getByRole('tab',{name:'Cofres',exact:true}).click();
  const crate=page.locator('.arcade-crate').filter({has:page.getByRole('heading',{name:'Cofre de hierro',exact:true})});
  await expect(crate.locator('.crate-odds')).toContainText('70%');
  const initialBalance=Number((await page.locator('.arcade-wallet').getAttribute('aria-label'))!.replace(/\D/g,''));
  const before=Date.now();
  await crate.getByRole('button',{name:/Abrir cofre/}).click();
  const opening=page.getByRole('dialog');
  await expect(opening).toBeVisible();
  await expect(opening).toBeInViewport({ratio:0.9});
  await expect(page.locator('.rarity-roulette-card')).toHaveCount(200);
  await expect(page.locator('.opening-item-result')).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Revelar contenido'})).toHaveCount(0);
  await expect(page.getByRole('button',{name:/Saltar animación/})).toHaveCount(0);
  await expect(opening.locator('.opening-countdown, .opening-timer-track')).toHaveCount(0);
  await expect(opening.getByRole('progressbar')).toHaveCount(0);
  const first=await page.locator('.rarity-roulette-track').evaluate(node=>getComputedStyle(node).transform);
  await page.waitForTimeout(350);
  await expect.poll(()=>page.locator('.rarity-roulette-track').evaluate(node=>getComputedStyle(node).transform)).not.toBe(first);
  const second=await page.locator('.rarity-roulette-track').evaluate(node=>getComputedStyle(node).transform);
  await page.waitForTimeout(350);
  await expect.poll(()=>page.locator('.rarity-roulette-track').evaluate(node=>getComputedStyle(node).transform)).not.toBe(second);
  const purchased=(await savedData(page))!.game!;
  const item=purchased.inventory[0], definition=getItemDefinition(item)!;
  expect(purchased.pendingOpening?.stage).toBe('spinning');
  expect(purchased.transactions).toHaveLength(1);
  await expect(opening).not.toContainText(definition.description);
  await page.getByRole('button',{name:'Guardar apertura para después'}).click();
  await page.getByRole('tab',{name:'Colección',exact:true}).click();
  await expect(page.locator('.loot-item-card')).toHaveCount(0);
  await page.reload(); await openArcade(page);
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.locator('.opening-item-result')).toHaveCount(0);
  await expect(page.locator('.opening-reveal-animation')).toBeVisible({timeout:SPIN_DURATION_MS+1500});
  await expect(page.getByRole('dialog')).toBeInViewport({ratio:0.9});
  expect(Date.now()-before).toBeGreaterThanOrEqual(5000);
  expect(Date.now()-before).toBeLessThan(8000);
  await expect(page.locator('.opening-item-result')).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Revelar contenido'})).toHaveCount(0);
  await expect(page.locator('.rarity-roulette-card').nth(192).locator('span')).toHaveText(RARITIES[item.rarity].label);
  const hit=await winningPosition(page);
  expect(hit).toBeGreaterThan(.045);
  expect(hit).toBeLessThan(.955);
  expect(await rouletteBlur(page)).toBe(0);
  await page.screenshot({path:testInfo.outputPath('automatic-crate-opening-mobile.png')});
  await expect(page.locator('.opening-item-result')).toBeVisible({timeout:4000});
  await expect(page.locator('.opening-item-result')).toContainText(definition.description);
  await expect.poll(async()=>(await savedData(page))?.game?.pendingOpening??null).toBeNull();
  await page.getByRole('button',{name:'Equipar ahora',exact:true}).click();
  await page.getByRole('tab',{name:'Colección',exact:true}).click();
  await expect(page.locator('.loot-item-card')).toHaveCount(1);
  await expect(page.locator('.loot-item-card .quote-equip')).toHaveAttribute('aria-pressed','true');
  if(item.gearId) {
    const slot=definition.slot!;
    expect((await savedData(page))!.game!.cosmeticGear?.[slot]).toBe(item.gearId);
    await expect(page.locator('.wardrobe-stage .character-equipped')).toHaveCount(1);
  } else if(item.companionId) {
    await expect(page.locator('.wardrobe-stage .character-party .companion-sprite')).toHaveAttribute('data-companion-id',item.companionId);
  } else {
    await navigation(page).getByRole('button',{name:'Resumen',exact:true}).click();
    await expect(page.locator('.arcade-daily blockquote')).toContainText(definition.description);
    await openArcade(page); await page.getByRole('tab',{name:'Colección',exact:true}).click();
  }
  await expect(page.getByRole('button',{name:/Vender/})).toHaveCount(0);
  await expect(page.locator('.loot-item-card')).toHaveCount(1);
  await expect(wallet(page)).toHaveText(formatCreditBalance(initialBalance-100));
  expect((await savedData(page))!.game!.transactions.filter(transaction=>transaction.kind==='sale')).toHaveLength(0);
  expect((await savedData(page))!.game!.inventory[0].sold).toBe(false);
  await page.reload(); await openArcade(page);
  await expect(wallet(page)).toHaveText(formatCreditBalance(initialBalance-100));
  await page.getByRole('tab',{name:'Colección',exact:true}).click();
  await expect(page.locator('.loot-item-card')).toHaveCount(1);
  await expect(page.locator('.loot-item-card .quote-equip')).toHaveAttribute('aria-pressed','true');
});

for (const reducedMotion of ['no-preference', 'reduce'] as const) test(`effects off keeps the full fast five second roulette with ${reducedMotion} motion`, async ({page},testInfo)=>{
  await page.clock.install();
  await page.emulateMedia({reducedMotion});
  await page.goto('/');
  await page.getByRole('button',{name:'Cuenta y ajustes'}).click();
  await page.getByRole('switch',{name:'Efectos y confeti'}).click();
  await openArcade(page);
  await page.getByRole('tab',{name:'Cofres',exact:true}).click();
  await page.locator('.arcade-crate').first().getByRole('button',{name:/Abrir cofre/}).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  const startedAt=Date.parse((await savedData(page))!.game!.pendingOpening!.startedAt);
  await page.clock.pauseAt(new Date(await page.evaluate(()=>Date.now())+50));
  const samples=[await roulettePosition(page)];
  expect(samples[0].blur).toBeGreaterThan(6);
  // The requested reel must stay fast even if the OS asks to reduce other motion.
  while(samples.at(-1)!.time-startedAt<4000){
    await page.clock.runFor(500);
    samples.push(await roulettePosition(page));
  }
  const distances=samples.slice(1).map((sample,index)=>sample.cards-samples[index].cards);
  expect(distances[0]).toBeGreaterThan(40);
  for(let index=1;index<distances.length;index++) expect(distances[index]).toBeLessThan(distances[index-1]);
  expect(distances[0]).toBeGreaterThan(distances.at(-1)!*10);
  expect(distances.at(-1)!).toBeGreaterThan(.1);
  for(let index=1;index<samples.length;index++) expect(samples[index].blur).toBeLessThan(samples[index-1].blur);
  await testInfo.attach('full-speed-reel-with-effects-off',{body:JSON.stringify({reducedMotion,samples,distances},null,2),contentType:'application/json'});
  const elapsed=await page.evaluate(start=>Date.now()-start,startedAt);
  await page.clock.fastForward(Math.max(1,4500-elapsed));
  await expect(page.getByRole('button',{name:'Revelar contenido'})).toHaveCount(0);
  await expect(page.getByRole('dialog').getByRole('progressbar')).toHaveCount(0);
  await expect(page.locator('.opening-countdown, .opening-timer-track')).toHaveCount(0);
  await expect(page.locator('.opening-item-result')).toHaveCount(0);
  await expect(page.locator('.opening-reveal-animation')).toHaveCount(0);
  await page.clock.fastForward(550);
  await expect(page.locator('.opening-reveal-animation')).toBeVisible();
  expect(await rouletteBlur(page)).toBe(0);
  await expect(page.locator('.opening-item-result')).toHaveCount(0);
  const closedLid=await page.locator('.opening-crate-lid').evaluate(node=>getComputedStyle(node).transform);
  await page.clock.runFor(300);
  expect(await page.locator('.opening-crate-lid').evaluate(node=>getComputedStyle(node).transform)).not.toBe(closedLid);
  await page.clock.fastForward(REVEAL_DURATION_MS+100);
  await expect(page.locator('.opening-item-result')).toBeVisible();
});

test('desktop roulette starts blurred and extremely fast, progressively clears and lands after five seconds', async ({page},testInfo)=>{
  await page.clock.install();
  await page.emulateMedia({reducedMotion:'no-preference'});
  await page.setViewportSize({width:1440,height:1000});
  await page.goto('/'); await openArcade(page);
  await page.getByRole('tab',{name:'Cofres',exact:true}).click();
  await page.locator('.arcade-crate').first().getByRole('button',{name:/Abrir cofre/}).click();
  const opening=page.getByRole('dialog');
  await expect(opening).toBeVisible();
  const startedAt=Date.parse((await savedData(page))!.game!.pendingOpening!.startedAt);
  await page.clock.pauseAt(new Date(await page.evaluate(()=>Date.now())+50));
  const readPosition=()=>roulettePosition(page);
  const samples=[await readPosition()];
  expect(samples[0].blur).toBeGreaterThan(6);
  await page.screenshot({path:testInfo.outputPath('extreme-motion-blur-desktop.png')});
  // Equal time windows compare the actual rendered travel, including the last second.
  while(samples.at(-1)!.time-startedAt<4000){
    await page.clock.runFor(500);
    samples.push(await readPosition());
  }
  const distances=samples.slice(1).map((sample,index)=>sample.cards-samples[index].cards);
  expect(distances[0]).toBeGreaterThan(40);
  for(let index=1;index<distances.length;index++) expect(distances[index]).toBeLessThan(distances[index-1]);
  for(let index=1;index<samples.length;index++) expect(samples[index].blur).toBeLessThan(samples[index-1].blur);
  expect(distances[0]).toBeGreaterThan(distances.at(-1)!*10);
  expect(distances.at(-1)!).toBeGreaterThan(.1);
  expect(samples.at(-1)!.blur).toBeLessThan(.5);
  await testInfo.attach('roulette-travel-per-half-second',{body:JSON.stringify({samples,distances},null,2),contentType:'application/json'});
  await page.screenshot({path:testInfo.outputPath('spinning-roulette-desktop.png')});
  await expect(opening.getByRole('progressbar')).toHaveCount(0);
  await page.clock.runFor(SPIN_DURATION_MS-10-samples.at(-1)!.time+startedAt);
  await expect(page.locator('.opening-reveal-animation')).toHaveCount(0);
  await page.clock.runFor(60);
  await expect(page.locator('.opening-reveal-animation')).toBeVisible();
  const landedAt=await page.evaluate(()=>Date.now());
  expect(landedAt-startedAt).toBeGreaterThanOrEqual(SPIN_DURATION_MS);
  expect(landedAt-startedAt).toBeLessThan(SPIN_DURATION_MS+100);
  const hit=await winningPosition(page);
  expect(hit).toBeGreaterThan(.045);
  expect(hit).toBeLessThan(.955);
  expect(await rouletteBlur(page)).toBe(0);
  await page.clock.runFor(REVEAL_DURATION_MS+50);
  await expect(page.locator('.opening-item-result')).toBeVisible();
  await expect(page.getByRole('button',{name:'Revelar contenido'})).toHaveCount(0);
});

test('roulette lands near either edge or the middle and keeps the same stop after reload and resize', async ({page})=>{
  await page.clock.install();
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.goto('/'); await openArcade(page);
  await page.getByRole('tab',{name:'Cofres',exact:true}).click();
  await page.locator('.arcade-crate').first().getByRole('button',{name:/Abrir cofre/}).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button',{name:'Guardar apertura para después'}).click();
  const base=(await savedData(page))!;
  await page.clock.pauseAt(new Date(await page.evaluate(()=>Date.now())+50));
  const stops:number[]=[];
  for(const suffix of ['00000000','ffffffff','80000000']){
    const data=structuredClone(base), now=await page.evaluate(()=>Date.now());
    const id=`00000000-0000-4000-8000-0000${suffix}`;
    const purchasedAt=new Date(now-SPIN_DURATION_MS).toISOString();
    const item=data.game!.inventory[0];
    item.id=id; item.acquiredAt=purchasedAt;
    data.game!.transactions[0].itemId=id;
    data.game!.transactions[0].createdAt=purchasedAt;
    data.game!.pendingOpening={itemId:id,startedAt:purchasedAt,stage:'revealing',revealStartedAt:new Date(now).toISOString()};
    await seedData(page,data); await openArcade(page);
    await expect(page.locator('.opening-reveal-animation')).toBeVisible();
    const before=await winningPosition(page);
    expect(before).toBeGreaterThan(.045);
    expect(before).toBeLessThan(.955);
    stops.push(before);
    await page.reload(); await openArcade(page);
    await expect(page.locator('.opening-reveal-animation')).toBeVisible();
    expect(await winningPosition(page)).toBeCloseTo(before,3);
    await page.setViewportSize({width:1440,height:1000});
    await expect.poll(()=>winningPosition(page)).toBeCloseTo(before,1);
    await page.getByRole('button',{name:'Guardar apertura para después'}).click();
    await page.setViewportSize({width:390,height:844});
  }
  expect(stops[0]).toBeLessThan(.15);
  expect(stops[1]).toBeGreaterThan(.85);
  expect(stops[2]).toBeGreaterThan(.4);
  expect(stops[2]).toBeLessThan(.6);
  expect(stops[1]-stops[0]).toBeGreaterThan(.7);
});

test('an older saved rarity stage resumes directly into the automatic opening', async ({page})=>{
  await page.clock.install();
  await page.goto('/'); await openArcade(page);
  await page.getByRole('tab',{name:'Cofres',exact:true}).click();
  await page.locator('.arcade-crate').first().getByRole('button',{name:/Abrir cofre/}).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button',{name:'Guardar apertura para después'}).click();
  const legacy=(await savedData(page))!;
  legacy.game!.pendingOpening!.stage='rarity';
  await page.clock.fastForward(SPIN_DURATION_MS+100);
  await seedData(page,legacy); await openArcade(page);
  await expect(page.locator('.opening-reveal-animation')).toBeVisible();
  await expect(page.getByRole('button',{name:'Revelar contenido'})).toHaveCount(0);
  await page.clock.fastForward(REVEAL_DURATION_MS+100);
  await expect(page.locator('.opening-item-result')).toBeVisible();
  await expect.poll(async()=>(await savedData(page))?.game?.pendingOpening??null).toBeNull();
  expect((await savedData(page))!.game!.transactions).toHaveLength(1);
});

test('crossing a level unlocks one free tailored gear crate and cannot claim it twice', async ({page})=>{
  await page.clock.install();
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.goto('/'); await expect(page.getByRole('heading',{name:'Resumen'})).toBeVisible();
  const workout=thresholdWorkout();
  await seedData(page,{routines:[],workouts:[workout],customExercises:[]});
  await expect(page.locator('.xp-label>strong')).toHaveText(/960 \/ 1\.?000 XP/);
  await page.getByRole('button',{name:/Continuar entrenamiento/}).click();
  await page.getByLabel('Carga en kg, serie 17 de Press de banca con barra').fill('50');
  await page.getByLabel('Repeticiones, serie 17 de Press de banca con barra').fill('8');
  await page.getByRole('button',{name:'Confirmar serie 17',exact:true}).click();
  await expect(page.locator('.celebration-level-copy>strong')).toHaveText('2');
  await page.getByRole('button',{name:'Cerrar celebración'}).click();
  await openArcade(page); await page.getByRole('tab',{name:'Ascenso',exact:true}).click();
  const levelCrate=page.locator('.level-reward-card').first();
  await expect(levelCrate).toContainText('nivel 2');
  const initialBalance=await wallet(page).textContent();
  await levelCrate.getByRole('button',{name:'Abrir gratis'}).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.clock.fastForward(SPIN_DURATION_MS+300);
  await expect(page.locator('.opening-reveal-animation')).toBeVisible();
  await page.clock.fastForward(REVEAL_DURATION_MS+100);
  await expect(page.locator('.opening-item-result')).toContainText('EQUIPAMIENTO');
  await page.getByRole('button',{name:'Guardar en colección'}).click();
  await expect(wallet(page)).toHaveText(initialBalance!);
  await expect(page.locator('.level-reward-card').first().getByRole('button',{name:'Reclamado'})).toBeDisabled();
  await expect.poll(async()=>(await savedData(page))?.game?.transactions.filter(transaction=>transaction.kind==='level-crate').length).toBe(1);
  const after=(await savedData(page))!.game!;
  expect(after.inventory[0].kind).toBe('gear');
  expect(after.transactions[0].amount).toBe(0);
  await expect.poll(async()=>(await savedData(page))?.game?.pendingOpening??null).toBeNull();
  await page.reload(); await openArcade(page); await page.getByRole('tab',{name:'Ascenso',exact:true}).click();
  await expect(page.locator('.level-reward-card').first().getByRole('button',{name:'Reclamado'})).toBeDisabled();
});

for (const reward of [
  { kind: 'gear' as const, gearId: 'lime-shorts' },
  { kind: 'companion' as const, companionId: 'athlete' },
  { kind: 'quote' as const, quoteId: 'show-up' },
]) {
  test(`new badge appears only for a first ${reward.kind} and survives resuming`, async ({ page }, testInfo) => {
    await page.clock.install();
    await page.goto('/'); await openArcade(page);
    await page.getByRole('tab', { name: 'Cofres', exact: true }).click();
    await page.locator('.arcade-crate').first().getByRole('button', { name: /Abrir cofre/ }).click();
    await page.getByRole('button', { name: 'Guardar apertura para después' }).click();
    const data = (await savedData(page))!;
    const original = data.game!.inventory[0];
    data.game!.inventory = [{ id: original.id, ...reward, rarity: 'common', acquiredAt: original.acquiredAt, crateId: 'starter', sold: false }];
    await seedData(page, data); await openArcade(page);
    await expect(page.locator('.opening-new-badge')).toHaveCount(0);
    await page.clock.fastForward(SPIN_DURATION_MS + 100);
    await expect(page.locator('.opening-reveal-animation')).toBeVisible();
    await page.clock.fastForward(REVEAL_DURATION_MS + 100);
    await expect(page.locator('.opening-new-badge')).toHaveText('¡Nuevo!');
    await expect(page.locator('.opening-new-badge')).toHaveCSS('background-color', 'rgb(216, 255, 62)');
    await expect.poll(async () => (await savedData(page))?.game?.pendingOpening ?? null).toBeNull();
    if (reward.kind === 'gear') await page.screenshot({ path: testInfo.outputPath('new-reward-mobile.png') });
    await page.getByRole('button', { name: 'Guardar en colección' }).click();
    const duplicate = (await savedData(page))!;
    const now = new Date(await page.evaluate(() => Date.now())).toISOString();
    const item = { ...duplicate.game!.inventory[0], id: crypto.randomUUID(), acquiredAt: now };
    duplicate.game!.inventory.push(item);
    duplicate.game!.transactions.push({ ...duplicate.game!.transactions[0], id: crypto.randomUUID(), itemId: item.id, createdAt: now });
    duplicate.game!.pendingOpening = { itemId: item.id, startedAt: now, stage: 'spinning' };
    await seedData(page, duplicate); await openArcade(page);
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.clock.fastForward(SPIN_DURATION_MS + 100);
    await expect(page.locator('.opening-reveal-animation')).toBeVisible();
    await page.clock.fastForward(REVEAL_DURATION_MS + 100);
    await expect(page.locator('.opening-item-result')).toBeVisible();
    await expect(page.locator('.opening-new-badge')).toHaveCount(0);
  });
}
