import { test, expect, type Page } from '@playwright/test';
import { accountsHarness } from './accounts-harness';
import { CATALOG } from '../src/lib/catalog';
import { emptyData, newWorkout, newSet, exerciseSnapshot, type AppData, type Workout } from '../src/lib/model';
import { gameProgress, normalizeGame } from '../src/lib/game';

test.skip(process.env.CHEESIT_ACCOUNTS_FIXTURE !== '1', 'Requires isolated Auth/Postgres account fixture.');
let harness: Awaited<ReturnType<typeof accountsHarness>>;
test.beforeAll(async () => { harness = await accountsHarness(); });
test.afterAll(async () => { await harness?.close(); });
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem('grind-intro-v1', '1'));
  await page.emulateMedia({ reducedMotion: 'reduce' });
});
async function login(page: Page, email: string) {
  await page.goto('/'); await page.getByLabel('Correo electrónico').fill(email);
  await page.getByLabel('Contraseña', { exact: true }).fill('test-password-123');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Resumen', exact: true })).toBeVisible();
}
async function own(page: Page) {
  await page.getByLabel('Menú de perfil', { exact: true }).click();
  await page.getByRole('button', { name: 'Mi perfil', exact: true }).click();
}
async function search(page: Page, handle: string) {
  await page.getByLabel('Menú de perfil', { exact: true }).click();
  await page.getByRole('button', { name: 'Buscar personas', exact: true }).click();
  await page.getByLabel('Nombre de usuario', { exact: true }).fill(handle);
  await page.locator('.social-person').click();
}
function session(name: string, date: string): Workout {
  return { ...newWorkout(), name, date, status: 'finished', notes: 'Notas de la sesión.', startedAt: '2026-11-03T09:00:00Z', finishedAt: '2026-11-03T10:00:00Z', exercises: [CATALOG.find(e=>e.group==='Pecho')!,CATALOG.find(e=>e.group==='Tríceps')!].map(e=>({id:crypto.randomUUID(),...exerciseSnapshot(e),notes:'Controla la bajada.',restSeconds:90,sets:[{...newSet(),weight:40,reps:10,confirmed:true,rpe:8,rir:2}]})) };
}

test('two authenticated accounts: shared profile, compact counts, notifications, direct details and persistent read state', async ({page,browser}) => {
  test.setTimeout(120000);
  const workouts = Array.from({length:8},(_,i)=>session(`Sesión ${i+1}`,`2026-10-${String(i+1).padStart(2,'0')}`));
  const draft={...session('Pecho y tríceps','2026-11-03'),status:'draft' as const,finishedAt:undefined};
  const data:AppData={...emptyData(),workouts:[...workouts,draft],personalProfile:{displayName:'Pedro Cheesit',photo:null,bio:'Cada rep cuenta.'}};
  const author=await harness.seed('activity-pedro@example.test',undefined,data);
  await harness.seed('activity-ana@example.test',undefined,{...emptyData(),personalProfile:{displayName:'Ana Cheesit',photo:null,bio:''}});
  const handle=(await harness.social('activity-pedro@example.test')).username;
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await login(page,'activity-ana@example.test'); await search(page,handle);
  await expect(page.getByText('Actividad privada.',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Seguir',exact:true}).click();
  await expect(page.getByRole('button',{name:'1 Seguidores',exact:true})).toBeVisible();
  const authorContext=await browser.newContext({viewport:{width:1440,height:960}});const second=await authorContext.newPage();second.on('pageerror',e=>errors.push(e.message));
  try {
    await second.addInitScript(()=>sessionStorage.setItem('grind-intro-v1','1'));
    await login(second,'activity-pedro@example.test');
    await expect(second.getByLabel('Notificaciones, 1 sin leer',{exact:true})).toBeVisible();
    await second.getByLabel('Notificaciones, 1 sin leer',{exact:true}).click();
    await expect(second.locator('.notification-item')).toContainText('Ana Cheesit ha empezado a seguirte.');
    await second.locator('.notification-item').click();
    await expect(second.getByRole('heading',{name:'Ana Cheesit',exact:true})).toBeVisible();
    await second.getByRole('button',{name:'Volver',exact:true}).click();
    await expect(second.getByRole('heading',{name:'Notificaciones',exact:true})).toBeVisible();
    await expect(second.locator('.notification-unread')).toHaveCount(0);
    await own(second);await second.getByRole('switch',{name:'Compartir actividad',exact:true}).click();
    await expect(second.getByRole('switch',{name:'Compartir actividad',exact:true})).toHaveAttribute('aria-checked','true');
    await page.reload();
    await expect(page.locator('.profile-workout')).toHaveCount(8);
    await expect(page.locator('.profile-workout').first()).toContainText('Sesión 8');
    const expected=gameProgress(normalizeGame(data.game),data.workouts,{weightKg:70,heightCm:180,age:20,sex:'male',dumbbellLoad:'per_hand'});
    await expect(page.locator('.profile-stats dd')).toHaveText(['8','16',String(expected.level)]);
    await expect(page.locator('.profile-xp')).toContainText(expected.xp.toLocaleString('es-ES'));
    for(const width of [320,390,768,1440]) {
      await page.setViewportSize({width,height:950});
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
      expect((await page.locator('.social-counts').boundingBox())!.height).toBeLessThanOrEqual(44);
      const brand=await page.locator('.brand').boundingBox(),actions=await page.locator('.topbar-actions').boundingBox();
      expect(actions!.x).toBeGreaterThanOrEqual(brand!.x+brand!.width);
      await page.screenshot({path:`artifacts/social-activity/profile-${width}.png`,fullPage:true});
    }
    await page.locator('.profile-workout').first().click();
    await expect(page.locator('.detail-hero h2')).toHaveText('Sesión 8');
    await expect(page.locator('.history-sets')).toContainText(['40 kg × 10 reps · RPE 8 · RIR 2','40 kg × 10 reps · RPE 8 · RIR 2']);
    await expect(page.getByRole('button',{name:'Editar entrenamiento',exact:true})).toHaveCount(0);
    await expect(page.getByRole('button',{name:'Eliminar entrenamiento',exact:true})).toHaveCount(0);
    await page.reload();await expect(page.locator('.detail-hero h2')).toHaveText('Sesión 8');
    await page.getByRole('button',{name:'Volver',exact:true}).click();
    await expect(page.getByRole('heading',{name:'Pedro Cheesit',exact:true})).toBeVisible();
    await page.getByRole('button',{name:'1 Seguidores',exact:true}).click();await expect(page.locator('.social-person')).toContainText('Ana Cheesit');
    await page.goBack();await expect(page.getByRole('heading',{name:'Pedro Cheesit',exact:true})).toBeVisible();
    // Finish through the actual session editor and existing account synchronization.
    await second.goto(`/#view=editor&id=${draft.id}`);
    await expect(second.getByRole('button',{name:/Finalizar entrenamiento|Terminar sesión/})).toBeVisible();
    await second.getByRole('button',{name:/Finalizar entrenamiento|Terminar sesión/}).click();
    await expect(second.getByRole('heading',{name:'Resumen',exact:true})).toBeVisible();
    await expect.poll(async()=>((await harness.account('activity-pedro@example.test')).data as AppData).workouts.find(w=>w.id===draft.id)?.status).toBe('finished');
    await page.getByRole('button',{name:/^Notificaciones/}).click();
    await expect(page.locator('.notification-item')).toContainText('Pedro Cheesit ha publicado un entrenamiento de pecho y tríceps.');
    await expect(page.locator('.notification-unread')).toHaveCount(1);
    await page.screenshot({path:'artifacts/social-activity/notifications.png',fullPage:true});
    await page.locator('.notification-item').click();
    await expect(page.locator('.detail-hero h2')).toHaveText('Pecho y tríceps');
    expect(page.url()).toContain(`workout=${draft.id}`);
    await page.reload();await expect(page.locator('.detail-hero h2')).toHaveText('Pecho y tríceps');
    await page.getByRole('button',{name:'Volver',exact:true}).click();
    await expect(page.getByRole('heading',{name:'Notificaciones',exact:true})).toBeVisible();
    await expect(page.locator('.notification-unread')).toHaveCount(0);
    await page.reload();await expect(page.locator('.notification-read')).toHaveCount(1);
    // A subsequent real save/edit does not produce a second publication.
    const saved=(await harness.account('activity-pedro@example.test')).data as AppData;
    saved.workouts.find(w=>w.id===draft.id)!.name='Sesión corregida';await harness.commit('activity-pedro@example.test',saved);
    await page.reload();await expect(page.locator('.notification-item')).toHaveCount(1);
    await own(second);await second.getByRole('switch',{name:'Compartir actividad',exact:true}).click();
    await expect(second.getByRole('switch',{name:'Compartir actividad',exact:true})).toHaveAttribute('aria-checked','false');
    await page.reload();await expect(page.locator('.notification-item')).toContainText('ya no está disponible');
    await page.locator('.notification-item').click();await expect(page.getByText('Entrenamiento no disponible.',{exact:true})).toBeVisible();
    await expect(page.locator('.history-sets')).toHaveCount(0);
    expect(errors).toEqual([]);expect(author.id).toBeTruthy();
  } finally {await authorContext.close();}
});

test('notifications and shared history recover from errors; mark-all persists and empty/guest states remain usable',async({page,context})=>{
  test.setTimeout(60000);
  const reader=await harness.seed('activity-errors@example.test');
  const first=await harness.seed('activity-first@example.test');
  const second=await harness.seed('activity-second@example.test');
  await login(page,'activity-errors@example.test');await page.getByRole('button',{name:/^Notificaciones/}).click();
  await expect(page.getByText('Todavía no hay notificaciones.',{exact:true})).toBeVisible();
  for(const u of [first,second]) {
    const s=harness.confirm(u.email);
    await page.request.post('http://127.0.0.1:55440/rest/v1/cheesit_follows',{headers:{authorization:`Bearer ${s.access_token}`},data:{follower_id:u.id,followed_id:reader.id}});
  }
  await page.reload();await expect(page.locator('.notification-unread')).toHaveCount(2);
  await page.route('**/rest/v1/rpc/cheesit_mark_notifications',route=>route.fulfill({status:503,json:{message:'unavailable'}}));
  await page.getByRole('button',{name:'Marcar todas como leídas',exact:true}).click();
  await expect(page.locator('.notifications-page [role=alert]')).toContainText('No se ha confirmado');
  await expect(page.locator('.notification-unread')).toHaveCount(2);
  await page.unroute('**/rest/v1/rpc/cheesit_mark_notifications');
  await page.getByRole('button',{name:'Marcar todas como leídas',exact:true}).click();
  await expect(page.locator('.notification-unread')).toHaveCount(0);await page.reload();await expect(page.locator('.notification-read')).toHaveCount(2);
  await page.route('**/rest/v1/rpc/cheesit_read_notifications',route=>route.fulfill({status:503,json:{message:'unavailable'}}));
  await page.reload();await expect(page.locator('.notifications-page [role=alert]')).toContainText('No se han podido cargar');
  await page.unroute('**/rest/v1/rpc/cheesit_read_notifications');await page.getByRole('button',{name:'Reintentar notificaciones',exact:true}).click();
  await expect(page.locator('.notification-read')).toHaveCount(2);
  await context.setOffline(true);await page.getByRole('button',{name:'Notificaciones',exact:true}).click();
  await expect(page.locator('.notifications-page [role=alert]')).toContainText('No se han podido cargar');await context.setOffline(false);
  await expect(page.locator('.notifications-page [role=alert]')).toHaveCount(0);
  await page.locator('.notification-item').first().click();
  await page.route('**/rest/v1/rpc/cheesit_read_activity',route=>route.fulfill({status:503,json:{message:'unavailable'}}));
  await page.reload();await expect(page.locator('.social-activity [role=alert]')).toContainText('No se ha podido cargar la actividad');
  await page.unroute('**/rest/v1/rpc/cheesit_read_activity');await page.getByRole('button',{name:'Reintentar actividad',exact:true}).click();
  await expect(page.getByText('Actividad privada.',{exact:true})).toBeVisible();
});

test('guest notification entry and header training access retain usable navigation',async({page})=>{
  await page.goto('/');await page.getByRole('button',{name:'Continuar como invitado',exact:true}).click();
  await page.getByRole('button',{name:'Notificaciones',exact:true}).click();
  await expect(page.getByText('Tu comunidad, más cerca.',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Ir a mi cuenta',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Modo invitado',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Empezar entrenamiento',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Empezar entrenamiento',exact:true})).toBeVisible();
});
