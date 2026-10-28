import { test, expect, type Page } from '@playwright/test';
import { GEAR } from '../src/lib/gear';
import { COMPANIONS } from '../src/lib/companions';
import { getAbilityCharges, isGameState, normalizeGame, QUOTES, RARITIES, type GameState, type InventoryItem } from '../src/lib/game';
import type { AppData } from '../src/lib/model';
import { DEFAULT_PROFILE } from '../src/lib/strength';

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

function item(kind:'gear'|'quote'|'companion',definitionId:string,acquiredAt:string):InventoryItem{
  const definition=(kind==='gear'?GEAR:kind==='quote'?QUOTES:COMPANIONS).find(value=>value.id===definitionId)!;
  return {id:crypto.randomUUID(),kind,...(kind==='gear'?{gearId:definitionId}:kind==='quote'?{quoteId:definitionId}:{companionId:definitionId}),rarity:definition.rarity,acquiredAt,crateId:'starter',sold:false};
}

function owned(inventory:InventoryItem[]):GameState{
  return {...normalizeGame(),inventory,transactions:inventory.map(value=>({id:crypto.randomUUID(),kind:'crate',itemId:value.id,amount:-100,createdAt:value.acquiredAt}))};
}

async function seed(page:Page,game:GameState){
  expect(isGameState(game)).toBe(true);
  await page.goto('/');await expect(page.getByRole('heading',{name:'Resumen'})).toBeVisible();
  await expect.poll(async()=>Boolean((await stored(page))?.preferences)).toBe(true);
  await page.evaluate(data=>new Promise<void>((resolve,reject)=>{
    const request=indexedDB.open('entrenos-local',1);request.onerror=()=>reject(request.error);
    request.onsuccess=()=>{
      const db=request.result,tx=db.transaction('state','readwrite');
      tx.objectStore('state').put(data,'local');
      tx.oncomplete=()=>{db.close();resolve()};tx.onerror=()=>reject(tx.error);
    };
  }),{routines:[],workouts:[],customExercises:[],game,profile:DEFAULT_PROFILE,preferences:{effects:false,sound:false}});
  await page.reload();await expect(page.getByRole('heading',{name:'Resumen'})).toBeVisible();
}

async function collection(page:Page){
  await page.getByRole('button',{name:'Personalizar personaje'}).click();
  await expect(page.getByRole('tab',{name:'Colección',exact:true})).toHaveAttribute('aria-selected','true');
}

const card=(page:Page,kind:string,definitionId:string)=>page.locator(`.loot-item-card[data-item-kind="${kind}"][data-definition-id="${definitionId}"]`);

test.beforeEach(async({page})=>{
  await page.addInitScript(()=>sessionStorage.setItem('grind-intro-v1','1'));
  await page.emulateMedia({reducedMotion:'reduce'});
});

test('inventory groups legacy quote duplicates without counters and keeps equipment quantities, filters and persistence',async({page},info)=>{
  const date=new Date().toISOString();
  const inventory=[item('gear','lime-shorts',date),item('gear','lime-shorts',date),item('gear','lime-shorts',date),item('gear','purple-tank',date),item('quote','show-up',date),item('quote','show-up',date),item('quote','one-rep',date),item('companion','athlete',date),item('companion','athlete',date)];
  delete inventory[4].kind; // Original quote saves have no kind field.
  const initial=owned(inventory);
  await seed(page,initial);await collection(page);
  const gear=card(page,'gear','lime-shorts'),quote=card(page,'quote','show-up'),companion=card(page,'companion','athlete');
  await expect(page.locator('.quote-collection .loot-item-card')).toHaveCount(5);
  await expect(gear).toHaveCount(1);await expect(gear.locator('.inventory-quantity')).toHaveText('3x');
  await expect(gear).toContainText('1 carga por copia revelada.');
  await expect(quote).toHaveCount(1);await expect(quote.locator('.inventory-quantity')).toHaveCount(0);
  await expect(page.locator('.loot-item-card[data-item-kind="quote"] .inventory-quantity')).toHaveCount(0);
  await expect(companion).toHaveCount(1);await expect(companion.locator('.inventory-quantity')).toHaveText('2x');
  await expect(card(page,'quote','one-rep')).toHaveCount(1);
  await expect(card(page,'gear','purple-tank').locator('.inventory-quantity')).toHaveCount(0);
  await expect(page.getByRole('button',{name:/Vender/})).toHaveCount(0);

  for(const width of [320,1440]){
    await page.setViewportSize({width,height:1000});
    await gear.screenshot({path:info.outputPath(`inventory-stack-${width}.png`),animations:'disabled'});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width+1);
  }
  await page.locator('.collection-type-filters').getByRole('button',{name:'Equipo',exact:true}).click();
  await expect(page.locator('.quote-collection .loot-item-card')).toHaveCount(2);
  await expect(gear.locator('.inventory-quantity')).toHaveText('3x');
  await page.locator('.collection-filters').getByRole('button',{name:'Rara',exact:true}).click();
  await expect(page.locator('.quote-collection .loot-item-card')).toHaveCount(1);
  await expect(card(page,'gear','purple-tank')).toBeVisible();
  await page.locator('.collection-filters').getByRole('button',{name:'Todas las rarezas',exact:true}).click();
  await page.locator('.collection-type-filters').getByRole('button',{name:'Frases',exact:true}).click();
  await expect(page.locator('.quote-collection .loot-item-card')).toHaveCount(2);
  await quote.getByRole('button',{name:'Equipar lema',exact:true}).click();
  await expect(quote.getByRole('button',{name:'Quitar lema',exact:true})).toHaveAttribute('aria-pressed','true');
  await page.locator('.collection-type-filters').getByRole('button',{name:'Compañeras',exact:true}).click();
  await expect(page.locator('.quote-collection .loot-item-card')).toHaveCount(1);
  await companion.getByRole('button',{name:'Equipar compañera',exact:true}).click();
  await page.locator('.collection-type-filters').getByRole('button',{name:'Todo',exact:true}).click();
  await gear.getByRole('button',{name:'Equipar pieza',exact:true}).click();
  await expect.poll(async()=>(await stored(page)).game?.cosmeticGear?.bottom).toBe('lime-shorts');
  const saved=(await stored(page)).game!;
  expect(saved.inventory).toEqual(initial.inventory);expect(saved.transactions).toEqual(initial.transactions);
  expect(saved.equippedQuoteId).toBe('show-up');expect(saved.equippedCompanionId).toBe('athlete');
  expect(getAbilityCharges(saved,'lime-shorts')).toBe(3);
  await page.reload();await collection(page);
  await expect(page.locator('.quote-collection .loot-item-card')).toHaveCount(5);
  await expect(gear.locator('.inventory-quantity')).toHaveText('3x');
  await expect(quote).toHaveCount(1);await expect(quote.locator('.inventory-quantity')).toHaveCount(0);
  await expect(page.locator('.loot-item-card[data-item-kind="quote"] .inventory-quantity')).toHaveCount(0);
  await expect(companion.locator('.inventory-quantity')).toHaveText('2x');
  await expect(gear.getByRole('button',{name:'Quitar pieza',exact:true})).toHaveAttribute('aria-pressed','true');
  await expect(quote.getByRole('button',{name:'Quitar lema',exact:true})).toHaveAttribute('aria-pressed','true');
  await expect(companion.getByRole('button',{name:'Quitar compañera',exact:true})).toHaveAttribute('aria-pressed','true');
  await expect(page.getByRole('button',{name:/Vender/})).toHaveCount(0);
  expect((await stored(page)).game?.inventory).toEqual(initial.inventory);
  expect((await stored(page)).game?.transactions).toEqual(initial.transactions);
});

test('inventory quantities exclude historical sales and a duplicate awaiting its reveal',async({page})=>{
  const now=new Date(),date=now.toISOString();
  await page.clock.setFixedTime(now);
  const inventory=Array.from({length:4},()=>item('gear','lime-shorts',date));
  inventory[0].sold=true;
  const game=owned(inventory);
  game.transactions.push({id:crypto.randomUUID(),kind:'sale',itemId:inventory[0].id,amount:RARITIES.common.sellValue,createdAt:date});
  game.pendingOpening={itemId:inventory[3].id,startedAt:date,stage:'spinning'};
  await seed(page,game);await collection(page);
  await page.getByRole('button',{name:'Guardar apertura para después',exact:true}).click();
  const gear=card(page,'gear','lime-shorts');
  await expect(page.locator('.quote-collection .loot-item-card')).toHaveCount(1);
  await expect(gear.locator('.inventory-quantity')).toHaveText('2x');
  await expect(page.getByRole('button',{name:/Vender/})).toHaveCount(0);
  const saved=(await stored(page)).game!;
  expect(saved.inventory).toEqual(game.inventory);expect(saved.transactions).toEqual(game.transactions);
  expect(saved.pendingOpening?.itemId).toBe(inventory[3].id);
  expect(getAbilityCharges(saved,'lime-shorts')).toBe(3); // Historical revealed drops still own their earned charges.
});

test('inventory orders each rarity by companion, equipment and phrases while looks and abilities remain rarest first',async({page})=>{
  const date=new Date().toISOString();
  // Intentionally acquired from least to most rare, mixing all reward kinds.
  const inventory=[
    item('gear','lime-shorts',date),item('gear','purple-tank',date),item('gear','golden-armor',date),item('gear','dragon-head',date),
    item('companion','athlete',date),item('companion','warrior',date),item('companion','sorceress',date),item('companion','dragon-queen',date),
    item('quote','show-up',date),item('quote','habit',date),item('quote','built',date),item('quote','legend',date),
  ];
  delete inventory[8].kind; // Legacy quotes must use their resolved reward type too.
  const game=owned(inventory);
  await seed(page,game);await collection(page);
  const rarestFirst=['legendary','epic','rare','common'];
  const rarities=(selector:string)=>page.locator(selector).evaluateAll(elements=>elements.map(element=>element.getAttribute('data-rarity')));
  const kinds=()=>page.locator('.loot-item-card').evaluateAll(elements=>elements.map(element=>element.getAttribute('data-item-kind')));
  await expect.poll(()=>rarities('.loot-item-card')).toEqual(rarestFirst.flatMap(rarity=>[rarity,rarity,rarity]));
  await expect.poll(kinds).toEqual(rarestFirst.flatMap(()=>['companion','gear','quote']));
  await page.locator('.collection-type-filters').getByRole('button',{name:'Compañeras',exact:true}).click();
  await expect.poll(()=>rarities('.loot-item-card')).toEqual(rarestFirst);
  await page.locator('.collection-type-filters').getByRole('button',{name:'Todo',exact:true}).click();
  await page.locator('.collection-filters').getByRole('button',{name:'Rara',exact:true}).click();
  await expect.poll(()=>rarities('.loot-item-card')).toEqual(['rare','rare','rare']);
  await expect.poll(kinds).toEqual(['companion','gear','quote']);
  await page.locator('.collection-filters').getByRole('button',{name:'Todas las rarezas',exact:true}).click();
  await expect.poll(()=>rarities('.loot-item-card')).toEqual(rarestFirst.flatMap(rarity=>[rarity,rarity,rarity]));
  for(const [name,selector] of [['Aspectos','.cosmetic-card'],['Habilidades','.ability-card']]){
    await page.locator('.collection-subtabs').getByRole('button',{name,exact:true}).click();
    await expect.poll(()=>rarities(selector)).toEqual(name==='Aspectos'?rarestFirst.flatMap(rarity=>[rarity,rarity]):rarestFirst);
    if(name==='Aspectos')await expect.poll(()=>page.locator('.cosmetic-card').evaluateAll(elements=>elements.map(element=>element.hasAttribute('data-companion-id')?'companion':'gear'))).toEqual(rarestFirst.flatMap(()=>['companion','gear']));
  }
  await page.reload();await collection(page);
  await expect.poll(()=>rarities('.loot-item-card')).toEqual(rarestFirst.flatMap(rarity=>[rarity,rarity,rarity]));
  await expect.poll(kinds).toEqual(rarestFirst.flatMap(()=>['companion','gear','quote']));
  expect((await stored(page)).game?.inventory).toEqual(game.inventory);
  expect((await stored(page)).game?.transactions).toEqual(game.transactions);
});

test('companions equip from inventory and the sixth wardrobe slot and persist without a separate tab',async({page})=>{
  const date=new Date().toISOString();
  const game=owned([item('gear','purple-tank',date),item('companion','athlete',date),item('companion','dragon-queen',date)]);
  await seed(page,game);await collection(page);
  await expect(page.locator('.collection-subtabs').getByRole('button')).toHaveText(['Inventario','Aspectos','Habilidades']);
  const slot=page.locator('.wardrobe-slot[data-slot="companion"]');
  await expect(page.locator('.wardrobe-slot')).toHaveCount(6);
  await expect(slot).toContainText('Compañera');
  await expect(slot.locator('select')).toHaveCount(0);
  await expect(slot.locator('.companion-sprite')).toHaveCount(0);
  await card(page,'companion','athlete').getByRole('button',{name:'Equipar compañera',exact:true}).click();
  await expect(slot.locator('.companion-sprite')).toHaveAttribute('data-companion-id','athlete');
  await expect(slot.locator('.companion-sprite')).toHaveAttribute('data-companion-id','athlete');
  await expect(page.locator('.wardrobe-stage .character-party .companion-sprite')).toHaveAttribute('data-companion-id','athlete');
  await slot.getByRole('button',{name:'Ver aspectos de Compañera',exact:true}).click();
  await expect(page.locator('.collection-subtabs').getByRole('button',{name:'Aspectos',exact:true})).toHaveAttribute('aria-pressed','true');
  await expect(page.getByRole('navigation',{name:'Filtrar aspectos por ranura'}).getByRole('button',{name:'Compañera',exact:true})).toHaveAttribute('aria-pressed','true');
  await expect(page.locator('.cosmetic-card[data-gear-id]')).toHaveCount(0);
  await page.locator('.cosmetic-card[data-companion-id="dragon-queen"]').getByRole('button',{name:'Equipar compañera',exact:true}).click();
  await page.locator('.collection-subtabs').getByRole('button',{name:'Inventario',exact:true}).click();
  await expect(slot.locator('.companion-sprite')).toHaveAttribute('data-companion-id','dragon-queen');
  await expect(card(page,'companion','dragon-queen').getByRole('button',{name:'Quitar compañera',exact:true})).toHaveAttribute('aria-pressed','true');
  await expect(card(page,'companion','athlete').getByRole('button',{name:'Equipar compañera',exact:true})).toHaveAttribute('aria-pressed','false');
  await expect.poll(async()=>(await stored(page)).game?.equippedCompanionId).toBe('dragon-queen');
  await page.reload();
  await expect(page.locator('.character-summary-card .character-party .companion-sprite')).toHaveAttribute('data-companion-id','dragon-queen');
  await collection(page);
  await expect(slot.locator('.companion-sprite')).toHaveAttribute('data-companion-id','dragon-queen');
  await slot.getByRole('button',{name:'Quitar compañera del armario',exact:true}).click();
  await expect(slot.locator('.companion-sprite')).toHaveCount(0);
  await expect(page.locator('.wardrobe-stage .character-party .companion-sprite')).toHaveCount(0);
  await expect.poll(async()=>(await stored(page)).game?.equippedCompanionId).toBeNull();
  await page.reload();await collection(page);
  await expect(slot.locator('.companion-sprite')).toHaveCount(0);
  await expect(page.locator('.loot-item-card[data-item-kind="companion"]')).toHaveCount(2);
  expect((await stored(page)).game?.inventory).toEqual(game.inventory);
  expect((await stored(page)).game?.transactions).toEqual(game.transactions);
});

test('all six wardrobe shortcuts open their aspect filter by keyboard when empty and by pointer when equipped',async({page},info)=>{
  test.setTimeout(60000);
  const date=new Date().toISOString();
  const game=owned([...GEAR.map(gear=>item('gear',gear.id,date)),...COMPANIONS.map(companion=>item('companion',companion.id,date))]);
  await seed(page,game);await collection(page);
  const sections=[
    {slot:'head',shortcut:'Cabeza',filter:'Cabeza'},
    {slot:'top',shortcut:'Torso',filter:'Torso'},
    {slot:'bottom',shortcut:'Piernas',filter:'Piernas'},
    {slot:'hand',shortcut:'Mano',filter:'Manos'},
    {slot:'back',shortcut:'Espalda',filter:'Espalda'},
    {slot:'companion',shortcut:'Compañera',filter:'Compañera'},
  ];
  const filters=page.getByRole('navigation',{name:'Filtrar aspectos por ranura',exact:true});
  const looks=page.getByRole('region',{name:'Aspectos del armario',exact:true});
  const looksTab=page.locator('.collection-subtabs').getByRole('button',{name:'Aspectos',exact:true});
  const countFor=(slot:string)=>slot==='companion'?COMPANIONS.length:GEAR.filter(gear=>gear.slot===slot).length;
  const filteredTo=async(slot:string,label:string)=>{
    await expect(looksTab).toHaveAttribute('aria-pressed','true');
    await expect(filters.getByRole('button',{name:label,exact:true})).toHaveAttribute('aria-pressed','true');
    await expect(page.locator('.cosmetic-card')).toHaveCount(countFor(slot));
    await expect.poll(()=>page.locator('.cosmetic-card').evaluateAll(elements=>elements.map(element=>element.getAttribute('data-slot')))).toEqual(Array(countFor(slot)).fill(slot));
  };

  // Every empty slot can be reached from the keyboard, including ones with no
  // currently equipped piece. Opening a category moves focus to its content.
  for(const {slot,shortcut,filter} of sections){
    const stageSlot=page.locator(`.wardrobe-slot[data-slot="${slot}"]`);
    await expect(stageSlot.getByRole('button',{name:/^Quitar /})).toHaveCount(0);
    const open=stageSlot.getByRole('button',{name:`Ver aspectos de ${shortcut}`,exact:true});
    await open.focus();await open.press('Enter');
    await filteredTo(slot,filter);
    await expect(looks).toBeFocused();
    const first=page.locator('.cosmetic-card').first();
    await first.getByRole('button',{name:slot==='companion'?'Equipar compañera':'Usar aspecto',exact:true}).click();
    await expect(first.locator('.wardrobe-action')).toHaveAttribute('aria-pressed','true');
    await expect(stageSlot.getByRole('button',{name:/^Quitar /})).toHaveCount(1);
  }
  await expect.poll(async()=>Object.keys((await stored(page)).game?.cosmeticGear??{}).length).toBe(5);
  const equipped=(await stored(page)).game!;
  expect(equipped.equippedCompanionId).toBeTruthy();

  for(const {slot,shortcut,filter} of sections){
    await page.locator(`.wardrobe-slot[data-slot="${slot}"]`).getByRole('button',{name:`Ver aspectos de ${shortcut}`,exact:true}).click();
    await filteredTo(slot,filter);
    await expect(looks).toBeFocused();
    await expect(page.locator('.cosmetic-card .wardrobe-action[aria-pressed="true"]')).toHaveCount(1);
  }

  // The same categories also work directly, and Todos restores the complete
  // mixed collection while preserving global rarity ordering.
  for(const {slot,filter} of sections){
    await filters.getByRole('button',{name:filter,exact:true}).click();
    await filteredTo(slot,filter);
  }
  await filters.getByRole('button',{name:'Todos',exact:true}).click();
  await expect(page.locator('.cosmetic-card')).toHaveCount(GEAR.length+COMPANIONS.length);
  const orders=await page.locator('.cosmetic-card').evaluateAll(elements=>elements.map(element=>({common:0,rare:1,epic:2,legendary:3}[element.getAttribute('data-rarity') as 'common'|'rare'|'epic'|'legendary'])));
  expect(orders).toEqual([...orders].sort((left,right)=>right-left));
  for(const width of [320,1440]){
    await page.setViewportSize({width,height:1000});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width+1);
    await page.locator('.wardrobe-stage').screenshot({path:info.outputPath(`wardrobe-slot-shortcuts-${width}.png`),animations:'disabled'});
    await filters.getByRole('button',{name:'Compañera',exact:true}).click();
    await filteredTo('companion','Compañera');
    expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width+1);
    await looks.screenshot({path:info.outputPath(`companion-aspects-${width}.png`),animations:'disabled'});
    await filters.getByRole('button',{name:'Todos',exact:true}).click();
  }
  expect((await stored(page)).game).toEqual(equipped);
  expect(equipped.inventory).toEqual(game.inventory);
  expect(equipped.transactions).toEqual(game.transactions);
});

test('companions equip and unequip as permanent aspects and stay synchronized with inventory and wardrobe after reload',async({page})=>{
  const date=new Date().toISOString();
  const game=owned([item('gear','purple-tank',date),item('companion','athlete',date),item('companion','dragon-queen',date)]);
  await seed(page,game);await collection(page);
  const slot=page.locator('.wardrobe-slot[data-slot="companion"]');
  await slot.getByRole('button',{name:'Ver aspectos de Compañera',exact:true}).click();
  const filters=page.getByRole('navigation',{name:'Filtrar aspectos por ranura',exact:true});
  await expect(filters.getByRole('button',{name:'Compañera',exact:true})).toHaveAttribute('aria-pressed','true');
  const queen=page.locator('.cosmetic-card[data-companion-id="dragon-queen"]');
  const athlete=page.locator('.cosmetic-card[data-companion-id="athlete"]');
  await expect(page.locator('.cosmetic-card')).toHaveCount(2);
  await expect(queen).toHaveAttribute('data-slot','companion');
  await expect(athlete).toHaveAttribute('data-slot','companion');
  await expect(queen.getByRole('button',{name:'Equipar compañera',exact:true})).toHaveAttribute('aria-pressed','false');
  await queen.getByRole('button',{name:'Equipar compañera',exact:true}).click();
  await expect(slot.locator('.companion-sprite')).toHaveAttribute('data-companion-id','dragon-queen');
  await expect(page.locator('.wardrobe-stage .character-party .companion-sprite')).toHaveAttribute('data-companion-id','dragon-queen');
  await expect.poll(async()=>(await stored(page)).game?.equippedCompanionId).toBe('dragon-queen');
  await page.locator('.collection-subtabs').getByRole('button',{name:'Inventario',exact:true}).click();
  await expect(card(page,'companion','dragon-queen').getByRole('button',{name:'Quitar compañera',exact:true})).toHaveAttribute('aria-pressed','true');
  await page.reload();await collection(page);
  await expect(slot.locator('.companion-sprite')).toHaveAttribute('data-companion-id','dragon-queen');
  await slot.getByRole('button',{name:'Ver aspectos de Compañera',exact:true}).click();
  await expect(queen.getByRole('button',{name:'Quitar compañera',exact:true})).toHaveAttribute('aria-pressed','true');
  await athlete.getByRole('button',{name:'Equipar compañera',exact:true}).click();
  await expect(queen.getByRole('button',{name:'Equipar compañera',exact:true})).toHaveAttribute('aria-pressed','false');
  await expect(slot.locator('.companion-sprite')).toHaveAttribute('data-companion-id','athlete');
  await athlete.getByRole('button',{name:'Quitar compañera',exact:true}).click();
  await expect(slot.locator('.companion-sprite')).toHaveCount(0);
  await expect(page.locator('.wardrobe-stage .character-party .companion-sprite')).toHaveCount(0);
  await expect(page.locator('.cosmetic-card')).toHaveCount(2);
  await expect.poll(async()=>(await stored(page)).game?.equippedCompanionId).toBeNull();
  await page.reload();await collection(page);
  await expect(card(page,'companion','athlete').getByRole('button',{name:'Equipar compañera',exact:true})).toHaveAttribute('aria-pressed','false');
  await slot.getByRole('button',{name:'Ver aspectos de Compañera',exact:true}).click();
  await expect(queen.getByRole('button',{name:'Equipar compañera',exact:true})).toHaveAttribute('aria-pressed','false');
  await expect(athlete.getByRole('button',{name:'Equipar compañera',exact:true})).toHaveAttribute('aria-pressed','false');
  expect((await stored(page)).game?.inventory).toEqual(game.inventory);
  expect((await stored(page)).game?.transactions).toEqual(game.transactions);
});

test('a companion-only wardrobe keeps historical unlocked aspects and hides an unrevealed companion',async({page})=>{
  const now=new Date(),date=now.toISOString();
  await page.clock.setFixedTime(now);
  const inventory=COMPANIONS.map(companion=>item('companion',companion.id,date));
  const warrior=inventory.find(copy=>copy.companionId==='warrior')!;
  warrior.sold=true;
  const queen=inventory.find(copy=>copy.companionId==='dragon-queen')!;
  const game=owned(inventory);
  game.transactions.push({id:crypto.randomUUID(),kind:'sale',itemId:warrior.id,amount:RARITIES.rare.sellValue,createdAt:date});
  game.pendingOpening={itemId:queen.id,startedAt:date,stage:'spinning'};
  await seed(page,game);await collection(page);
  await page.getByRole('button',{name:'Guardar apertura para después',exact:true}).click();
  await expect(page.locator('.loot-item-card')).toHaveCount(2);
  const slot=page.locator('.wardrobe-slot[data-slot="companion"]');
  await slot.getByRole('button',{name:'Ver aspectos de Compañera',exact:true}).click();
  await expect(page.locator('.cosmetic-card')).toHaveCount(3);
  await expect(page.locator('.cosmetic-card[data-gear-id]')).toHaveCount(0);
  await expect(page.locator('.cosmetic-card[data-companion-id="dragon-queen"]')).toHaveCount(0);
  await expect(page.locator('.cosmetic-locked-card[data-companion-id="dragon-queen"]')).toHaveCount(1);
  await expect(page.locator('.cosmetic-locked-card[data-companion-id="warrior"]')).toHaveCount(0);
  await expect.poll(()=>page.locator('.cosmetic-card').evaluateAll(elements=>elements.map(element=>element.getAttribute('data-rarity')))).toEqual(['epic','rare','common']);
  const filters=page.getByRole('navigation',{name:'Filtrar aspectos por ranura',exact:true});
  await filters.getByRole('button',{name:'Torso',exact:true}).click();
  await expect(page.locator('.cosmetic-card')).toHaveCount(0);
  await filters.getByRole('button',{name:'Todos',exact:true}).click();
  await expect(page.locator('.cosmetic-card')).toHaveCount(3);
  const permanent=page.locator('.cosmetic-card[data-companion-id="warrior"]');
  await permanent.getByRole('button',{name:'Equipar compañera',exact:true}).click();
  await expect(slot.locator('.companion-sprite')).toHaveAttribute('data-companion-id','warrior');
  await expect(page.locator('.wardrobe-stage .character-party .companion-sprite')).toHaveAttribute('data-companion-id','warrior');
  await expect.poll(async()=>(await stored(page)).game?.equippedCompanionId).toBe('warrior');
  await page.locator('.collection-subtabs').getByRole('button',{name:'Inventario',exact:true}).click();
  await expect(card(page,'companion','warrior')).toHaveCount(0);
  await expect(card(page,'companion','dragon-queen')).toHaveCount(0);
  await page.reload();await collection(page);
  await page.getByRole('button',{name:'Guardar apertura para después',exact:true}).click();
  await slot.getByRole('button',{name:'Ver aspectos de Compañera',exact:true}).click();
  await expect(permanent.getByRole('button',{name:'Quitar compañera',exact:true})).toHaveAttribute('aria-pressed','true');
  const saved=(await stored(page)).game!;
  expect(saved.inventory).toEqual(game.inventory);expect(saved.transactions).toEqual(game.transactions);
  expect(saved.pendingOpening).toEqual(game.pendingOpening);
});

test('locked aspects show grayscale gear and companion artwork without equip actions and follow slot filters',async({page},info)=>{
  const date=new Date().toISOString();
  const game=owned([item('gear','purple-tank',date),item('companion','athlete',date)]);
  await seed(page,game);await collection(page);
  await page.locator('.collection-subtabs').getByRole('button',{name:'Aspectos',exact:true}).click();
  const locked=page.getByRole('region',{name:'Aspectos sin desbloquear',exact:true});
  const cards=locked.locator('.cosmetic-locked-card');
  const expected=GEAR.length+COMPANIONS.length-2;
  await expect(cards).toHaveCount(expected);
  await expect(page.locator('.cosmetic-card')).toHaveCount(2);
  await expect(page.locator('.wardrobe-looks details')).toHaveCount(0);
  await expect(cards.locator('.cosmetic-locked-badge')).toHaveText(Array(expected).fill('Sin desbloquear'));
  await expect(locked.locator('button,[role="button"],input,select')).toHaveCount(0);
  await expect(cards.locator('.is-equipped')).toHaveCount(0);
  await expect(locked.locator('[data-gear-id="purple-tank"],[data-companion-id="athlete"]')).toHaveCount(0);
  const artwork=cards.locator('.cosmetic-locked-art>[role="img"]');
  await expect(artwork).toHaveCount(expected);
  for(const style of await artwork.evaluateAll(elements=>elements.map(element=>({filter:getComputedStyle(element).filter,background:getComputedStyle(element).backgroundImage})))){
    expect(style.filter).toContain('grayscale(1)');
    expect(style.background).toMatch(/grind-(gear|companions)/);
  }
  const ranks=await cards.evaluateAll(elements=>elements.map(element=>({common:0,rare:1,epic:2,legendary:3}[element.getAttribute('data-rarity') as 'common'|'rare'|'epic'|'legendary'])));
  expect(ranks).toEqual([...ranks].sort((left,right)=>right-left));
  const filters=page.getByRole('navigation',{name:'Filtrar aspectos por ranura',exact:true});
  for(const [slot,label] of [['head','Cabeza'],['top','Torso'],['bottom','Piernas'],['hand','Manos'],['back','Espalda'],['companion','Compañera']]){
    await filters.getByRole('button',{name:label,exact:true}).click();
    const count=slot==='companion'?COMPANIONS.length-1:GEAR.filter(gear=>gear.slot===slot&&gear.id!=='purple-tank').length;
    await expect(cards).toHaveCount(count);
    await expect.poll(()=>cards.evaluateAll(elements=>elements.map(element=>element.getAttribute('data-slot')))).toEqual(Array(count).fill(slot));
    await expect(locked.locator('button,[role="button"]')).toHaveCount(0);
  }
  for(const width of [320,1440]){
    await page.setViewportSize({width,height:1000});
    await locked.screenshot({path:info.outputPath(`locked-companion-aspects-${width}.png`),animations:'disabled'});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width+1);
  }
  await filters.getByRole('button',{name:'Todos',exact:true}).click();
  await expect(cards).toHaveCount(expected);
  expect((await stored(page)).game?.inventory).toEqual(game.inventory);
  expect((await stored(page)).game?.transactions).toEqual(game.transactions);
});

test('each purchasable chest displays its own loaded illustration',async({page},info)=>{
  await seed(page,owned([]));await collection(page);
  await page.getByRole('tab',{name:'Cofres',exact:true}).click();
  const cards=page.locator('.arcade-crates .arcade-crate');
  await expect(cards).toHaveCount(3);
  const sources=['/assets/grind-chest-iron.png','/assets/grind-chest-energy.png','/assets/grind-chest-legend.png'];
  for(let index=0;index<sources.length;index++){
    const art=cards.nth(index).locator('.crate-art img');
    await expect(art).toHaveCount(1);
    await expect(art).toHaveAttribute('src',sources[index]);
    await expect.poll(()=>art.evaluate(image=>image instanceof HTMLImageElement&&image.complete&&image.naturalWidth>0)).toBe(true);
  }
  for(const width of [390,1440]){
    await page.setViewportSize({width,height:1000});
    await page.locator('.arcade-crates').screenshot({path:info.outputPath(`illustrated-chests-${width}.png`),animations:'disabled'});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width+1);
  }
});
