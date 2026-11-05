import { devices, expect, test, type Page } from '@playwright/test';
import { accountsHarness } from './accounts-harness';
import { CATALOG } from '../src/lib/catalog';
import { todayMadrid } from '../src/lib/dates';
import { gameBalance, normalizeGame, openCrate, type InventoryItem } from '../src/lib/game';
import { emptyData, exerciseSnapshot, newSet, newWorkout, type AppData, type Routine } from '../src/lib/model';

test.skip(process.env.CHEESIT_ACCOUNTS_FIXTURE !== '1', 'Requires isolated local accounts.');
test.use({ ...devices['Pixel 7'], channel: 'chrome', reducedMotion: 'reduce' });
let harness: Awaited<ReturnType<typeof accountsHarness>>;
test.beforeAll(async () => { harness = await accountsHarness(); });
test.afterAll(async () => { await harness?.close(); });

const press = CATALOG.find(ex => ex.id === 'press-banca-barra')!;
const nav = (page: Page, name: string) => page.getByRole('navigation', { name: 'Navegación principal' }).getByRole('button', { name, exact: true });
const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true });
const title = (page: Page, name: string) => expect(page.getByRole('heading', { name, level: 1, exact: true })).toBeVisible();
const makeRoutine = (name: string): Routine => ({ id: crypto.randomUUID(), name, color: '#B8A0FF', archived: false, exercises: [{ id: crypto.randomUUID(), exerciseId: press.id, sets: 1, repsMin: 10, targetWeight: 42 }] });
const makeWorkout = (name: string, status: 'draft' | 'finished' = 'draft') => ({
  ...newWorkout(), status, name, date: '2026-10-20',
  exercises: [{ ...exerciseSnapshot(press), id: crypto.randomUUID(), sets: [{ ...newSet(), weight: 40, reps: 8, confirmed: true }] }],
});

async function enter(page: Page, email: string) {
  await page.addInitScript(() => sessionStorage.setItem('grind-intro-v1', '1'));
  await page.goto('/');
  await page.getByLabel('Correo electrónico').fill(email);
  await page.getByLabel('Contraseña', { exact: true }).fill('test-password-123');
  await button(page, 'Entrar').click();
  await title(page, 'Inicio');
}

async function saveWorkout(page: Page) {
  await button(page, 'Guardar entrenamiento').click();
  const dialog = page.getByRole('dialog', { name: 'Finalizar entrenamiento' });
  await dialog.getByRole('button', { name: 'Guardar entrenamiento', exact: true }).click();
  await title(page, 'Entrenamiento');
  await expect(page.getByText('Entrenamiento guardado.', { exact: true })).toBeVisible();
  const celebration = page.getByRole('button', { name: 'Continuar', exact: true });
  if (await celebration.isVisible()) await celebration.click();
}

test('the five tabs and all eight hub pages stay usable at 320, 390, 430 and desktop', async ({ page }) => {
  await harness.seed('nav-new@example.test');
  await enter(page, 'nav-new@example.test');
  await button(page, 'Empezar entreno').click();
  await title(page, 'Empezar entreno');
  const startRoute = page.url();
  await page.goBack();
  await title(page, 'Inicio');
  const labels = ['Inicio', 'Comunidad', 'Entrenar', 'Progreso', 'Arcade'];
  const groups = [
    { hub: 'Entrenar', group: 'Apartados de Entrenar', pages: ['Empezar entreno', 'Mis rutinas', 'Planes de entrenamiento', 'Catálogo de ejercicios'] },
    { hub: 'Arcade', group: 'Apartados de Arcade', pages: ['Personaje', 'Cofres', 'Retos y logros', 'Nivel y recompensas'] },
  ];
  for (const width of [320, 390, 430, 1440]) {
    await page.setViewportSize({ width, height: 850 });
    await expect(page.getByRole('navigation', { name: 'Navegación principal' }).getByRole('button')).toHaveText(labels);
    await expect(page.locator('.topbar-actions').locator('.notification-button,.profile-button')).toHaveCount(2);
    for (const { hub, group, pages } of groups) {
      await nav(page, hub).click();
      const cards = page.getByRole('group', { name: group }).getByRole('button');
      await expect(cards).toHaveText(pages);
      const boxes = await Promise.all(pages.map((_, i) => cards.nth(i).boundingBox()));
      expect(Math.abs(boxes[0]!.y - boxes[1]!.y)).toBeLessThan(1);
      expect(Math.abs(boxes[2]!.y - boxes[3]!.y)).toBeLessThan(1);
      expect(boxes[2]!.y).toBeGreaterThan(boxes[0]!.y);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width + 1);
      if (width === 390) for (const label of pages) {
        await cards.filter({ hasText: label }).click();
        await title(page, label === 'Cofres' ? 'Cofres y créditos' : label);
        await expect(nav(page, hub)).toHaveAttribute('aria-current', 'page');
        if (label === 'Empezar entreno') expect(page.url()).toBe(startRoute);
        await page.reload();
        await title(page, label === 'Cofres' ? 'Cofres y créditos' : label);
        await page.goBack();
        await title(page, hub);
      }
    }
  }
  await nav(page, 'Entrenar').click();
  await button(page, 'Empezar entreno').click();
  await expect(page.getByLabel('Fecha', { exact: true })).toHaveCount(0);
  await page.getByLabel('Nombre', { exact: true }).fill('Primera sesión');
  await button(page, 'Empezar sin rutina').dblclick();
  await title(page, 'Entrenamiento');
  await nav(page, 'Inicio').click();
  await button(page, 'Continuar entreno').click();
  await title(page, 'Entrenamiento');
  await page.reload();
  await title(page, 'Entrenamiento');
  await expect.poll(async () => ((await harness.account('nav-new@example.test')).data as AppData).workouts.map(w => [w.name, w.date])).toEqual([['Primera sesión', todayMadrid()]]);
});

test('equipped slots and crate odds stay compact on mobile and desktop', async ({ page }, info) => {
  const email = 'nav-compact-arcade@example.test';
  const acquiredAt = new Date().toISOString();
  const inventory: InventoryItem[] = [
    { id: crypto.randomUUID(), kind: 'gear', gearId: 'solar-cape', rarity: 'legendary', acquiredAt, crateId: 'starter', sold: false },
    ...Array.from({ length: 2 }, () => ({ id: crypto.randomUUID(), kind: 'companion' as const, companionId: 'athlete', rarity: 'common' as const, acquiredAt, crateId: 'starter', sold: false })),
  ];
  await harness.seed(email, undefined, { ...emptyData(), game: {
    ...normalizeGame(), inventory, cosmeticGear: { back: 'solar-cape' }, equippedCompanionId: 'athlete',
    transactions: inventory.map(item => ({ id: crypto.randomUUID(), kind: 'crate', itemId: item.id, amount: -100, createdAt: acquiredAt, testFunded: true })),
  } });
  await enter(page, email);
  await page.goto('/#view=game&tab=collection');
  await title(page, 'Personaje');
  await expect(page).toHaveURL(/tab=looks$/);
  await expect(page.getByRole('navigation', { name: 'Organizar colección' }).getByRole('button')).toHaveText(['Aspectos', 'Habilidades']);
  await expect(page.getByText('Tuyo para siempre')).toHaveCount(0);
  await expect(page.locator('.wardrobe-stage .cheesit-passive')).toHaveCount(0);
  const cheesit = page.locator('.cosmetic-card[data-companion-id="athlete"]');
  await expect(cheesit.locator('.cheesit-passive')).toBeVisible();
  await expect(cheesit.locator('.inventory-quantity')).toHaveText('2x');
  const slots = page.locator('.wardrobe-slot');
  await expect(slots).toHaveCount(6);
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 850 });
    const sizes = await slots.evaluateAll(elements => elements.map(el => [el.clientWidth, el.clientHeight]));
    for (const [w, h] of sizes) {
      expect(Math.abs(w - sizes[0][0])).toBeLessThanOrEqual(1);
      expect(h).toBe(sizes[0][1]);
    }
    if (width !== 320) await page.locator('.wardrobe-stage').screenshot({ path: info.outputPath(`equipped-${width}.png`) });
  }
  await cheesit.getByRole('button', { name: 'Quitar cheesit', exact: true }).click();
  await expect(page.locator('.wardrobe-slot[data-slot="companion"]')).toContainText('Sin equipar');
  await cheesit.getByRole('button', { name: 'Equipar cheesit', exact: true }).click();
  await expect(page.locator('.wardrobe-slot[data-slot="companion"]')).toContainText('Vega');

  await button(page, 'Inicio de Arcade').click();
  await button(page, 'Cofres').click();
  await expect(page.getByText('Cofres disponibles')).toHaveCount(0);
  await expect(page.locator('.arcade-crates .arcade-crate>p')).toHaveCount(0);
  const cards = page.locator('.arcade-crate');
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 850 });
    const [first, second, third] = await Promise.all([0, 1, 2].map(i => cards.nth(i).boundingBox()));
    expect(first!.y).toBe(second!.y);
    expect(first!.x).toBeLessThan(second!.x);
    expect(third!.y).toBeGreaterThan(first!.y);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width + 1);
    await expect(page.locator('.crate-odds')).toHaveCount(0);
    await cards.first().getByRole('button', { name: /Probabilidades/ }).click();
    const odds = page.getByRole('dialog', { name: 'Probabilidades · Cofre de hierro' });
    await expect(odds).toContainText('70%');
    await expect(odds).toContainText('1%');
    await expect(page.getByText('Tu cofre sigue cerrado.')).toHaveCount(0);
    await odds.getByRole('button', { name: 'Cerrar información' }).click();
    if (width !== 320) await page.locator('.arcade-crates').screenshot({ path: info.outputPath(`crates-${width}.png`) });
  }
  const saved = (await harness.account(email)).data as AppData;
  expect(saved.game?.pendingOpening ?? null).toBeNull();
  expect(saved.game?.inventory.map(item => item.id)).toEqual(inventory.map(item => item.id));
});

test('existing profile, workouts, plans, routines, records and Arcade reservation survive navigation', async ({ page }) => {
  const routine = makeRoutine('Rutina A'), next = makeRoutine('Rutina B');
  const history = makeWorkout('Sesión anterior', 'finished');
  const draft = { ...makeWorkout('Borrador previo'), updatedAt: '2026-11-01T10:00:00Z' };
  const cycle = { id: crypto.randomUUID(), name: 'Plan existente', position: 0, routineIds: [routine.id, next.id], completedWorkoutIds: [] };
  const reservation = openCrate(normalizeGame(), [history], 'starter')!;
  const balance = gameBalance(reservation.game, [history]);
  const email = 'nav-existing@example.test';
  await harness.seed(email, undefined, { ...emptyData(), routines: [routine, next], workouts: [history, draft], game: reservation.game,
    personalProfile: { displayName: 'Persona anterior', photo: null, bio: 'Conservada' }, training: { cycles: [cycle], moments: [], weeklyGoals: [] } });
  await enter(page, email);
  await button(page, 'Continuar entreno').click();
  await expect(page.getByLabel('Carga en kg, serie 1 de Press de banca con barra')).toHaveValue('40');
  await page.reload();
  await expect(page.getByLabel('Carga en kg, serie 1 de Press de banca con barra')).toHaveValue('40');

  await nav(page, 'Entrenar').click();
  await button(page, 'Mis rutinas').click();
  await button(page, 'Entrenar Rutina A').click();
  await expect(page.getByLabel('Rutina', { exact: true })).toHaveValue(routine.id);
  await page.reload();
  await expect(page.getByLabel('Rutina', { exact: true })).toHaveValue(routine.id);
  await button(page, 'Empezar con esta rutina').click();
  await expect(page.getByLabel('Carga en kg, serie 1 de Press de banca con barra')).toHaveValue('42');
  await nav(page, 'Entrenar').click();
  await button(page, 'Mis rutinas').click();
  await page.getByRole('button', { name: /Rutina A.*ejercicio/ }).click();
  await page.getByLabel('Nombre de la rutina').fill('Rutina A actualizada');
  await nav(page, 'Comunidad').click();
  const changes = page.getByRole('dialog', { name: 'Cambios pendientes' });
  await changes.getByRole('button', { name: 'Seguir editando' }).click();
  await button(page, 'Guardar rutina').click();
  await title(page, 'Mis rutinas');

  await nav(page, 'Entrenar').click();
  await button(page, 'Planes de entrenamiento').click();
  await expect(page.locator('.cycle-card')).toContainText('Próxima · Rutina A actualizada');
  await button(page, 'Iniciar próxima →').click();
  await button(page, 'Confirmar serie 1').click();
  const closeCelebration = page.getByRole('button', { name: 'Cerrar celebración' });
  if (await closeCelebration.isVisible()) await closeCelebration.click();
  await saveWorkout(page);
  await nav(page, 'Entrenar').click();
  await button(page, 'Planes de entrenamiento').click();
  await expect(page.locator('.cycle-card')).toContainText('Próxima · Rutina B');
  await button(page, 'Saltar posición').click();
  await expect(page.locator('.cycle-card')).toContainText('Próxima · Rutina A actualizada');

  await nav(page, 'Progreso').click();
  await page.getByRole('button', { name: /Sesión anterior/ }).click();
  await expect(button(page, 'Editar entrenamiento')).toBeVisible();
  await expect(button(page, 'Repetir sesión')).toBeVisible();
  await page.goto(`/#view=progress&id=${press.id}`);
  await expect(button(page, 'Marcas')).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('heading', { name: press.name })).toBeVisible();
  await page.goto('/#view=game&tab=body');
  await expect(button(page, 'Cuerpo')).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('region', { name: 'Mapa muscular' })).toBeVisible();
  await expect(page.getByLabel('Peso corporal (kg)')).toHaveValue('70');
  await page.getByLabel('Menú de perfil').click();
  await button(page, 'Mi perfil').click();
  await expect(page.getByRole('heading', { name: 'Persona anterior' })).toBeVisible();

  await nav(page, 'Arcade').click();
  await button(page, 'Personaje').click();
  await title(page, 'Personaje');
  await button(page, 'Inicio de Arcade').click();
  await button(page, 'Cofres').click();
  await title(page, 'Cofres y créditos');
  await expect(page.getByRole('button', { name: /créditos disponibles/ })).toBeVisible();
  await button(page, 'Continuar apertura').click();
  await expect(page.getByRole('dialog', { name: 'Recompensa obtenida' })).toBeVisible();
  await expect.poll(async () => {
    const data = (await harness.account(email)).data as AppData;
    return [data.game?.pendingOpening, data.game?.inventory.map(item => item.id), data.game?.transactions.map(item => item.id)];
  }).toEqual([null, [reservation.item.id], reservation.game.transactions.map(item => item.id)]);
  expect(balance).toBeGreaterThanOrEqual(0);
});

test('publishing is explicit, retryable and separate from saving or editing a session', async ({ page }) => {
  const email = 'nav-publication@example.test';
  const first = makeWorkout('Sesión privada'), second = makeWorkout('Sesión para compartir');
  const owner = await harness.seed(email, undefined, { ...emptyData(), workouts: [first, second] });
  await enter(page, email);
  const recorded = async () => ((await harness.account(email)).data as AppData).workouts;
  await page.goto(`/#view=editor&id=${first.id}`);
  await saveWorkout(page);
  await expect.poll(async () => (await recorded()).find(w => w.id === first.id)?.status).toBe('finished');
  expect((await harness.feed(email)).items).toHaveLength(0);

  await page.goto(`/#view=editor&id=${second.id}`);
  await saveWorkout(page);
  await button(page, 'Publicar en Comunidad').click();
  await title(page, 'Publicación');
  await page.getByLabel(/Descripción de la publicación/).fill('Compartida a propósito');
  const photo = await page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 64;
    const context = canvas.getContext('2d')!; context.fillStyle = '#b8a0ff'; context.fillRect(0, 0, 64, 64);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  await page.getByLabel('Foto del entrenamiento', { exact: true }).setInputFiles({ name: 'foto.png', mimeType: 'image/png', buffer: Buffer.from(photo, 'base64') });
  await expect(page.getByAltText('Vista previa de la foto del entrenamiento')).toBeVisible();
  await expect.poll(async () => (await recorded()).find(w => w.id === second.id)?.status).toBe('finished');

  const endpoint = '**/rest/v1/rpc/cheesit_commit_account';
  await page.route(endpoint, route => route.abort());
  await button(page, 'Publicar en Comunidad').click();
  await expect(button(page, 'Reintentar publicación')).toBeEnabled();
  expect((await recorded()).filter(w => w.status === 'finished')).toHaveLength(2);
  expect((await harness.feed(email)).items).toHaveLength(0);
  await page.unroute(endpoint);
  await button(page, 'Reintentar publicación').click();
  await title(page, 'Entrenamiento');
  const published = (await recorded()).find(w => w.id === second.id)!.publication!;
  expect(published).toMatchObject({ published: true, caption: 'Compartida a propósito' });
  expect(published.photoPath).toContain(owner.id);
  expect((await harness.feed(email)).items).toHaveLength(1);

  await button(page, 'Editar entrenamiento').click();
  await button(page, 'Detalles de la sesión').count().then(async count => {
    if (count) await button(page, 'Detalles de la sesión').click();
    else await page.getByText('Detalles de la sesión', { exact: true }).click();
  });
  await page.getByLabel('Nombre', { exact: true }).fill('Sesión editada');
  await button(page, 'Guardar cambios').click();
  await expect.poll(async () => (await recorded()).find(w => w.id === second.id)?.name).toBe('Sesión editada');
  expect((await recorded()).find(w => w.id === second.id)?.publication).toEqual(published);
  expect((await harness.feed(email)).items).toHaveLength(1);
});
