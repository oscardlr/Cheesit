import { devices, expect, test, type Page } from '@playwright/test';
import { accountsHarness } from './accounts-harness';
import { CATALOG } from '../src/lib/catalog';
import { emptyData, exerciseSnapshot, newSet, newWorkout } from '../src/lib/model';

test.skip(process.env.CHEESIT_ACCOUNTS_FIXTURE !== '1', 'Requires isolated Auth/Postgres account fixture.');
test.use(process.env.CHEESIT_MOBILE_WEBKIT === '1'
  ? { ...devices['iPhone 13'], browserName: 'webkit', channel: undefined }
  : { ...devices['Pixel 7'], browserName: 'chromium', channel: 'chrome' });

let harness: Awaited<ReturnType<typeof accountsHarness>>;
test.beforeEach(async ({ page }) => {
  harness = await accountsHarness();
  await page.addInitScript(() => sessionStorage.setItem('grind-intro-v1', '1'));
});
test.afterEach(async () => { await harness?.close(); });

async function signIn(page: Page, email: string) {
  await page.goto('/');
  await page.getByLabel('Correo electrónico').fill(email);
  await page.getByLabel('Contraseña', { exact: true }).fill('test-password-123');
  await page.getByRole('button', { name: 'Entrar', exact: true }).tap();
}

test('editing late sets keeps the same input and scroll during overlapping account sync', async ({ page, browserName }) => {
  const email = 'long-workout@example.test';
  const exercise = CATALOG.find(item => item.id === 'press-banca-barra')!;
  const draft = { ...newWorkout(), exercises: Array.from({ length: 12 }, (_, i) => ({
    ...exerciseSnapshot(exercise), id: crypto.randomUUID(), name: `Ejercicio ${i + 1}`,
    sets: Array.from({ length: 4 }, () => ({ ...newSet(), weight: 25, reps: 10 })),
  })) };
  await harness.seed(email, undefined, { ...emptyData(), workouts: [draft] });
  await signIn(page, email);
  await expect(page.getByRole('navigation', { name: 'Navegación principal' })).toBeVisible();
  await page.evaluate(id => { window.location.hash = `view=editor&id=${id}`; }, draft.id);
  const weight = page.getByRole('textbox', { name: 'Carga en kg, serie 3 de Ejercicio 12', exact: true });
  await weight.tap();
  const position = await page.evaluate(() => window.scrollY);
  expect(position).toBeGreaterThan(1000);

  let started!: () => void, release!: () => void;
  const requestStarted = new Promise<void>(resolve => { started = resolve; });
  const releaseRequest = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/rest/v1/cheesit_accounts?*', async route => {
    started();
    await releaseRequest;
    await route.continue();
  }, { times: 1 });
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await requestStarted;
  await weight.fill('32,5');
  const reps = page.getByRole('textbox', { name: 'Repeticiones, serie 4 de Ejercicio 12', exact: true });
  await reps.tap();
  await reps.fill('12');
  const finalPosition = await page.evaluate(() => window.scrollY);
  await expect.poll(async () => page.locator('.editor-save').textContent()).not.toContain('Guardando');
  const refreshed = page.waitForResponse(response => response.url().includes('/cheesit_accounts?') && response.ok());
  release();
  await refreshed;
  await expect.poll(async () => {
    const account = await harness.account(email);
    return (account.data as ReturnType<typeof emptyData>).workouts[0]?.exercises.at(-1)?.sets.at(-1)?.reps;
  }).toBe(12);
  await expect(reps).toBeFocused();
  expect(Math.abs(await page.evaluate(() => window.scrollY) - finalPosition)).toBeLessThan(50);
  await reps.blur();
  await expect(weight).toHaveValue('32,5');
  await expect(reps).toHaveValue('12');
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(1000);
  const editor = page.locator('.exercise-card').last();
  await editor.getByRole('button', { name: 'Confirmar serie 4', exact: true }).tap();
  await expect(editor.getByRole('button', { name: 'Realizada 4', exact: true })).toBeDisabled();
  const beforeScroll = await page.evaluate(() => window.scrollY);
  expect(beforeScroll).toBeGreaterThan(1000);
  if (browserName === 'chromium') {
    await page.mouse.wheel(0, -300);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeLessThan(beforeScroll - 100);
  }
});

test('community photos and comments respond without waiting for the network', async ({ page }) => {
  const authorEmail = 'photo-author@example.test';
  const viewerEmail = 'photo-viewer@example.test';
  const author = await harness.seed(authorEmail, undefined, { ...emptyData(), personalProfile: { displayName: 'Atleta Foto', photo: null, bio: '' } });
  await harness.seed(viewerEmail);
  const draft = newWorkout();
  const photoPath = `${author.id}/${draft.id}/${crypto.randomUUID()}.png`;
  const photo = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a81sAAAAASUVORK5CYII=', 'base64');
  const upload = await page.request.post(`http://127.0.0.1:${process.env.CHEESIT_ACCOUNTS_PORT ?? 55440}/storage/v1/object/workout-photos/${photoPath}`, {
    headers: { authorization: `Bearer ${harness.confirm(authorEmail).access_token}`, 'content-type': 'image/png' },
    data: photo,
  });
  expect(upload.ok()).toBe(true);
  await harness.commit(authorEmail, { ...emptyData(), workouts: [{
    ...draft, name: 'Sesión con foto', status: 'finished', publication: { published: true, photoPath },
    exercises: [{ ...exerciseSnapshot(CATALOG[0]), id: crypto.randomUUID(), sets: [{ ...newSet(), weight: 25, reps: 10, confirmed: true }] }],
  }] });
  await signIn(page, viewerEmail);
  const community = () => page.getByRole('navigation', { name: 'Navegación principal' }).getByRole('button', { name: 'Comunidad', exact: true }).tap();
  const feed = page.getByRole('tablist', { name: 'Seleccionar feed', exact: true });
  await expect(page.getByRole('heading', { name: 'Inicio', exact: true })).toBeVisible();
  await community();
  await expect(feed).toBeVisible();
  await page.goto('/#view=feed');
  await expect(feed).toBeVisible();

  let releaseLike!: () => void;
  const likeGate = new Promise<void>(resolve => { releaseLike = resolve; });
  let likeWrites = 0;
  await page.route('**/rest/v1/cheesit_post_likes*', async route => {
    if (route.request().method() === 'POST') { likeWrites++; await likeGate; }
    await route.continue();
  });
  const photoButton = page.locator('.feed-photo > button');
  await photoButton.scrollIntoViewIfNeeded();
  const doubleTap = async () => {
    const bounds = (await photoButton.boundingBox())!;
    const x = bounds.x + bounds.width / 2, y = bounds.y + bounds.height / 2;
    await page.touchscreen.tap(x, y);
    await page.touchscreen.tap(x, y);
  };
  await doubleTap();
  await expect(page.locator('.feed-photo-heart')).toBeVisible();
  const liked = page.getByRole('button', { name: 'Quitar me gusta', exact: true });
  await expect(liked).toContainText('1');
  await expect(liked).toBeDisabled();
  releaseLike();
  await expect(liked).toBeEnabled();
  await doubleTap();
  await expect(page.locator('.feed-photo-heart')).toBeVisible();
  await expect(page.locator('.feed-photo-heart')).toHaveCount(0);
  expect(likeWrites).toBe(1);
  await expect(liked).toContainText('1');
  await expect(feed).toBeVisible();

  let releaseComments!: () => void;
  const commentsGate = new Promise<void>(resolve => { releaseComments = resolve; });
  await page.route('**/rest/v1/rpc/cheesit_read_post_comments', async route => { await commentsGate; await route.continue(); }, { times: 1 });
  await page.getByRole('button', { name: '0 comentarios', exact: true }).tap();
  const composer = page.getByRole('textbox', { name: 'Añade un comentario' });
  await expect(composer).toBeFocused();
  await page.keyboard.type('Buena sesión');
  await expect(composer).toHaveValue('Buena sesión');
  const publish = page.getByRole('button', { name: 'Publicar comentario' });
  await expect(publish).toBeDisabled();
  releaseComments();
  await publish.tap();
  await expect(page.getByRole('button', { name: '1 comentarios', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Cerrar comentarios' }).tap();

  await liked.tap();
  const unliked = page.getByRole('button', { name: 'Dar me gusta', exact: true });
  await expect(unliked).toBeEnabled();
  await expect(unliked).toContainText('0');
  await photoButton.tap();
  await expect(page.getByRole('heading', { name: 'Entrenamiento', exact: true })).toBeVisible();
});

test('the community directory lists people and follows or unfollows from a filtered row', async ({ page }) => {
  const data = (displayName: string) => ({ ...emptyData(), personalProfile: { displayName, photo: null, bio: '' } });
  await harness.seed('directory-viewer@example.test', undefined, data('Mi cuenta'));
  await harness.seed('directory-ana@example.test', undefined, data('Ángela Martín'));
  await harness.seed('directory-beto@example.test', undefined, data('Beto Ruiz'));
  const handle = (await harness.social('directory-ana@example.test')).username;
  await signIn(page, 'directory-viewer@example.test');
  await page.getByRole('navigation', { name: 'Navegación principal' }).getByRole('button', { name: 'Comunidad', exact: true }).tap();
  const searchIcon = page.getByRole('button', { name: 'Buscar personas', exact: true });
  const tabs = page.getByRole('tablist', { name: 'Seleccionar feed', exact: true });
  await expect(searchIcon).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Comunidad', exact: true })).toHaveCount(0);
  await expect(page.getByRole('searchbox')).toHaveCount(0);
  const profileButton = page.getByLabel('Menú de perfil');
  for (const width of [320, 360, 390]) {
    await page.setViewportSize({ width, height: 844 });
    const brand = (await page.locator('.brand').boundingBox())!;
    const actions = (await page.locator('.topbar-actions').boundingBox())!;
    expect(brand.x + brand.width, `cabecera a ${width}px`).toBeLessThanOrEqual(actions.x);
    expect((await profileButton.boundingBox())!.x).toBeGreaterThan(actions.x);
  }
  const beforeSearch = (await tabs.boundingBox())!;
  const icon = (await searchIcon.boundingBox())!;
  expect(icon.x).toBeGreaterThanOrEqual(beforeSearch.x + beforeSearch.width);
  expect(icon.y).toBeGreaterThanOrEqual(beforeSearch.y);
  await searchIcon.tap();
  expect(await tabs.boundingBox()).toEqual(beforeSearch);
  const directory = page.getByRole('list', { name: 'Resultados de personas' });
  const query = page.getByRole('searchbox', { name: 'Nombre o nombre de usuario' });
  await expect(query).toBeFocused();
  await expect(directory.getByRole('listitem')).toHaveCount(2);
  await expect(directory).not.toContainText('Mi cuenta');
  await query.fill('ngela mar');
  await expect(directory.getByRole('listitem')).toHaveCount(1);
  await expect(directory).toContainText('Ángela Martín');
  await directory.getByRole('button', { name: `Seguir a @${handle}`, exact: true }).tap();
  const following = directory.getByRole('button', { name: `Siguiendo a @${handle}`, exact: true });
  await expect(following).toBeEnabled();
  await expect(query).toHaveValue('ngela mar');
  await query.fill(`@${handle.toUpperCase()}`);
  await expect(directory.getByRole('listitem')).toHaveCount(1);
  await expect(following).toBeEnabled();
  await following.tap();
  await expect(directory.getByRole('button', { name: `Seguir a @${handle}`, exact: true })).toBeEnabled();
  await query.clear();
  await expect(query).toBeFocused();
  await expect(directory.getByRole('listitem')).toHaveCount(2);
  await directory.getByRole('button', { name: /Ángela Martín/ }).tap();
  await expect(page.getByRole('heading', { name: 'Ángela Martín', exact: true })).toBeVisible();
  const heart = page.locator('.topbar').getByRole('button', { name: /^Notificaciones/ });
  await expect(heart.locator('.lucide-heart')).toBeVisible();
  await heart.tap();
  await expect(page.getByRole('heading', { name: 'Notificaciones', exact: true })).toBeVisible();
});

test('custom exercise muscle choices survive account refresh and save from both entry points', async ({ page }) => {
  const email = 'custom-muscles@example.test';
  const workout = newWorkout();
  const data = { ...emptyData(), workouts: [workout] };
  await harness.seed(email, undefined, data);
  await signIn(page, email);
  await expect(page.getByRole('heading', { name: 'Inicio', exact: true })).toBeVisible();
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto('/#view=catalog');

  const editor = page.getByRole('region', { name: 'Editor de ejercicio propio' });
  const primary = editor.getByRole('group', { name: 'Músculos principales' });
  const secondary = editor.getByRole('group', { name: 'Músculos secundarios' });
  const checkbox = (group: typeof primary, name: string) => group.getByRole('checkbox', { name, exact: true });

  await page.getByRole('button', { name: 'Crear ejercicio propio' }).tap();
  await editor.getByLabel('Nombre del ejercicio').fill('Mi press de prueba');
  await primary.getByText('Pecho', { exact: true }).tap();
  await secondary.getByText('Tríceps', { exact: true }).tap();
  await expect(checkbox(primary, 'Pecho')).toBeChecked();
  await expect(checkbox(secondary, 'Tríceps')).toBeChecked();

  // A cloud update to another part of the account used to remount the open form.
  const current = (await harness.account(email)).data as ReturnType<typeof emptyData>;
  await harness.commit(email, { ...current, personalProfile: { displayName: 'Nombre de otro dispositivo', photo: null, bio: '' } });
  const refreshed = page.waitForResponse(response => response.url().includes('/cheesit_identities?') && response.ok());
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await refreshed;
  await expect(page.getByRole('region', { name: 'Conflictos de sincronización' })).toHaveCount(0);
  await expect(editor.getByLabel('Nombre del ejercicio')).toHaveValue('Mi press de prueba');
  await expect(checkbox(primary, 'Pecho')).toBeChecked();
  await expect(checkbox(secondary, 'Tríceps')).toBeChecked();

  await primary.getByText('Tríceps', { exact: true }).tap();
  await expect(checkbox(secondary, 'Tríceps')).not.toBeChecked();
  await secondary.getByText('Pecho', { exact: true }).tap();
  await expect(checkbox(primary, 'Pecho')).not.toBeChecked();
  await expect(checkbox(primary, 'Tríceps')).toBeChecked();
  await expect(checkbox(secondary, 'Pecho')).toBeChecked();
  await secondary.getByText('Pecho', { exact: true }).tap();
  await expect(checkbox(secondary, 'Pecho')).not.toBeChecked();
  await secondary.getByText('Pecho', { exact: true }).tap();
  await editor.getByRole('button', { name: 'Guardar ejercicio', exact: true }).tap();
  await expect(editor).toHaveCount(0);
  await expect.poll(async () => {
    const saved = (await harness.account(email)).data as ReturnType<typeof emptyData>;
    return saved.customExercises.find(exercise => exercise.name === 'Mi press de prueba');
  }).toMatchObject({ primaryMuscles: ['triceps'], secondaryMuscles: ['chest'] });

  await page.goto(`/#view=editor&id=${workout.id}`);
  await page.getByRole('button', { name: 'Añadir ejercicio', exact: true }).tap();
  const picker = page.getByRole('dialog', { name: 'Añadir ejercicio' });
  await picker.getByRole('button', { name: 'Crear ejercicio propio' }).tap();
  await editor.getByLabel('Nombre del ejercicio').fill('Mi remo de prueba');
  await primary.getByText('Espalda', { exact: true }).tap();
  await secondary.getByText('Bíceps', { exact: true }).tap();
  await expect(checkbox(primary, 'Espalda')).toBeChecked();
  await expect(checkbox(secondary, 'Bíceps')).toBeChecked();
  await editor.getByRole('button', { name: 'Guardar y añadir', exact: true }).tap();
  await expect(picker).toHaveCount(0);
  await expect(page.getByRole('textbox', { name: 'Carga en kg, serie 1 de Mi remo de prueba' })).toBeVisible();
});
