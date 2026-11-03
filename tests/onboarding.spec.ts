import { test, expect, type Page } from '@playwright/test';
import { accountsHarness } from './accounts-harness';
import { settings } from './account-navigation';
import type { AppData } from '../src/lib/model';

test.skip(process.env.CHEESIT_ACCOUNTS_FIXTURE !== '1', 'Requires isolated Auth/Postgres fixture.');
let harness: Awaited<ReturnType<typeof accountsHarness>>;
test.beforeAll(async () => { harness = await accountsHarness(); });
test.afterAll(async () => { await harness?.close(); });
test.beforeEach(async ({ page }) => { await page.addInitScript(() => sessionStorage.setItem('grind-intro-v1','1')); await page.emulateMedia({ reducedMotion: 'reduce' }); });
async function login(page: Page, email: string) {
  await page.goto('/'); await page.getByLabel('Correo electrónico').fill(email); await page.getByLabel('Contraseña',{exact:true}).fill('test-password-123'); await page.getByRole('button',{name:'Entrar',exact:true}).click();
}
async function initial(page: Page) {
  await expect(page.getByRole('heading',{name:'Completa tu perfil',exact:true})).toBeVisible();
  await page.getByLabel('Peso (kg)',{exact:true}).fill('82.5'); await page.getByLabel('Altura (cm)',{exact:true}).fill('182'); await page.getByLabel('Edad (años)',{exact:true}).fill('29'); await page.getByLabel('Sexo',{exact:true}).selectOption('male');
}
async function profile(page: Page) { await page.getByLabel('Menú de perfil',{exact:true}).click(); await page.locator('.profile-nav-options').getByRole('button',{name:'Mi perfil',exact:true}).click(); }

test('registration reserves lowercase @username, onboarding, duplicate feedback, persistent session and weight sync',async({page,browser})=>{
  test.setTimeout(60000);
  await page.goto('/'); await expect(page.getByRole('heading',{name:'Iniciar sesión',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Crear cuenta',exact:true}).click();
  await page.getByLabel('Nombre visible',{exact:true}).fill('Óscar García'); await page.getByLabel('Nombre de usuario',{exact:true}).fill('@Oscar.Garcia'); await expect(page.getByLabel('Nombre de usuario',{exact:true})).toHaveValue('@oscar.garcia');
  await page.screenshot({path:'artifacts/onboarding/registration.png',animations:'disabled'});
  await page.getByLabel('Correo electrónico').fill('new-flow@example.test'); await page.getByLabel('Contraseña',{exact:true}).fill('test-password-123'); await page.getByLabel('Repetir contraseña',{exact:true}).fill('test-password-123'); await page.getByRole('button',{name:'Crear cuenta',exact:true}).click(); await expect(page.getByRole('status')).toContainText('Confirma tu correo');
  harness.confirm('new-flow@example.test'); await page.getByRole('button',{name:'Volver a iniciar sesión'}).click(); await page.getByLabel('Contraseña',{exact:true}).fill('test-password-123'); await page.getByRole('button',{name:'Entrar',exact:true}).click(); await initial(page); await page.screenshot({path:'artifacts/onboarding/initial-profile.png',animations:'disabled'});
  // A failed save must keep the form and offer retry, never enter the app.
  await page.route('**/rest/v1/rpc/cheesit_complete_profile',route=>route.abort()); await page.getByRole('button',{name:'Guardar y entrar'}).click(); await expect(page.locator('.account-card').getByRole('alert')).toContainText('No se ha confirmado'); await expect(page.getByLabel('Peso (kg)',{exact:true})).toHaveValue('82.5'); await page.unroute('**/rest/v1/rpc/cheesit_complete_profile');
  await page.getByRole('button',{name:'Guardar y entrar'}).click(); await expect(page.getByRole('heading',{name:'Resumen',exact:true})).toBeVisible();
  const saved=(await harness.account('new-flow@example.test')).data as AppData;
  expect(saved.profile).toMatchObject({weightKg:82.5,heightCm:182,age:29,sex:'male'}); expect(saved.personalProfile?.displayName).toBe('Óscar García');
  await profile(page); await expect(page.locator('.profile-name h2')).toHaveText('Óscar García'); await expect(page.locator('.profile-username')).toHaveText('@oscar.garcia'); await page.screenshot({path:'artifacts/onboarding/profile.png',animations:'disabled'});
  await page.reload(); await expect(page.locator('.profile-username')).toHaveText('@oscar.garcia'); await expect(page.getByLabel('Edad (años)',{exact:true})).toHaveCount(0);
  const otherContext=await browser.newContext();const other=await otherContext.newPage();
  try {
    await other.goto('/');await other.getByRole('button',{name:'Crear cuenta',exact:true}).click(); await other.getByLabel('Nombre visible',{exact:true}).fill('Otro nombre'); await other.getByLabel('Nombre de usuario',{exact:true}).fill('OSCAR.GARCIA'); await other.getByLabel('Correo electrónico').fill('duplicate@example.test'); await other.getByLabel('Contraseña',{exact:true}).fill('test-password-123'); await other.getByLabel('Repetir contraseña',{exact:true}).fill('test-password-123'); await other.getByRole('button',{name:'Crear cuenta',exact:true}).click(); await expect(other.getByRole('status')).toContainText('ya está ocupado');
    await other.getByRole('button',{name:'Volver a iniciar sesión'}).click(); await other.getByLabel('Correo electrónico').fill('new-flow@example.test'); await other.getByLabel('Contraseña',{exact:true}).fill('test-password-123'); await other.getByRole('button',{name:'Entrar',exact:true}).click(); await expect(other.getByRole('heading',{name:'Resumen',exact:true})).toBeVisible();
    await settings(page); await expect(page.getByLabel('Peso corporal (kg)',{exact:true})).toHaveValue('82.5'); await expect(page.getByLabel('Altura (cm)',{exact:true})).toHaveCount(0); await expect(page.getByLabel('Edad',{exact:true})).toHaveCount(0); await expect(page.getByLabel('Sexo de referencia')).toHaveCount(0);
    await page.route('**/rest/v1/rpc/cheesit_commit_account',route=>route.abort()); await page.getByLabel('Peso corporal (kg)',{exact:true}).fill('86.2'); await page.getByRole('button',{name:'Guardar peso',exact:true}).click(); await expect(page.getByText('No se ha confirmado el guardado.',{exact:false})).toBeVisible(); await expect(page.getByText('Peso guardado en tu cuenta.',{exact:true})).toHaveCount(0); expect(((await harness.account('new-flow@example.test')).data as AppData).profile?.weightKg).toBe(82.5);
    await page.unroute('**/rest/v1/rpc/cheesit_commit_account'); await page.getByRole('button',{name:'Guardar peso',exact:true}).click(); await expect(page.getByText('Peso guardado en tu cuenta.',{exact:true})).toBeVisible();
    expect(((await harness.account('new-flow@example.test')).data as AppData).profile?.weightKg).toBe(86.2);
    await expect(other.locator('.account-sync-copy')).toContainText('Sincronizado con tu cuenta');
    const downloaded=other.waitForResponse(response=>response.url().includes('/rest/v1/cheesit_accounts'));
    await other.reload(); await downloaded; await settings(other);await expect(other.getByLabel('Peso corporal (kg)',{exact:true})).toHaveValue('86.2');
    for(const width of [320,390,768,1440]) {await page.setViewportSize({width,height:900}); expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);}
    await page.screenshot({path:'artifacts/onboarding/weight-settings.png',animations:'disabled'});
  } finally {await otherContext.close();}
});

test('guest enters without Auth requests or personal questions and persists separately',async({page})=>{
  let writes=0;page.on('request',request=>{if(request.url().includes('127.0.0.1:55440')&&request.method()==='POST')writes++;});
  await page.goto('/'); await page.getByRole('button',{name:'Continuar como invitado'}).click(); await expect(page.getByRole('heading',{name:'Resumen',exact:true})).toBeVisible(); await expect(page.getByRole('heading',{name:'Completa tu perfil'})).toHaveCount(0);
  await settings(page); await expect(page.getByRole('heading',{name:'Modo invitado'})).toBeVisible();
  await page.getByRole('switch',{name:'Efectos y confeti'}).click();await expect(page.getByRole('switch',{name:'Efectos y confeti'})).toHaveAttribute('aria-checked','false');
  await page.getByRole('button',{name:'Ir a iniciar sesión'}).click();await page.getByRole('button',{name:'Continuar como invitado'}).click();await settings(page);await expect(page.getByRole('switch',{name:'Efectos y confeti'})).toHaveAttribute('aria-checked','false');
  expect(writes).toBe(0);
});
