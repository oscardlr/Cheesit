import { expect, test, type Page } from '@playwright/test';
import { accountsHarness } from './accounts-harness';
import { CATALOG } from '../src/lib/catalog';
import { todayMadrid } from '../src/lib/dates';
import { awardMissionRewards, normalizeGame } from '../src/lib/game';
import { emptyData, exerciseSnapshot, newSet, newWorkout, type Workout } from '../src/lib/model';

test.skip(process.env.CHEESIT_ACCOUNTS_FIXTURE !== '1', 'Requires the isolated account fixture.');

async function openObjectives(page: Page) {
  await page.getByLabel('Menú de perfil', { exact: true }).click();
  await page.getByRole('button', { name: 'Objetivos', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Objetivos', exact: true })).toBeVisible();
}

test('personal goals retain weekly rewards and synchronize changes to a second browser context', async ({ page, browser }) => {
  test.setTimeout(90000);
  const harness = await accountsHarness();
  const other = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const email = 'personal-goals@example.test';
  const today = todayMadrid();
  const bench = CATALOG.find(exercise => exercise.id === 'press-banca-barra')!;
  const workout = (weight: number): Workout => ({
    ...newWorkout(), name: 'Press de banca', status: 'finished', date: today,
    exercises: [{ ...exerciseSnapshot(bench), id: crypto.randomUUID(), sets: [
      { ...newSet(), weight, reps: 8, confirmed: true },
      { ...newSet(), kind: 'warmup', weight: 100, reps: 8, confirmed: true },
    ] }],
  });
  const workouts = [workout(50), workout(65)];
  const game = awardMissionRewards({ ...normalizeGame(), weeklyWorkoutGoal: 1 }, workouts, today);
  const login = async (tab: Page) => {
    await tab.addInitScript(() => sessionStorage.setItem('grind-intro-v1', '1'));
    await tab.goto('/');
    await tab.getByLabel('Correo electrónico').fill(email);
    await tab.getByLabel('Contraseña', { exact: true }).fill('test-password-123');
    await tab.getByRole('button', { name: 'Entrar', exact: true }).click();
    await expect(tab.getByRole('heading', { name: 'Inicio', exact: true })).toBeVisible();
  };

  try {
    await harness.seed(email, undefined, { ...emptyData(), game, workouts });
    await login(page);
    await openObjectives(page);
    await expect(page.getByText('1 de 1 día completado')).toBeVisible();
    await page.getByRole('button', { name: 'Editar objetivo semanal' }).click();
    await page.getByLabel('Días de entreno por semana').fill('4');
    await page.getByRole('button', { name: 'Guardar objetivo', exact: true }).click();
    await expect(page.getByText('1 de 4 días completados')).toBeVisible();
    await expect(page.getByText(/la recompensa de esta semana ya se obtuvo/i)).toBeVisible();

    await page.getByRole('button', { name: 'Nuevo objetivo' }).click();
    await page.getByRole('combobox', { name: 'Ejercicio', exact: true }).selectOption(bench.id);
    await page.getByLabel('Carga externa total (kg)').fill('80');
    await page.getByRole('button', { name: 'Guardar objetivo', exact: true }).click();
    const exerciseCard = page.getByRole('article').filter({ has: page.getByRole('heading', { name: bench.name, exact: true }) });
    await expect(exerciseCard).toContainText('Mejor carga: 65 kg');
    await expect(exerciseCard).toContainText('En progreso');
    await exerciseCard.getByRole('button', { name: /editar objetivo/i }).click();
    await page.getByLabel('Carga externa total (kg)').fill('60');
    await page.getByRole('button', { name: 'Guardar objetivo', exact: true }).click();
    await expect(exerciseCard).toContainText('Objetivo cumplido');

    await page.getByRole('button', { name: 'Nuevo objetivo' }).click();
    await page.getByRole('combobox', { name: 'Tipo de objetivo', exact: true }).selectOption('body');
    await page.getByLabel('Peso objetivo (kg)').fill('68');
    await page.getByRole('button', { name: 'Guardar objetivo', exact: true }).click();
    await expect(page.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Peso corporal' }) })).toContainText('Sin registros');
    await expect.poll(async () => (await harness.account(email)).data).toMatchObject({
      game: { weeklyWorkoutGoal: 4, missionRewards: game.missionRewards },
      profile: { weightTracking: { goalKg: 68 } },
      training: { exerciseGoals: [{ exerciseId: bench.id, targetKg: 60 }] },
    });

    await page.reload();
    await expect(exerciseCard).toContainText('Meta de 60 kg');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);

    const desktop = await other.newPage();
    await login(desktop);
    await openObjectives(desktop);
    await expect(desktop.getByText('Meta de 60 kg')).toBeVisible();
    await expect(desktop.getByText('Meta de 68 kg')).toBeVisible();
    expect(await desktop.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1440);
    await desktop.getByRole('button', { name: /eliminar objetivo de press/i }).click();
    await desktop.getByRole('button', { name: 'Eliminar objetivo de peso' }).click();
    await expect.poll(async () => (await harness.account(email)).data).toMatchObject({ training: { exerciseGoals: [] } });
    await expect.poll(async () => (await harness.account(email)).data).not.toMatchObject({ profile: { weightTracking: { goalKg: 68 } } });
    await desktop.getByRole('navigation', { name: 'Navegación principal' }).getByRole('button', { name: 'Arcade', exact: true }).click();
    await desktop.getByRole('button', { name: 'Retos y logros', exact: true }).click();
    await expect(desktop.getByRole('heading', { name: 'Logros de actividad' })).toBeVisible();
    await expect(desktop.getByRole('heading', { name: 'Tu objetivo semanal' })).toHaveCount(0);
  } finally {
    await other.close();
    await harness.close();
  }
});
