import { test, expect, type Page } from '@playwright/test';
import { normalizeGame, QUOTES, type GameState, type InventoryItem } from '../src/lib/game';
import type { AppData } from '../src/lib/model';

const stamp='2026-10-27T12:00:00Z';
function fixture(): AppData {
  const quote=QUOTES[0];
  const inventory:InventoryItem[]=[{id:crypto.randomUUID(),quoteId:quote.id,rarity:quote.rarity,acquiredAt:stamp,crateId:'starter',sold:false},{id:crypto.randomUUID(),kind:'gear',gearId:'lime-shorts',rarity:'common',acquiredAt:stamp,crateId:'starter',sold:false},{id:crypto.randomUUID(),kind:'companion',companionId:'athlete',rarity:'common',acquiredAt:stamp,crateId:'starter',sold:false}];
  const game:GameState={...normalizeGame(),inventory,equippedQuoteId:quote.id,transactions:inventory.map(item=>({id:crypto.randomUUID(),kind:'crate',itemId:item.id,amount:-100,createdAt:stamp}))};
  delete game.quoteConversions;delete game.quoteConversionVersion;
  return {routines:[],customExercises:[],preferences:{effects:true,sound:false},game,workouts:[{id:crypto.randomUUID(),date:'2026-10-27',name:'Entrenamiento',color:'#d8ff3e',status:'finished',createdAt:stamp,updatedAt:stamp,exercises:[{id:crypto.randomUUID(),exerciseId:'press-banca-barra',name:'Press banca',group:'Pecho',mode:'external_load_reps',sets:Array.from({length:40},()=>({id:crypto.randomUUID(),weight:50,reps:8,confirmed:true}))}]}]};
}
async function read(page:Page):Promise<AppData>{return page.evaluate(()=>new Promise((resolve,reject)=>{const request=indexedDB.open('entrenos-local',1);request.onerror=()=>reject(request.error);request.onsuccess=()=>{const db=request.result,tx=db.transaction('state','readonly'),get=tx.objectStore('state').get('local');get.onsuccess=()=>resolve(get.result);tx.oncomplete=()=>db.close()}}));}
async function seed(page:Page,data:AppData){
  await page.addInitScript(()=>sessionStorage.setItem('grind-intro-v1','1'));
  await page.goto('/');await expect(page.getByRole('heading',{name:'Resumen',exact:true})).toBeVisible();
  await expect(page.locator('.dashboard-footer .storage-status')).toContainText('Guardado en este dispositivo');
  await page.evaluate(data=>new Promise<void>((resolve,reject)=>{const request=indexedDB.open('entrenos-local',1);request.onerror=()=>reject(request.error);request.onsuccess=()=>{const db=request.result,tx=db.transaction('state','readwrite');tx.objectStore('state').put(data,'local');tx.oncomplete=()=>{db.close();resolve()};tx.onerror=()=>reject(tx.error)}}),data);
  await page.reload();await expect(page.getByRole('heading',{name:'Resumen',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Créditos y cofres',exact:true}).click();
}

for(const width of [390,1440])test(`block 5 odds, ascent without choice, conversion notice and collection at ${width}px`,async({page},info)=>{
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await page.setViewportSize({width,height:1000});await page.emulateMedia({reducedMotion:'reduce'});
  const initial=fixture();await seed(page,initial);
  await expect(page.getByText('1 frase antigua convertida · +15 créditos', {exact:true})).toBeVisible();
  await page.getByRole('tab',{name:'Cofres',exact:true}).click();
  await expect(page.getByText('73,33% equipo · 26,67% cheesits',{exact:true})).toBeVisible();
  await expect(page.locator('.crate-odds')).toHaveCount(3);
  await expect.poll(() => page.locator('.crate-art img').evaluateAll(images => images.every(image => image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0))).toBe(true);
  await page.screenshot({path:info.outputPath(`cofres-${width}.png`),fullPage:true,animations:'disabled'});
  await page.getByRole('tab',{name:'Ascenso',exact:true}).click();
  await expect(page.locator('.level-rewards-section select')).toHaveCount(0);
  await expect(page.locator('.level-rewards-section')).toContainText('100% equipo');
  await page.screenshot({path:info.outputPath(`ascenso-${width}.png`),fullPage:true,animations:'disabled'});
  await page.getByRole('tab',{name:'Colección',exact:true}).click();
  await expect(page.locator('.loot-item-card[data-item-kind="quote"]')).toHaveCount(0);
  await expect(page.locator('.collection-type-filters')).not.toContainText('Frases');
  await page.screenshot({path:info.outputPath(`coleccion-${width}.png`),fullPage:true,animations:'disabled'});
  await page.getByRole('button',{name:'Entendido',exact:true}).click();
  await expect.poll(async()=>(await read(page)).game!.quoteConversionSeenIds?.length).toBe(1);
  await page.reload();await expect(page.getByText('1 frase antigua convertida · +15 créditos',{exact:true})).toHaveCount(0);
  const saved=(await read(page)).game!;expect(saved.inventory).toEqual(initial.game!.inventory);expect(saved.transactions).toEqual(initial.game!.transactions);expect(saved.equippedQuoteId).toBeNull();expect(errors).toEqual([]);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width+1);
});

test('legacy reserved quote closes, reloads offline and reveals the same conversion without a new debit',async({page,context},info)=>{
  await page.clock.install();
  const initial=fixture(), item=initial.game!.inventory[0];
  item.acquiredAt=new Date().toISOString();initial.game!.transactions[0].createdAt=item.acquiredAt;
  initial.game!.equippedQuoteId=null;initial.game!.pendingOpening={itemId:item.id,startedAt:item.acquiredAt,stage:'spinning'};
  await seed(page,initial);
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button',{name:'Guardar apertura para después',exact:true}).click();
  await expect(page.getByRole('button',{name:'Continuar apertura',exact:true})).toBeVisible();
  await page.reload();
  await expect(page.getByRole('dialog')).toBeVisible();
  await context.setOffline(true);
  await page.getByRole('button',{name:'Revelar ahora · sin animación',exact:true}).click();
  await expect(page.locator('.opening-item-result')).toContainText('+15 créditos');
  await expect(page.locator('.opening-rarity-badge')).toContainText('Común · CRÉDITOS');
  await page.screenshot({path:info.outputPath('legacy-conversion-result-mobile.png'),animations:'disabled'});
  await page.setViewportSize({width:1440,height:1000});
  await page.screenshot({path:info.outputPath('legacy-conversion-result-desktop.png'),animations:'disabled'});
  await page.getByRole('button',{name:'Aceptar créditos',exact:true}).click();
  const saved=(await read(page)).game!;expect(saved.inventory).toEqual(initial.game!.inventory);expect(saved.transactions).toEqual(initial.game!.transactions);expect(saved.pendingOpening).toBeNull();expect(saved.quoteConversions).toHaveLength(1);
  await context.setOffline(false);
});

test('multiple purchase clicks and a failed save retain one prize across navigation and retry',async({page},info)=>{
  await page.clock.install();await page.clock.pauseAt(new Date());const initial=fixture();await seed(page,initial);
  await page.getByRole('tab',{name:'Cofres',exact:true}).click();
  await page.evaluate(()=>{const state=window as Window & {blockFiveFailSave?:boolean};state.blockFiveFailSave=true;const put=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(value,key){if(key==='local'&&state.blockFiveFailSave)throw new DOMException('Quota exhausted','QuotaExceededError');return put.call(this,value,key)}});
  const buy=page.locator('.arcade-crate').first().getByRole('button',{name:/Abrir cofre/});
  await buy.evaluate(button=>{for(let i=0;i<5;i++)(button as HTMLButtonElement).click()});
  await expect(page.locator('.save-error-banner')).toBeVisible();
  expect((await read(page)).game!.transactions.length).toBe(initial.game!.transactions.length);
  await page.getByRole('navigation',{name:'Navegación principal'}).getByRole('button',{name:'Resumen',exact:true}).click();
  await page.getByRole('button',{name:'Créditos y cofres',exact:true}).click();
  await page.getByRole('button',{name:'Guardar apertura para después',exact:true}).click();
  await page.evaluate(()=>{(window as Window & {blockFiveFailSave?:boolean}).blockFiveFailSave=false});
  await page.getByRole('button',{name:'Reintentar guardado',exact:true}).click();
  await expect(page.locator('.save-error-banner')).toHaveCount(0);
  const saved=(await read(page)).game!;expect(saved.inventory.length).toBe(initial.game!.inventory.length+1);expect(saved.transactions.length).toBe(initial.game!.transactions.length+1);
  const id=saved.pendingOpening!.itemId;await page.getByRole('button',{name:'Continuar apertura',exact:true}).click();
  await page.getByRole('button',{name:'Revelar ahora · sin animación',exact:true}).click();await expect(page.locator('.opening-item-result')).toBeVisible();
  for(const width of [390,1440]){await page.setViewportSize({width,height:1000});await page.screenshot({path:info.outputPath(`new-result-${width}.png`),animations:'disabled'})}
  const complete=(await read(page)).game!;expect(complete.pendingOpening).toBeNull();expect(complete.inventory.at(-1)!.id).toBe(id);expect(complete.transactions).toEqual(saved.transactions);
});

test('production shell resumes the same legacy quote after a cold offline reload',async({page,context})=>{
  test.skip(process.env.PLAYWRIGHT_PRODUCTION!=='1','Cold offline startup requires the production service worker.');
  test.setTimeout(60000);
  await page.clock.install();await page.clock.pauseAt(new Date());
  const initial=fixture(), item=initial.game!.inventory[0];
  initial.game!.equippedQuoteId=null;initial.game!.pendingOpening={itemId:item.id,startedAt:item.acquiredAt,stage:'spinning'};
  // Keep the committed historical opening inside its five-second presentation window.
  item.acquiredAt=new Date().toISOString();initial.game!.transactions[0].createdAt=item.acquiredAt;initial.game!.pendingOpening.startedAt=item.acquiredAt;
  await seed(page,initial);
  await page.getByRole('button',{name:'Guardar apertura para después',exact:true}).click();
  await expect(page.locator('.offline-shell')).toContainText('Disponible sin conexión',{timeout:30000});
  await context.setOffline(true);await page.reload({waitUntil:'domcontentloaded'});
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button',{name:'Revelar ahora · sin animación',exact:true}).click();
  await expect(page.locator('.opening-item-result')).toContainText('+15 créditos');
  const saved=(await read(page)).game!;
  expect(saved.pendingOpening).toBeNull();expect(saved.inventory).toEqual(initial.game!.inventory);expect(saved.transactions).toEqual(initial.game!.transactions);expect(saved.quoteConversions).toHaveLength(1);
});
