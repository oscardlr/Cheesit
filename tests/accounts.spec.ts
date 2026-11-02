import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { accountsHarness } from './accounts-harness';
import type { AppData } from '../src/lib/model';

// Start the app with NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:55440 and
// NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_local_fixture.
// This suite uses a local Auth fixture and real PostgreSQL, never production.
test.skip(process.env.CHEESIT_ACCOUNTS_FIXTURE !== '1', 'Requires the isolated local account fixture build; see docs/CUENTAS-Y-SINCRONIZACION.md');
test.describe.configure({ mode: 'serial' });
let harness: Awaited<ReturnType<typeof accountsHarness>>;
test.beforeAll(async () => { harness = await accountsHarness(); });
test.afterAll(async () => { await harness?.close(); });
test.beforeEach(async ({page}) => { page.on('pageerror',error=>console.log('PAGE ERROR',error.message)); page.on('response',async response=>{if(response.url().includes('/rpc/') && response.status()>=400)console.log('RPC ERROR',await response.text())}); await page.addInitScript(() => sessionStorage.setItem('grind-intro-v1','1')); await page.emulateMedia({ reducedMotion:'reduce' }); });
async function login(page: Page, email: string, password = 'test-password-123') {
  await page.goto('/'); await page.getByLabel('Correo electrónico').fill(email); await page.getByLabel('Contraseña',{exact:true}).fill(password); await page.getByRole('button',{name:'Entrar',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Resumen',exact:true})).toBeVisible();
}
async function synced(page:Page) { await expect(page.locator('.account-toolbar')).toContainText('Sincronizado con tu cuenta',{timeout:15000}); }
async function routine(page:Page,name:string) {
  await page.getByRole('navigation').getByRole('button',{name:'Rutinas',exact:true}).click();
  await page.getByRole('button',{name:'＋ Crear rutina'}).click();
  await page.getByLabel('Nombre de la rutina').fill(name); await page.getByRole('button',{name:'Guardar rutina',exact:true}).click();
  await synced(page);
}

test('requires an account, registration confirmation, recovery and persistent session',async({page})=>{
  await page.goto('/'); await expect(page.getByRole('button',{name:'Empezar entrenamiento',exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'Crear cuenta',exact:true}).click();
  await page.getByLabel('Correo electrónico').fill('register@example.test');await page.getByLabel('Contraseña',{exact:true}).fill('test-password-123');await page.getByRole('button',{name:'Crear cuenta',exact:true}).click();
  await expect(page.getByRole('status')).toContainText('correo para confirmar');
  harness.confirm('register@example.test');await page.getByRole('button',{name:'Volver a iniciar sesión'}).click();
  await page.getByRole('button',{name:'Entrar',exact:true}).click();await expect(page.getByRole('heading',{name:'Resumen',exact:true})).toBeVisible();await synced(page);
  await page.reload();await expect(page.getByRole('heading',{name:'Resumen',exact:true})).toBeVisible();
  await page.goto('/'+harness.recovery('register@example.test'));
  await expect(page.getByRole('heading',{name:'Nueva contraseña'})).toBeVisible();await page.getByLabel('Contraseña',{exact:true}).fill('new-password-456');await page.getByRole('button',{name:'Guardar contraseña'}).click();
  await expect(page.getByRole('heading',{name:'Resumen',exact:true})).toBeVisible();
  await page.getByText('Mi cuenta',{exact:true}).click();await page.getByRole('button',{name:'Cerrar sesión',exact:true}).click();
  await page.getByRole('button',{name:'He olvidado mi contraseña'}).click();await page.getByLabel('Correo electrónico').fill('register@example.test');await page.getByRole('button',{name:'Enviar correo'}).click();await expect(page.getByRole('status')).toContainText('recibirás un correo');
  await page.getByRole('button',{name:'Volver a iniciar sesión'}).click();await page.getByLabel('Contraseña',{exact:true}).fill('new-password-456');await page.getByRole('button',{name:'Entrar',exact:true}).click();await expect(page.getByRole('heading',{name:'Resumen',exact:true})).toBeVisible();
});

test('two browser devices retrieve account data and switching accounts hides prior data',async({page,browser})=>{
  await harness.seed('devices@example.test');await harness.seed('other@example.test');
  await login(page,'devices@example.test');await routine(page,'Rutina entre dispositivos');
  const context=await browser.newContext();const other=await context.newPage();await login(other,'devices@example.test');
  await other.getByRole('navigation').getByRole('button',{name:'Rutinas',exact:true}).click();await expect(other.getByRole('button',{name:'Rutina entre dispositivos 0 ejercicios'})).toBeVisible();
  await page.getByText('Mi cuenta',{exact:true}).click();await page.getByRole('button',{name:'Cerrar sesión',exact:true}).click();await login(page,'other@example.test');
  await page.getByRole('navigation').getByRole('button',{name:'Rutinas',exact:true}).click();await expect(page.getByText('Rutina entre dispositivos',{exact:true})).toHaveCount(0);
  await context.close();
});

test('offline training draft persists, reconnect uploads, and pending logout preserves the account queue',async({page,context})=>{
  await harness.seed('offline@example.test');await login(page,'offline@example.test');await synced(page);
  await expect(page.getByText('Disponible sin conexión',{exact:true})).toBeVisible();
  await context.setOffline(true);await page.reload();await expect(page.getByRole('heading',{name:'Resumen',exact:true})).toBeVisible();
  await page.getByRole('navigation').getByRole('button',{name:'Empezar entrenamiento',exact:true}).click();
  await page.getByRole('main').getByRole('button',{name:/Empezar entrenamiento/}).click();
  await page.getByRole('button',{name:'＋ Añadir ejercicio',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:/^Press de banca con barra/}).click();
  await page.getByLabel('Carga en kg, serie 1 de Press de banca con barra').fill('42.5');await page.getByLabel('Repeticiones, serie 1 de Press de banca con barra').fill('8');await page.getByRole('button',{name:'Confirmar serie 1',exact:true}).click();
  await expect(page.locator('.account-toolbar')).toContainText('Pendiente de conexión');
  const close=page.getByRole('button',{name:'Cerrar celebración',exact:true});if(await close.isVisible())await close.click();
  await page.getByRole('button',{name:'Finalizar entrenamiento',exact:true}).click();await page.getByRole('button',{name:'Continuar',exact:true}).click();
  await context.setOffline(false);await page.getByRole('button',{name:'Reintentar sincronización'}).click();await synced(page);
  await page.reload();await expect(page.getByRole('heading',{name:'Resumen',exact:true})).toBeVisible();
  const saved=await harness.account('offline@example.test');expect((saved.data as AppData).workouts[0].exercises[0].sets[0].confirmed).toBe(true);
});

test('legacy data migrates through the interface, preserves the original and reloading cannot duplicate it',async({page})=>{
  await harness.seed('migration@example.test');const raw=JSON.parse(readFileSync('tests/fixtures/legacy-account.json','utf8'));
  await page.goto('/');await page.evaluate(data=>new Promise<void>((resolve,reject)=>{const r=indexedDB.open('entrenos-local',1);r.onupgradeneeded=()=>r.result.createObjectStore('state');r.onsuccess=()=>{const db=r.result,tx=db.transaction('state','readwrite');tx.objectStore('state').put(data,'local');tx.oncomplete=()=>{db.close();resolve()};tx.onerror=()=>reject(tx.error)};}),raw.data);
  await login(page,'migration@example.test');await expect(page.getByRole('heading',{name:'Tu historial anterior sigue aquí'})).toBeVisible();await page.getByRole('button',{name:'Revisar incorporación'}).click();await page.getByRole('button',{name:'Incorporar a mi cuenta'}).click();
  await synced(page);await expect(page.getByRole('heading',{name:'Tu historial anterior sigue aquí'})).toHaveCount(0);
  const before=await harness.account('migration@example.test');expect((before.data as AppData).workouts).toHaveLength(raw.data.workouts.length);
  await page.reload();await synced(page);const after=await harness.account('migration@example.test');expect(after.data).toEqual(before.data);
  const original=await page.evaluate(()=>new Promise<unknown>(resolve=>{const r=indexedDB.open('entrenos-local',1);r.onsuccess=()=>{const db=r.result,tx=db.transaction('state'),q=tx.objectStore('state').get('local');tx.oncomplete=()=>{resolve(q.result);db.close()}}}));expect(original).toEqual(raw.data);
  await page.screenshot({path:'test-results/accounts-mobile.png',fullPage:true});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
});

 test('pending logout keeps unsent data private and resumes only in its owning account', async({page,context})=>{
  await harness.seed('pending@example.test');await harness.seed('clean@example.test');await login(page,'pending@example.test');await synced(page);
  await context.setOffline(true);await page.getByRole('navigation').getByRole('button',{name:'Rutinas',exact:true}).click();await page.getByRole('button',{name:'＋ Crear rutina'}).click();await page.getByLabel('Nombre de la rutina').fill('Solo cuenta pendiente');await page.getByRole('button',{name:'Guardar rutina',exact:true}).click();
  await expect(page.locator('.account-toolbar')).toContainText('Pendiente de conexión');await context.setOffline(false);
  // Stop only the cloud writes; sign-out/auth stay available.
  await page.route('**/rest/v1/**',route=>route.abort());await page.getByText('Mi cuenta',{exact:true}).click();
  page.once('dialog',dialog=>dialog.accept());await page.getByRole('button',{name:'Cerrar sesión',exact:true}).click();await expect(page.getByRole('button',{name:'Entrar',exact:true})).toBeVisible();
  await page.unroute('**/rest/v1/**');await login(page,'clean@example.test');await page.getByRole('navigation').getByRole('button',{name:'Rutinas',exact:true}).click();await expect(page.getByText('Solo cuenta pendiente',{exact:true})).toHaveCount(0);
  await synced(page);await page.getByText('Mi cuenta',{exact:true}).click();await page.getByRole('button',{name:'Cerrar sesión',exact:true}).click();await expect(page.getByRole('button',{name:'Entrar',exact:true})).toBeVisible();await login(page,'pending@example.test');await synced(page);expect((await harness.account('pending@example.test')).data).toMatchObject({routines:[{name:'Solo cuenta pendiente'}]});
});

test('concurrent devices require an explicit economic/profile choice and preserve a recovery copy',async({page,browser})=>{
  await harness.seed('concurrent@example.test');await login(page,'concurrent@example.test');await synced(page);
  const context=await browser.newContext();const other=await context.newPage();await login(other,'concurrent@example.test');await synced(other);await context.setOffline(true);
  await page.getByRole('button',{name:'Ajustes de Cheesit'}).click();await page.getByLabel('Peso corporal (kg)').fill('85');await page.getByRole('button',{name:'Guardar perfil'}).click();await synced(page);
  await other.getByRole('button',{name:'Ajustes de Cheesit'}).click();await other.getByLabel('Peso corporal (kg)').fill('75');await other.getByRole('button',{name:'Guardar perfil'}).click();
  await expect(other.locator('.account-toolbar')).toContainText('Pendiente de conexión');await context.setOffline(false);await other.getByRole('button',{name:'Reintentar sincronización'}).click();
  await expect(other.getByRole('heading',{name:'Revisa los cambios de tus dispositivos'})).toBeVisible();
  await other.getByLabel('Usar versión de la cuenta',{exact:true}).check();await other.getByRole('button',{name:'Confirmar resolución'}).click();await synced(other);
  await expect(other.getByLabel('Peso corporal (kg)')).toHaveValue('85');await other.getByText('Mi cuenta',{exact:true}).click();await other.getByRole('button',{name:'Revisar copias de conflictos'}).click();await expect(other.getByText(/Copia \d/).first()).toBeVisible();await context.close();
});
