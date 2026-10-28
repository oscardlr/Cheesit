import { test, expect, type Page } from '@playwright/test';
import { GEAR } from '../src/lib/gear';
import { COMPANIONS } from '../src/lib/companions';
import { normalizeGame, type InventoryItem } from '../src/lib/game';
import type { AppData } from '../src/lib/model';
import { DEFAULT_PROFILE } from '../src/lib/strength';

const nav=(page:Page)=>page.getByRole('navigation',{name:'Navegación principal'});
async function stored(page:Page):Promise<AppData>{return page.evaluate(()=>new Promise<AppData>((resolve,reject)=>{
  const request=indexedDB.open('entrenos-local',1);request.onerror=()=>reject(request.error);request.onsuccess=()=>{const db=request.result;const tx=db.transaction('state','readonly');const get=tx.objectStore('state').get('local');get.onsuccess=()=>resolve(get.result);tx.oncomplete=()=>db.close()};
}))}
async function seed(page:Page,gearIds:string[],companionIds:string[]=[],equipped=false){
  await page.goto('/');await expect(page.getByRole('heading',{name:'Resumen'})).toBeVisible();
  await expect(page.locator('.dashboard-footer .storage-status')).toContainText('Guardado en este dispositivo');
  const date=new Date().toISOString();
  const inventory:InventoryItem[]=[...gearIds.map(gearId=>({id:crypto.randomUUID(),kind:'gear' as const,gearId,rarity:GEAR.find(item=>item.id===gearId)!.rarity,acquiredAt:date,crateId:'starter',sold:false})),...companionIds.map(companionId=>({id:crypto.randomUUID(),kind:'companion' as const,companionId,rarity:COMPANIONS.find(item=>item.id===companionId)!.rarity,acquiredAt:date,crateId:'starter',sold:false}))];
  const game={...normalizeGame(),inventory,transactions:inventory.map(item=>({id:crypto.randomUUID(),kind:'crate' as const,itemId:item.id,amount:-100,createdAt:date})),cosmeticGear:equipped?Object.fromEntries(gearIds.map(id=>[GEAR.find(item=>item.id===id)!.slot,id])):{},equippedCompanionId:equipped?companionIds[0]??null:null};
  await page.evaluate(data=>new Promise<void>((resolve,reject)=>{const request=indexedDB.open('entrenos-local',1);request.onerror=()=>reject(request.error);request.onsuccess=()=>{const db=request.result;const tx=db.transaction('state','readwrite');tx.objectStore('state').put(data,'local');tx.oncomplete=()=>{db.close();resolve()};tx.onerror=()=>reject(tx.error)}}),{routines:[],workouts:[],customExercises:[],game,profile:DEFAULT_PROFILE,preferences:{effects:true,sound:false}});
  await page.reload();await expect(page.getByRole('heading',{name:'Resumen'})).toBeVisible();
}
async function collection(page:Page){if(new URLSearchParams(new URL(page.url()).hash.slice(1)).get('view')==='game'){await expect(page.getByRole('tab',{name:'Colección',exact:true})).toHaveAttribute('aria-selected','true');return}await nav(page).getByRole('button',{name:'Resumen',exact:true}).click();await page.getByRole('button',{name:'Personalizar personaje'}).click();await expect(page.getByRole('tab',{name:'Colección',exact:true})).toHaveAttribute('aria-selected','true')}
async function subtab(page:Page,name:string){await page.locator('.collection-subtabs').getByRole('button',{name,exact:true}).click()}

test.beforeEach(async({page})=>{await page.addInitScript(()=>sessionStorage.setItem('grind-intro-v1','1'))});

test('duplicate gear charges stack and one completed useful workout consumes one charge',async({page})=>{
  await seed(page,['lime-shorts','lime-shorts','plasma-blaster']);await collection(page);await subtab(page,'Habilidades');
  const legs=page.locator('.ability-card[data-ability-id="lime-shorts"]');
  await expect(legs.locator('.ability-charge-row strong')).toHaveText('2');
  await legs.getByRole('button',{name:'Preparar habilidad'}).click();
  await expect(legs).toHaveClass(/is-active/);
  const blaster=page.locator('.ability-card[data-ability-id="plasma-blaster"]');
  await blaster.getByRole('button',{name:'Preparar habilidad'}).click();
  await expect(legs).not.toHaveClass(/is-active/);await expect(blaster).toHaveClass(/is-active/);
  await legs.getByRole('button',{name:'Preparar habilidad'}).click();
  await nav(page).getByRole('button',{name:'Empezar entrenamiento',exact:true}).click();
  await page.getByRole('main').getByRole('button',{name:/Empezar entrenamiento/}).click();
  await page.getByRole('button',{name:'＋ Añadir ejercicio'}).click();
  await page.getByRole('dialog').getByRole('button',{name:/^Extensión de cuádriceps/}).click();
  await page.getByLabel('Carga en kg, serie 1 de Extensión de cuádriceps').fill('50');
  await page.getByLabel('Repeticiones, serie 1 de Extensión de cuádriceps').fill('8');
  await page.getByRole('button',{name:'Confirmar serie 1'}).click();await page.getByRole('button',{name:'Cerrar celebración'}).click();
  await expect.poll(async()=>(await stored(page)).game?.abilityUses?.length??0).toBe(0);
  await page.getByRole('button',{name:'Finalizar entrenamiento'}).click();
  await expect(page.getByRole('dialog',{name:'SESIÓN COMPLETADA.'})).toBeVisible();
  await expect.poll(async()=>(await stored(page)).game?.abilityUses?.length??0).toBe(1);
  const saved=await stored(page);expect(saved.workouts[0].abilityId).toBe('lime-shorts');expect(saved.workouts[0].abilityReward?.bonusXp).toBeGreaterThan(0);
  await page.getByRole('button',{name:'A por el siguiente nivel'}).click();await collection(page);await subtab(page,'Habilidades');
  await expect(page.locator('.ability-card[data-ability-id="lime-shorts"] .ability-charge-row strong')).toHaveText('1');
  await page.reload();await collection(page);await subtab(page,'Habilidades');
  await expect(page.locator('.ability-card[data-ability-id="lime-shorts"] .ability-charge-row strong')).toHaveText('1');
  expect((await stored(page)).game?.abilityUses).toHaveLength(1);
});

test('mythic equipment and companions cannot be sold and stay equipped through reload',async({page},info)=>{
  await page.emulateMedia({reducedMotion:'reduce'});await seed(page,['celestial-armor','phoenix-crown','void-greaves','thunder-hammer','solar-cape'],['dragon-queen'],true);
  await expect(page.locator('.character-summary-card .character-equipped')).toHaveCount(5);
  await expect(page.locator('.character-summary-card .companion-sprite')).toHaveAttribute('data-companion-id','dragon-queen');
  for(const width of [390,1440]){await page.setViewportSize({width,height:1000});await page.locator('.character-summary-card').screenshot({path:info.outputPath(`mythic-party-${width}.png`),animations:'disabled'})}
  await collection(page);await page.locator('.wardrobe-stage').screenshot({path:info.outputPath('mythic-wardrobe.png'),animations:'disabled'});
  const before=await stored(page);
  await expect(page.getByRole('button',{name:/Vender/})).toHaveCount(0);
  await expect(page.locator('.quote-collection .loot-item-card')).toHaveCount(6);
  await expect(page.locator('.wardrobe-stage .character-slot-top')).toHaveCount(1);
  await expect(page.locator('.wardrobe-stage .character-party .companion-sprite')).toHaveAttribute('data-companion-id','dragon-queen');
  await subtab(page,'Aspectos');await expect(page.locator('.cosmetic-card').filter({hasText:'Armadura celestial'})).toBeVisible();
  await subtab(page,'Inventario');
  await expect(page.locator('.collection-subtabs').getByRole('button',{name:'Compañeras',exact:true})).toHaveCount(0);
  await expect(page.locator('.loot-item-card[data-definition-id="dragon-queen"]').getByRole('button',{name:'Quitar compañera',exact:true})).toHaveAttribute('aria-pressed','true');
  await nav(page).getByRole('button',{name:'Resumen',exact:true}).click();await page.reload();await expect(page.locator('.character-summary-card .character-slot-top')).toHaveCount(1);await expect(page.locator('.character-summary-card .companion-sprite')).toHaveAttribute('data-companion-id','dragon-queen');
  expect((await stored(page)).game).toEqual(before.game);
});

test('character, legendary aura and companion visibly idle and stop for reduced motion',async({page})=>{
  await seed(page,['phoenix-crown'],['sorceress'],true);
  const layers=page.locator('.character-summary-card .character-layers');
  await expect(layers).toHaveCSS('animation-name','character-living-idle');
  const first=await layers.evaluate(element=>getComputedStyle(element).transform);
  await expect.poll(()=>layers.evaluate(element=>getComputedStyle(element).transform)).not.toBe(first);
  await expect(page.locator('.character-summary-card .character-equipped')).toHaveCSS('animation-name','gear-living-aura');
  await expect(page.locator('.character-summary-card .companion-sprite')).toHaveCSS('animation-name','companion-living-idle');
  await page.emulateMedia({reducedMotion:'reduce'});
  await expect(layers).toHaveCSS('animation-name','none');await expect(page.locator('.character-summary-card .companion-sprite')).toHaveCSS('animation-name','none');
});

test('all wardrobe sections and the equipped party fit narrow mobile through desktop',async({page},info)=>{
  test.setTimeout(60000);
  await page.emulateMedia({reducedMotion:'reduce'});
  await seed(page,GEAR.map(gear=>gear.id),COMPANIONS.map(companion=>companion.id),true);
  for(const width of [320,390,768,1440]){
    await page.setViewportSize({width,height:1000});
    await nav(page).getByRole('button',{name:'Resumen',exact:true}).click();
    await expect(page.getByRole('heading',{name:'Resumen'})).toBeVisible();
    await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width+1);
    await collection(page);
    for(const name of ['Inventario','Aspectos','Habilidades']){
      await subtab(page,name);
      const size=await page.evaluate(()=>({width:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth}));
      const overflow=size.scroll>size.width+1?await page.evaluate(()=>Array.from(document.querySelectorAll('.wardrobe-v3 *')).map(element=>{const box=element.getBoundingClientRect();return{element:element.className,right:Math.round(box.right),width:Math.round(box.width)}}).filter(box=>box.right>document.documentElement.clientWidth+1).slice(0,15)):[];
      expect(size.scroll,`${name} must fit ${width}px; overflowing boxes: ${JSON.stringify(overflow)}`).toBeLessThanOrEqual(size.width+1);
      if(width===320&&name==='Inventario')await page.screenshot({path:info.outputPath('collection-with-companions-320.png'),fullPage:true,animations:'disabled'});
    }
  }
});
