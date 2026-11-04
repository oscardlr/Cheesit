import { test, expect, type Page } from '@playwright/test';
import { accountsHarness } from './accounts-harness';
import { account, settings } from './account-navigation';
import { emptyData, newId, type AppData, type Routine } from '../src/lib/model';
import { normalizeGame } from '../src/lib/game';

test.skip(process.env.CHEESIT_ACCOUNTS_FIXTURE !== '1', 'Requires isolated local account fixture.');
let harness: Awaited<ReturnType<typeof accountsHarness>>;
test.beforeAll(async () => { harness = await accountsHarness(55442); });
test.afterAll(async () => { await harness?.close(); });
async function login(page: Page, email: string) {
  await page.addInitScript(() => sessionStorage.setItem('grind-intro-v1','1'));
  await page.goto('/'); await page.getByLabel('Correo electrónico').fill(email); await page.getByLabel('Contraseña', { exact: true }).fill('test-password-123'); await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Resumen', exact: true })).toBeVisible();
  await expect(page.locator('.account-sync-copy')).toContainText('Sincronizado con tu cuenta', { timeout: 15000 });
}
async function profile(page: Page) { await page.getByLabel('Menú de perfil', { exact: true }).click(); await page.getByRole('button', { name: 'Mi perfil', exact: true }).click(); }

test('offline cycle completion syncs once to a second device, with warmups/private moments and isolation from another account', async ({ page, context, browser }) => {
  test.setTimeout(90000);
  const a: Routine = { id: newId(), name: 'Rutina sincronizada A', archived: false, color: '#d8ff3e', exercises: [{ id: newId(), exerciseId: 'press-banca-barra', sets: 2, setKinds: ['warmup', 'work'], targetWeight: 20, repsMin: 8 }] };
  const b: Routine = { ...structuredClone(a), id: newId(), name: 'Rutina sincronizada B', exercises: a.exercises.map(e => ({ ...e, id: newId() })) };
  const data: AppData = { ...emptyData(), routines: [a,b], game: normalizeGame(), preferences: { effects: false, sound: false }, training: { moments: [], weeklyGoals: [], cycles: [{ id: newId(), name: 'Ciclo privado AB', position: 0, routineIds: [a.id,b.id], completedWorkoutIds: [] }] } };
  await harness.seed('features@example.test', undefined, data); await harness.seed('features-other@example.test');
  await login(page, 'features@example.test');
  const secondContext = await browser.newContext(), second = await secondContext.newPage();
  try {
    await login(second, 'features@example.test');
    await context.setOffline(true);
    await page.locator('.cycle-card').getByRole('button', { name: 'Iniciar próxima →' }).click();
    await page.getByRole('button', { name: 'Confirmar serie 1', exact: true }).click();
    await page.getByRole('button', { name: 'Confirmar serie 2', exact: true }).click();
    await page.getByRole('button', { name: 'Cerrar celebración', exact: true }).click();
    await page.getByRole('button', { name: 'Finalizar entrenamiento', exact: true }).click();
    await page.getByRole('button', { name: 'Cerrar celebración', exact: true }).click();
    await expect(page.locator('.cycle-card')).toContainText('Próxima · Rutina sincronizada B');
    await profile(page); await expect(page.locator('.moment-card')).toContainText('Tu primera sesión registrada');
    await context.setOffline(false); await settings(page); await page.getByRole('button', { name: 'Reintentar sincronización', exact: true }).click();
    await expect.poll(async () => ((await harness.account('features@example.test')).data as AppData).training!.cycles[0].completedWorkoutIds.length).toBe(1);
    const committed = (await harness.account('features@example.test')).data as AppData;
    expect(committed.workouts[0].exercises[0].sets.map(s => s.kind)).toEqual(['warmup','work']);
    expect(committed.training!.moments.filter(m => m.kind === 'first-session')).toHaveLength(1);
    const downloaded = second.waitForResponse(r => r.url().includes('/rest/v1/cheesit_accounts') && r.request().method() === 'GET');
    await second.reload(); const remote = await (await downloaded).json(); expect(remote.data.training.cycles[0].position).toBe(1);
    await expect(second.locator('.cycle-card')).toContainText('Próxima · Rutina sincronizada B', { timeout: 20000 });
    await profile(second); await expect(second.locator('.moment-card')).toHaveCount(committed.training!.moments.length);
    await second.reload(); await expect(second.locator('.moment-card')).toHaveCount(committed.training!.moments.length);
    expect(((await harness.account('features@example.test')).data as AppData).training!.cycles[0].completedWorkoutIds).toEqual(committed.training!.cycles[0].completedWorkoutIds);
    await account(page); await page.getByRole('button', { name: 'Cerrar sesión', exact: true }).click(); await login(page, 'features-other@example.test'); await profile(page);
    await expect(page.locator('.moment-card')).toHaveCount(0); expect(((await harness.account('features-other@example.test')).data as AppData).training?.cycles ?? []).toHaveLength(0);
  } finally { await context.setOffline(false); await secondContext.close(); }
});
