import { test, expect, type Page } from '@playwright/test';
import { newWorkout, COLORS, type AppData } from '../src/lib/model';
import { GEAR } from '../src/lib/gear';
import { COMPANIONS } from '../src/lib/companions';
import { CATALOG } from '../src/lib/catalog';
import { normalizeGame, isGameState, getAbilityCharges } from '../src/lib/game';
import { todayMadrid, addDays } from '../src/lib/dates';
import { settings } from './account-navigation';

const empty = (): AppData => ({routines:[],workouts:[],customExercises:[],game:normalizeGame(),preferences:{effects:false,sound:false}});
function populated(): AppData {
  const data=empty();
  data.routines=[{id:crypto.randomUUID(),name:'Tren superior',color:COLORS[3],archived:false,exercises:[{id:crypto.randomUUID(),exerciseId:'press-banca-barra',sets:3,repsMin:8,repsMax:12,targetWeight:50,restSeconds:90}]}];
  data.workouts=Array.from({length:6},(_,i)=>{
    const w=newWorkout(data.routines[0],CATALOG);
    return {...w,date:addDays(todayMadrid(),-i),name:`Fuerza · ${i+1}`,status:'finished' as const,exercises:w.exercises.map(ex=>({...ex,sets:ex.sets.map(set=>({...set,weight:50+i,reps:8,confirmed:true}))}))};
  });
  return data;
}
async function boot(page:Page,data:AppData=empty()) {
  await page.addInitScript(()=>{sessionStorage.setItem('grind-intro-v1','1');sessionStorage.setItem('cheesit-access-mode','guest');});
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.goto('/manifest.webmanifest');
  await page.evaluate(value=>new Promise<void>((resolve,reject)=>{
    const r=indexedDB.open('cheesit-guest',1);
    r.onupgradeneeded=()=>r.result.createObjectStore('state');
    r.onsuccess=()=>{const db=r.result,tx=db.transaction('state','readwrite');tx.objectStore('state').put(value,'local');tx.objectStore('state').put(0,'local-revision');tx.oncomplete=()=>{db.close();resolve()};tx.onerror=()=>reject(tx.error)};
    r.onerror=()=>reject(r.error);
  }),data);
  await page.goto('/');
  await expect(page.getByRole('heading',{name:'Resumen',exact:true})).toBeVisible();
}
const nav=(page:Page,name:string)=>page.getByRole('navigation',{name:'Navegación principal'}).getByRole('button',{name,exact:true});
async function fits(page:Page) { expect(await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth)).toBeLessThanOrEqual(1); }

test('weekly countdown updates through Monday reset and fits mobile and desktop', async ({page}, info) => {
  await page.clock.install({time: new Date('2026-11-08T22:58:30Z')});
  await boot(page);
  await nav(page, 'Arcade').click();
  await page.locator('.arcade-goal-tile').click();
  const countdown = page.getByRole('timer');
  await expect(countdown).toContainText('0 d · 00 h · 02 min');
  await expect(page.getByLabel('Días de entreno por semana', {exact: true})).toHaveCount(0);
  await page.clock.fastForward(60_000);
  await expect(countdown).toContainText('0 d · 00 h · 01 min');
  await page.clock.fastForward(30_000);
  await expect(countdown).toContainText('7 d · 00 h · 00 min');
  await page.getByRole('button', {name: 'Pendientes', exact: true}).click();
  await expect(countdown).toHaveCount(1);
  for (const width of [320, 1440]) {
    await page.setViewportSize({width, height: 900});
    await fits(page);
    await countdown.scrollIntoViewIfNeeded();
    await page.screenshot({path: info.outputPath(`weekly-countdown-${width}.png`), animations: 'disabled'});
  }
});

async function addBench(page:Page) {
  await page.getByRole('button',{name:/Añadir ejercicio/,exact:false}).click();
  const picker=page.getByRole('dialog',{name:'Añadir ejercicio',exact:true});
  await picker.getByLabel('Buscar ejercicio',{exact:true}).fill('banca');
  await picker.getByRole('button',{name:/Press de banca con barra Pecho/}).click();
}

test('guest access is explicit, survives reload in the tab and never sends account writes',async({page})=>{
  const external:string[]=[];
  page.on('request',request=>{if(request.method()!=='GET'&&!new URL(request.url()).hostname.match(/^(127\.0\.0\.1|localhost)$/))external.push(request.url())});
  await page.goto('/');await expect(page.getByRole('heading',{name:'Tu entrenamiento. A tu ritmo.'})).toBeVisible();
  await page.getByRole('button',{name:'Continuar como invitado'}).click();await expect(page.getByRole('heading',{name:'Resumen',exact:true})).toBeVisible();
  await page.reload();await expect(page.getByRole('heading',{name:'Resumen',exact:true})).toBeVisible();
  await settings(page);await page.getByRole('button',{name:'Ir a iniciar sesión'}).click();await expect(page.getByRole('button',{name:'Continuar como invitado'})).toBeVisible();
  expect(external).toEqual([]);
});

test('create routine, start, validate, confirm, rest, recover, finish, history and progress',async({page})=>{
  test.setTimeout(90000);await boot(page);
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await nav(page,'Rutinas').click();await page.getByRole('button',{name:'＋ Crear rutina',exact:true}).click();
  await page.getByLabel('Nombre de la rutina',{exact:true}).fill('Fuerza de prueba');
  await addBench(page);await page.getByLabel('Series previstas',{exact:true}).fill('1');
  await page.getByRole('button',{name:'Guardar rutina',exact:true}).click();
  await page.getByRole('button',{name:'Entrenar Fuerza de prueba',exact:true}).click();
  await expect(page.getByLabel('Rutina',{exact:true})).not.toHaveValue('');
  await page.getByRole('main').getByRole('button',{name:'Empezar entrenamiento',exact:true}).click();
  await page.getByRole('button',{name:'Finalizar entrenamiento',exact:true}).click();
  await expect(page.getByRole('alert').filter({hasText:'Confirma al menos una serie'})).toBeVisible();
  await page.getByLabel('Carga en kg, serie 1 de Press de banca con barra').fill('50');
  await page.getByLabel('Repeticiones, serie 1 de Press de banca con barra').fill('8');
  await page.getByRole('button',{name:'Confirmar serie 1',exact:true}).click();
  await expect(page.getByRole('button',{name:'Realizada 1',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Iniciar descanso',exact:true}).click();
  await expect(page.getByRole('button',{name:'Pausar',exact:true})).toBeVisible();
  await page.reload();await expect(page.getByRole('button',{name:'Realizada 1',exact:true})).toBeVisible();
  await expect(page.getByLabel('Carga en kg, serie 1 de Press de banca con barra')).toHaveValue('50');
  await nav(page,'Resumen').click();await page.getByRole('button',{name:'Continuar entrenamiento',exact:true}).click();
  await page.getByRole('button',{name:'Finalizar entrenamiento',exact:true}).click();
  const celebration=page.getByRole('dialog',{name:'SESIÓN COMPLETADA.'});await expect(celebration).toBeVisible();
  await page.getByRole('button',{name:'Continuar',exact:true}).click();
  await expect(page.locator('.stat-card').filter({hasText:'Series'}).locator('strong')).toHaveText('1');
  await nav(page,'Calendario').click();await page.getByRole('button',{name:'Fuerza de prueba 1 ejercicios · 1 series'}).click();
  await expect(page.getByText('50 kg × 8 reps',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Repetir sesión',exact:true}).click();await expect(page.getByLabel('Carga en kg, serie 1 de Press de banca con barra')).toHaveValue('50');
  await nav(page,'Progreso').click();await page.getByLabel('Buscar progreso por ejercicio').fill('banca');await page.locator('.progress-search-list').getByRole('button',{name:/Press de banca con barra/}).click();
  await expect(page.locator('.progress-table tbody tr')).toHaveCount(1);expect(errors).toEqual([]);
});

for(const width of [320,390,768,1440]) {
  test(`all destinations and Arcade tabs reflow at ${width}px`,async({page},info)=>{
    test.setTimeout(90000);await page.setViewportSize({width,height:900});await boot(page,populated());
    const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
    await fits(page);await expect(nav(page,'Progreso')).toBeVisible();
    if(width<=390){await expect(page.locator('.topbar .mobile-train')).toBeVisible();const brand=await page.locator('.brand').boundingBox(),actions=await page.locator('.topbar-actions').boundingBox();expect(brand!.x+brand!.width).toBeLessThanOrEqual(actions!.x);}
    if(process.env.PLAYWRIGHT_PRODUCTION==='1')await expect(page.locator('.offline-shell')).toContainText('Disponible sin conexión',{timeout:30000});
    if(width<=390) {const box=await page.getByRole('button',{name:'Empezar entrenamiento',exact:true}).first().boundingBox();expect(box!.y+box!.height).toBeLessThan(800);}
    await page.screenshot({path:info.outputPath(`summary-${width}.png`),fullPage:true,animations:'disabled'});
    await page.screenshot({path:info.outputPath(`summary-${width}-viewport.png`),animations:'disabled'});
    for(const destination of ['Calendario','Rutinas','Progreso','Arcade']) {await nav(page,destination).click();await fits(page);}
    await expect(page.getByRole('region',{name:'Inicio de Arcade'})).toBeVisible();
    await page.screenshot({path:info.outputPath(`arcade-${width}.png`),fullPage:true,animations:'disabled'});
    await page.screenshot({path:info.outputPath(`arcade-${width}-viewport.png`),animations:'disabled'});
    await page.locator('.arcade-goal-tile').click();
    for(const tab of ['Objetivos','Cuerpo','Cofres','Colección','Ascenso']) {
      await page.getByRole('tab',{name:tab,exact:true}).click();await fits(page);
      await expect(page.getByRole('tabpanel',{name:tab,exact:true})).toBeVisible();
      if(tab==='Colección'||tab==='Cofres')await page.screenshot({path:info.outputPath(`${tab}-${width}.png`),fullPage:true,animations:'disabled'});
    }
    await settings(page);await fits(page);await page.getByRole('button',{name:'Gestionar ejercicios y fichas →',exact:true}).click();await fits(page);
    await page.getByLabel('Menú de perfil',{exact:true}).click();await page.locator('.profile-nav-options').getByRole('button',{name:'Mi perfil',exact:true}).click();await fits(page);
    await nav(page,'Rutinas').click();await page.locator('.routine-main').click();await fits(page);await page.screenshot({path:info.outputPath(`routine-${width}.png`),fullPage:true,animations:'disabled'});
    await page.getByRole('button',{name:'Volver',exact:true}).click();await page.getByRole('button',{name:'Entrenar Tren superior',exact:true}).click();await page.getByRole('main').getByRole('button',{name:'Empezar entrenamiento',exact:true}).click();await fits(page);
    await page.screenshot({path:info.outputPath(`session-${width}.png`),fullPage:true,animations:'disabled'});expect(errors).toEqual([]);
  });
}

test('keyboard skip, form submission and unsaved routine focus trap work',async({page})=>{
  await boot(page);await page.keyboard.press('Tab');await expect(page.getByRole('link',{name:'Saltar al contenido'})).toBeFocused();
  await page.keyboard.press('Enter');await expect(page.getByRole('main')).toBeFocused();await expect(page).toHaveURL(/view=summary/);
  await page.getByRole('main').getByRole('button',{name:'Empezar entrenamiento',exact:true}).click();await page.getByLabel('Nombre',{exact:true}).fill('Por teclado');await page.getByLabel('Nombre',{exact:true}).press('Enter');
  await expect(page.getByRole('heading',{name:'Entrenamiento',exact:true})).toBeVisible();
  await nav(page,'Rutinas').click();await page.getByRole('button',{name:'＋ Crear rutina',exact:true}).click();await page.getByLabel('Nombre de la rutina').fill('Pendiente');await nav(page,'Resumen').click();
  const modal=page.getByRole('dialog',{name:'Cambios pendientes',exact:true});await expect(modal).toBeVisible();
  await modal.getByRole('button',{name:'Seguir editando',exact:true}).focus();await page.keyboard.press('Tab');await expect(modal.getByRole('button',{name:'Cerrar',exact:true})).toBeFocused();
  await page.keyboard.press('Escape');await expect(modal).toHaveCount(0);
});

test('library filters recover, custom exercise saves, preferences and backup survive reload',async({page})=>{
  await boot(page,populated());await settings(page);await page.getByRole('switch',{name:'Sonido de victoria'}).click();await expect(page.getByRole('switch',{name:'Sonido de victoria'})).toBeChecked();
  await page.getByRole('button',{name:'Gestionar ejercicios y fichas →'}).click();await page.getByLabel('Buscar ejercicio',{exact:true}).fill('no-existe-xyz');await expect(page.getByRole('heading',{name:'Sin resultados'})).toBeVisible();
  await page.getByRole('button',{name:'Limpiar búsqueda y filtros'}).click();await expect(page.getByRole('button',{name:'Ficha técnica press-banca-barra'})).toBeVisible();
  await page.getByRole('button',{name:'Crear ejercicio propio',exact:true}).click();await page.getByLabel('Nombre del ejercicio',{exact:true}).fill('Remo de prueba');await page.getByRole('group',{name:'Músculos principales',exact:true}).getByLabel('Espalda',{exact:true}).check();
  await page.getByRole('button',{name:'Guardar ejercicio',exact:true}).click();await page.getByLabel('Buscar ejercicio',{exact:true}).fill('Remo de prueba');await expect(page.locator('.catalog-entry')).toHaveCount(1);
  await settings(page);const download=page.waitForEvent('download');await page.getByRole('button',{name:/Exportar datos/}).click();const file=await download;const path=await file.path();expect(path).toBeTruthy();
  await page.getByRole('button',{name:/Importar datos/}).click();await page.locator('input[type=file][accept="application/json,.json"]').setInputFiles(path!);
  const modal=page.getByRole('dialog',{name:'Revisar importación'});await expect(modal).toBeVisible();await modal.getByRole('button',{name:'Confirmar importación'}).click();await expect(modal).toHaveCount(0);
  await page.reload();await expect(page.getByRole('switch',{name:'Sonido de victoria'})).toBeChecked();
  await page.getByRole('button',{name:'Gestionar ejercicios y fichas →'}).click();await page.getByLabel('Buscar ejercicio',{exact:true}).fill('Remo de prueba');await expect(page.locator('.catalog-entry')).toHaveCount(1);
});

test('Arcade tabs restore through browser history, crate reveal persists and collection stays usable',async({page})=>{
  await boot(page,populated());await nav(page,'Arcade').click();await page.locator('.arcade-body-tile').click();await expect(page).toHaveURL(/tab=body/);
  await page.getByRole('tab',{name:'Cofres',exact:true}).click();await expect(page).toHaveURL(/tab=crates/);await page.goBack();await expect(page.getByRole('tab',{name:'Cuerpo',exact:true})).toHaveAttribute('aria-selected','true');
  await page.getByRole('tab',{name:'Cofres',exact:true}).click();await page.locator('.arcade-crate').first().getByRole('button',{name:/Abrir cofre/}).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.screenshot({path:test.info().outputPath('crate-reveal.png'),fullPage:true,animations:'disabled'});
  await page.getByRole('button',{name:'Guardar en colección',exact:true}).click();
  await page.getByRole('tab',{name:'Colección',exact:true}).click();
  await expect(page.locator('.loot-item-card')).toHaveCount(1);
  await page.reload();await expect(page.getByRole('tab',{name:'Colección',exact:true})).toHaveAttribute('aria-selected','true');
  await expect(page.locator('.loot-item-card')).toHaveCount(1);

});

test('routines can still duplicate, archive and restore',async({page})=>{
  await boot(page,populated());await nav(page,'Rutinas').click();await page.getByRole('button',{name:'Duplicar Tren superior',exact:true}).click();
  await page.getByRole('button',{name:'Guardar rutina',exact:true}).click();await expect(page.locator('.routine-card')).toHaveCount(2);
  page.once('dialog',dialog=>dialog.accept());await page.getByRole('button',{name:'Archivar Tren superior',exact:true}).click();
  await expect(page.locator('.routine-card')).toHaveCount(1);await page.getByRole('button',{name:'Restaurar',exact:true}).click();await expect(page.locator('.routine-card')).toHaveCount(2);
});

test('verified offline shell opens the guest draft without a network connection',async({page,context})=>{
  test.skip(process.env.PLAYWRIGHT_PRODUCTION!=='1','Requires a compiled local preview');test.setTimeout(60000);
  await boot(page);await page.getByRole('main').getByRole('button',{name:'Empezar entrenamiento',exact:true}).click();await page.getByRole('main').getByRole('button',{name:'Empezar entrenamiento',exact:true}).click();await addBench(page);
  await page.getByLabel('Carga en kg, serie 1 de Press de banca con barra').fill('42.5');await page.getByLabel('Repeticiones, serie 1 de Press de banca con barra').fill('10');
  await expect(page.locator('.offline-shell')).toContainText('Disponible sin conexión',{timeout:30000});
  await context.setOffline(true);await page.reload();await expect(page.getByLabel('Carga en kg, serie 1 de Press de banca con barra')).toHaveValue('42.5');await expect(page.getByLabel('Repeticiones, serie 1 de Press de banca con barra')).toHaveValue('10');
  await nav(page,'Resumen').click();await expect(page.getByRole('button',{name:'Continuar entrenamiento',exact:true})).toBeVisible();await context.setOffline(false);
});


test('Arcade home routes to task-specific collection spaces and restores their URLs',async({page})=>{
  await boot(page,populated());await nav(page,'Arcade').click();
  await expect(page).toHaveURL(/tab=overview/);await expect(page.locator('.arcade-tabs')).toBeHidden();
  await page.getByRole('button',{name:'Personalizar personaje',exact:true}).click();
  await expect(page).toHaveURL(/tab=looks/);await expect(page.locator('.wardrobe-stage')).toBeVisible();
  await expect(page.getByRole('button',{name:'Aspectos',exact:true})).toHaveAttribute('aria-pressed','true');
  await page.getByRole('button',{name:'Inventario',exact:true}).click();
  await expect(page).toHaveURL(/tab=collection/);await expect(page.locator('.wardrobe-stage')).toHaveCount(0);
  await page.getByRole('button',{name:'Inicio de Arcade',exact:true}).click();await page.locator('.arcade-ability-tile').click();
  await expect(page).toHaveURL(/tab=abilities/);await expect(page.getByRole('button',{name:'Habilidades',exact:true})).toHaveAttribute('aria-pressed','true');
  await page.reload();await expect(page.getByRole('button',{name:'Habilidades',exact:true})).toHaveAttribute('aria-pressed','true');
  await expect(page.locator('.wardrobe-stage')).toHaveCount(0);
});

test('muscle selection changes the visible anatomical view without changing activity',async({page})=>{
  await boot(page,populated());await nav(page,'Arcade').click();await page.locator('.arcade-body-tile').click();
  await expect(page.locator('.body-map-card')).toHaveAttribute('data-side','front');
  await page.getByRole('button',{name:'Espalda',exact:true}).click();
  await expect(page.locator('.body-map-card')).toHaveAttribute('data-side','back');
  await expect(page.getByRole('img',{name:'Mapa muscular posterior'})).toBeVisible();
  await expect(page.getByRole('img',{name:'Mapa muscular anterior'})).toBeHidden();
  await page.locator('.muscle-list').getByRole('button',{name:/Pecho/}).click();
  await expect(page.locator('.body-map-card')).toHaveAttribute('data-side','front');
  await expect(page.locator('.body-detail>h3')).toHaveText('Pecho');
});


test('empty Arcade explains the next reward and never offers unavailable free chests',async({page})=>{
  await boot(page);await nav(page,'Arcade').click();
  await expect(page.locator('.reward-tile-copy')).toContainText('Sube al nivel 2');
  await expect(page.locator('.arcade-reward-tile')).not.toContainText('<br/>');
  await expect(page.getByRole('button',{name:'Abrir gratis',exact:true})).toHaveCount(0);
  await expect(page.locator('.collection-tile-copy')).toContainText('0 aspectos');
});

test('inventory, cosmetic equipment, cheesit and active ability remain separate and persist',async({page},info)=>{
  test.setTimeout(60000);const data=populated(),stamp=new Date().toISOString();
  const inventory=[...['purple-tank','lime-shorts'].map(gearId=>({id:crypto.randomUUID(),kind:'gear' as const,gearId,rarity:GEAR.find(g=>g.id===gearId)!.rarity,crateId:'starter',acquiredAt:stamp,sold:false})),{id:crypto.randomUUID(),kind:'companion' as const,companionId:'athlete',rarity:COMPANIONS.find(c=>c.id==='athlete')!.rarity,crateId:'starter',acquiredAt:stamp,sold:false}];
  data.game={...normalizeGame(),inventory,transactions:inventory.map(item=>({id:crypto.randomUUID(),kind:'crate' as const,itemId:item.id,amount:-100,createdAt:stamp}))};expect(isGameState(data.game)).toBe(true);
  await boot(page,data);await nav(page,'Arcade').click();await page.locator('.arcade-collection-tile').click();
  await expect(page.locator('.wardrobe-stage')).toHaveCount(0);await expect(page.locator('.loot-item-card')).toHaveCount(3);
  const gear=page.locator('.loot-item-card[data-definition-id="purple-tank"]');
  await gear.getByRole('button',{name:'Usar aspecto',exact:true}).click();
  await page.locator('.loot-item-card[data-definition-id="athlete"]').getByRole('button',{name:'Equipar cheesit',exact:true}).click();
  await gear.getByRole('button',{name:'Preparar habilidad',exact:true}).click();
  await page.getByRole('button',{name:'Habilidades',exact:true}).click();
  await expect(page.locator('.ability-card[data-ability-id="purple-tank"]').getByRole('button',{name:'Desactivar',exact:true})).toBeVisible();
  await page.screenshot({path:info.outputPath('abilities-owned.png'),fullPage:true,animations:'disabled'});
  await page.getByRole('button',{name:'Aspectos',exact:true}).click();
  await expect(page.locator('.wardrobe-stage .character-equipped[data-gear-id="purple-tank"]')).toBeVisible();
  await expect(page.locator('.wardrobe-slot-companion')).toContainText('Equipado');
  await page.screenshot({path:info.outputPath('character-owned.png'),fullPage:false,animations:'disabled'});
  await page.getByRole('button',{name:'Inicio de Arcade',exact:true}).click();await expect(page.getByRole('heading',{name:'Zona arcade',exact:true})).toBeFocused();
  for(const width of [320,390]){await page.setViewportSize({width,height:900});const companion=await page.locator('.arcade-player-art .character-companion').boundingBox(),hero=await page.locator('.arcade-player').boundingBox();expect(companion!.x+companion!.width).toBeLessThanOrEqual(hero!.x+hero!.width);await fits(page);}
  await page.screenshot({path:info.outputPath('arcade-owned.png'),fullPage:true,animations:'disabled'});
  await page.reload();await expect(page.locator('.arcade-ability-tile')).toContainText('1 carga');
  await page.locator('.topbar .mobile-train').click();await page.getByLabel('Rutina',{exact:true}).selectOption({label:'Tren superior'});await page.getByRole('main').getByRole('button',{name:'Empezar entrenamiento',exact:true}).click();
  await expect(page.getByRole('complementary',{name:'Habilidad de esta sesión'})).toBeVisible();await expect(page.locator('.session-cheesit-passive')).toContainText('Pasiva fijada');
  await page.getByLabel('Repeticiones, serie 1 de Press de banca con barra').fill('8');await page.getByRole('button',{name:'Confirmar serie 1',exact:true}).click();
  page.once('dialog',dialog=>dialog.accept());await page.getByRole('button',{name:'Finalizar entrenamiento',exact:true}).click();await page.getByRole('button',{name:'Continuar',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>new Promise<number>(resolve=>{const r=indexedDB.open('cheesit-guest',1);r.onsuccess=()=>{const db=r.result,tx=db.transaction('state'),q=tx.objectStore('state').get('local');tx.oncomplete=()=>{resolve(q.result.game.abilityUses.length);db.close()}}}))).toBe(1);
});
