import { test, expect, type Page } from '@playwright/test';
import { GEAR, type GearSlot } from '../src/lib/gear';
import { normalizeGame, type GameState, type InventoryItem } from '../src/lib/game';
import { DEFAULT_PROFILE } from '../src/lib/strength';
import type { AppData } from '../src/lib/model';

async function putFixture(page:Page,data:AppData){
  await expect(page.locator('.dashboard-footer .storage-status')).toContainText('Guardado en este dispositivo');
  await page.evaluate(value=>new Promise<void>((resolve,reject)=>{
    const request=indexedDB.open('entrenos-local',1);request.onerror=()=>reject(request.error);
    request.onsuccess=()=>{const db=request.result;const tx=db.transaction('state','readwrite');tx.objectStore('state').put(value,'local');tx.oncomplete=()=>{db.close();resolve()};tx.onerror=()=>reject(tx.error)};
  }),data);
  await page.reload();
}

test.beforeEach(async({page})=>{
  await page.addInitScript(()=>sessionStorage.setItem('grind-intro-v1','1'));
  await page.emulateMedia({reducedMotion:'reduce'});
});

test('the summary avatar opens its wardrobe and starts with basic clothing',async({page},info)=>{
  await page.goto('/');
  await expect(page.locator('.character-summary-card')).toContainText('0/5 piezas equipadas');
  await expect(page.locator('.character-summary-card .character-base')).toHaveCSS('background-image',/grind-avatar-base\.png/);
  await page.locator('.character-summary-card').screenshot({path:info.outputPath('avatar-inicial.png'),animations:'disabled'});
  await page.getByRole('button',{name:'Personalizar personaje'}).click();
  await expect(page.getByRole('tab',{name:'Colección',exact:true})).toHaveAttribute('aria-selected','true');
  await expect(page.locator('.wardrobe-slots')).toContainText('Bóxer inicial');
  await expect(page.locator('.wardrobe-stage .character-equipped')).toHaveCount(0);
});

test('five gear layers render and unequipping preserves inventory through reload',async({page},info)=>{
  await page.goto('/');
  await expect(page.getByRole('heading',{name:'Resumen'})).toBeVisible();
  const now=new Date().toISOString();
  const ids=['dragon-head','golden-armor','lime-shorts','titan-sword','neon-wings'];
  const inventory:InventoryItem[]=ids.map(gearId=>({id:crypto.randomUUID(),kind:'gear',gearId,rarity:GEAR.find(gear=>gear.id===gearId)!.rarity,acquiredAt:now,crateId:'starter',sold:false}));
  const game:GameState={...normalizeGame(),inventory,transactions:inventory.map(item=>({id:crypto.randomUUID(),kind:'crate',itemId:item.id,amount:-100,createdAt:now})),equippedGear:Object.fromEntries(inventory.map(item=>[GEAR.find(gear=>gear.id===item.gearId)!.slot,item.id])) as Record<GearSlot,string>,cosmeticGear:Object.fromEntries(inventory.map(item=>[GEAR.find(gear=>gear.id===item.gearId)!.slot,item.gearId])) as Record<GearSlot,string>};
  await putFixture(page,{routines:[],workouts:[],customExercises:[],game,profile:DEFAULT_PROFILE,preferences:{effects:true,sound:false}});
  await expect(page.locator('.character-summary-card .character-equipped')).toHaveCount(5);
  for(const width of [390,1440]){
    await page.setViewportSize({width,height:1000});
    await page.locator('.character-summary-card').screenshot({path:info.outputPath(`avatar-equipado-${width}.png`),animations:'disabled'});
    // Read all rectangles in one frame. The production offline banner changes
    // height after cache preparation and can reflow the entire page between awaits.
    const {base,layers}=await page.locator('.character-summary-card').evaluate(card=>({
      base:card.querySelector('.character-base')!.getBoundingClientRect().toJSON(),
      layers:Array.from(card.querySelectorAll('.character-equipped'),layer=>layer.getBoundingClientRect().toJSON()),
    }));
    for(const fitted of layers){
      for(const key of ['x','y','width','height'] as const){
        expect(Math.abs(fitted[key]-base[key]),`Every worn piece shares the body's ${key} at ${width}px`).toBeLessThan(.5);
      }
    }
  }
  await page.getByRole('button',{name:'Personalizar personaje'}).click();
  await page.locator('.wardrobe-stage').screenshot({path:info.outputPath('armario-equipado.png'),animations:'disabled'});
  await page.getByRole('button',{name:'Quitar equipo de Cabeza',exact:true}).click();
  await expect(page.locator('.wardrobe-stage .character-slot-head')).toHaveCount(0);
  await expect(page.locator('.wardrobe-stage .character-equipped')).toHaveCount(4);
  await expect(page.getByRole('button',{name:/Vender/})).toHaveCount(0);
  await expect(page.locator('.quote-collection .loot-item-card')).toHaveCount(5);
  await expect(page.locator('.wardrobe-stage .character-slot-hand')).toHaveCount(1);
  await expect(page.locator('.wardrobe-stage .character-equipped')).toHaveCount(4);
  await page.getByRole('navigation',{name:'Navegación principal'}).getByRole('button',{name:'Resumen',exact:true}).click();
  await page.reload();
  await page.getByRole('button',{name:'Personalizar personaje'}).click();
  await expect(page.locator('.wardrobe-stage .character-equipped')).toHaveCount(4);
  await expect(page.locator('.quote-collection .loot-item-card')).toHaveCount(5);
});
