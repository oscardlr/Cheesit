import { test, expect, type Page } from '@playwright/test';
import { accountsHarness } from './accounts-harness';
import { CATALOG } from '../src/lib/catalog';
import { addDays, todayMadrid } from '../src/lib/dates';
import { emptyData, newWorkout, newSet, exerciseSnapshot, type AppData, type Workout } from '../src/lib/model';

test.skip(process.env.CHEESIT_ACCOUNTS_FIXTURE !== '1', 'Requires isolated Auth/Postgres account fixture.');
test.use({ actionTimeout: 15000 });
let harness: Awaited<ReturnType<typeof accountsHarness>>;
test.beforeEach(async ({ page }) => {
  harness = await accountsHarness();
  await page.addInitScript(() => sessionStorage.setItem('grind-intro-v1', '1'));
  await page.emulateMedia({ reducedMotion: 'reduce' });
});
test.afterEach(async () => { await harness?.close(); });
async function login(page: Page, email: string) {
  await page.goto('/'); await page.getByLabel('Correo electrónico').fill(email);
  await page.getByLabel('Contraseña', { exact: true }).fill('test-password-123');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Inicio', exact: true })).toBeVisible();
}
const nav = (page: Page, name: string) => page.getByRole('navigation', { name: 'Navegación principal' }).getByRole('button', { name, exact: true });
function workout(name: string, status: Workout['status'] = 'finished'): Workout {
  return { ...newWorkout(), name, status, date: '2026-10-20', startedAt: '2026-10-20T09:00:00Z', ...(status === 'finished' ? { finishedAt: '2026-10-20T10:00:00Z' } : {}),
    publication: { published: true }, notes: 'NOTA PRIVADA DE LA SESIÓN',
    exercises: [{ id: crypto.randomUUID(), ...exerciseSnapshot(CATALOG.find(e => e.id === 'press-banca-barra')!), notes: 'NOTA PRIVADA DEL EJERCICIO', sets: [{ ...newSet(), weight: 40, reps: 10, confirmed: true }] }] };
}
test('today and calendar starts preserve the intended date and make old archives usable', async ({ page }) => {
  const email = 'training-simplification@example.test';
  const exercise = { ...CATALOG.find(item => item.id === 'press-banca-barra')!, id: crypto.randomUUID(), name: 'Ejercicio antes archivado', archived: true };
  const routine = { id: crypto.randomUUID(), name: 'Rutina antes archivada', color: '#B8A0FF', archived: true,
    exercises: [{ id: crypto.randomUUID(), exerciseId: exercise.id, sets: 1, repsMin: 10, targetWeight: 40 }] };
  await harness.seed(email, undefined, { ...account('Atleta'), customExercises: [exercise], routines: [routine], preferences: { effects: false, sound: false } });
  await login(page, email);
  await nav(page, 'Entrenar').click();
  await page.getByRole('button', { name: 'Empezar entreno', exact: true }).click();
  await expect(page.getByLabel('Fecha', { exact: true })).toHaveCount(0);
  await page.getByLabel('Rutina', { exact: true }).selectOption(routine.id);
  await page.getByRole('button', { name: 'Empezar con esta rutina', exact: true }).click();
  await expect(page.locator('.exercise-card')).toContainText(exercise.name);
  await expect(page.getByRole('group', { name: /Tipo de serie/ })).toHaveCount(0);
  await expect(page.getByRole('switch', { name: /Superserie/ })).toHaveCount(0);
  await expect(page.getByText('Esfuerzo opcional', { exact: false })).toHaveCount(0);
  await page.getByText('Notas del ejercicio', { exact: true }).click();
  await page.getByLabel(`Notas de ${exercise.name}`, { exact: true }).fill('Mantener el control.');
  await expect(page.getByLabel(/Descanso del ejercicio/)).toHaveCount(0);
  await expect.poll(async () => ((await harness.account(email)).data as AppData).workouts[0]?.date).toBe(todayMadrid());

  const past = addDays(todayMadrid(), -1);
  await page.goto(`/#view=progress&tab=history&date=${past}`);
  await expect(page.getByText('No hay entrenamientos este día.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Crear entrenamiento', exact: false })).toHaveCount(0);
  const add = page.getByRole('button', { name: 'Añadir entrenamiento en este día', exact: true });
  await expect(add).toHaveCount(1);
  await expect(add).toHaveClass(/primary/);
  await add.click();
  await page.getByLabel('Rutina', { exact: true }).selectOption(routine.id);
  await page.getByLabel('Nombre', { exact: true }).fill('Sesión pasada');
  await page.getByRole('button', { name: 'Empezar con esta rutina', exact: true }).click();
  await page.getByRole('button', { name: 'Confirmar serie 1', exact: true }).click();
  await page.getByRole('button', { name: 'Guardar entrenamiento', exact: true }).click();
  await page.getByRole('dialog', { name: 'Finalizar entrenamiento' }).getByRole('button', { name: 'Guardar entrenamiento', exact: true }).click();
  await expect.poll(async () => ((await harness.account(email)).data as AppData).workouts.find(item => item.name === 'Sesión pasada')).toMatchObject({ date: past, status: 'finished' });
  const celebration = page.getByRole('button', { name: 'Continuar', exact: true });
  if (await celebration.isVisible()) await celebration.click();
  await expect(page.getByRole('button', { name: 'Publicar en Comunidad', exact: true })).toHaveClass(/primary/);
});

const account = (displayName: string, workouts: Workout[] = []): AppData => ({ ...emptyData(), workouts, personalProfile: { displayName, photo: null, bio: 'Cada rep cuenta.' } });

test('retrying a failed save and publish opens the editor with a single private session', async ({ page }) => {
  const email = 'retry-workout-publication@example.test';
  const draft = workout('Sesión para reintentar', 'draft');
  draft.publication = undefined;
  await harness.seed(email, undefined, account('Atleta', [draft]));
  await login(page, email);
  await page.goto(`/#view=editor&id=${draft.id}`);
  await page.evaluate(id => {
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (value, key) {
      const workouts = value?.draft?.data?.workouts as AppData['workouts'] | undefined;
      if (this.name === 'accounts' && workouts?.some(item => item.id === id && item.status === 'finished')) {
        const request = this.get(key!);
        this.transaction.abort();
        return request;
      }
      return key === undefined ? put.call(this, value) : put.call(this, value, key);
    };
    window.addEventListener('restore-test-storage', () => { IDBObjectStore.prototype.put = put; }, { once: true });
  }, draft.id);
  await page.getByRole('button', { name: 'Guardar entrenamiento', exact: true }).click();
  await page.getByRole('dialog', { name: 'Finalizar entrenamiento' }).getByRole('button', { name: 'Guardar y publicar', exact: true }).click();
  await expect(page.getByText('Cambios pendientes de guardar', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Publicación', exact: true })).toHaveCount(0);
  expect(((await harness.account(email)).data as AppData).workouts[0].status).toBe('draft');
  await page.evaluate(() => window.dispatchEvent(new Event('restore-test-storage')));
  await page.getByRole('button', { name: 'Reintentar guardado', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Publicación', exact: true })).toBeVisible();
  await expect.poll(async () => ((await harness.account(email)).data as AppData).workouts).toMatchObject([{ id: draft.id, status: 'finished', publication: { published: false } }]);
});

test('selecting a caption mention notifies the recipient once and opens the published workout', async ({ page, browser }) => {
  test.setTimeout(60000);
  const draft = workout('Entreno con Bruno', 'draft');
  const author = await harness.seed('mention-author@example.test', undefined, account('Ana', [draft]));
  const recipient = await harness.seed('mention-recipient@example.test', undefined, account('Bruno'));
  const { username } = await harness.social('mention-recipient@example.test');
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  try {
    const other = await context.newPage();
    await other.addInitScript(() => sessionStorage.setItem('grind-intro-v1', '1'));
    await login(other, 'mention-recipient@example.test');
    await login(page, 'mention-author@example.test');
    await page.goto(`/#view=editor&id=${draft.id}`);
    await page.getByRole('button', { name: 'Guardar entrenamiento', exact: true }).click();
    const finish = page.getByRole('dialog', { name: 'Finalizar entrenamiento', exact: true });
    await finish.getByRole('button', { name: 'Guardar y publicar', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Publicación', exact: true })).toBeVisible();
    await expect.poll(async () => ((await harness.account('mention-author@example.test')).data as AppData).workouts.filter(item => item.id === draft.id)).toMatchObject([{ status: 'finished', publication: { published: false } }]);
    const dialog = page.getByRole('main');
    const caption = dialog.getByRole('textbox', { name: /Descripción de la publicación/ });
    await caption.fill('Entrenando con @Bru');
    const suggestion = dialog.getByRole('option').filter({ hasText: `@${username}` });
    await expect(suggestion).toContainText('Bruno');
    await expect(suggestion.getByRole('img')).toBeVisible();
    await caption.press('ArrowDown');
    await expect(suggestion).toHaveAttribute('aria-selected', 'true');
    await caption.press('Enter');
    await expect(caption).toHaveValue(`Entrenando con @${username} `);
    await caption.fill(`Entrenando con @${username} y otra vez @${username}. @sin_cuenta`);
    await dialog.getByRole('button', { name: 'Publicar en Comunidad', exact: true }).click();
    await expect.poll(async () => ((await harness.account('mention-author@example.test')).data as AppData).workouts.find(item => item.id === draft.id)?.publication?.mentions).toEqual({ [username]: recipient.id });
    await other.getByRole('button', { name: /^Notificaciones/ }).click();
    const notice = other.locator('.notification-item').filter({ hasText: 'Ana te mencionó en una publicación.' });
    await expect(notice).toHaveCount(1);
    await expect(other.locator('.notification-item')).toHaveCount(1);
    await nav(page, 'Comunidad').click();
    const ownPost = page.locator('.feed-post').filter({ hasText: draft.name });
    const actions = ownPost.getByLabel(`Opciones de la publicación: ${draft.name}`);
    await actions.press('Enter');
    await ownPost.getByRole('button', { name: 'Editar post', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Publicación', exact: true })).toBeVisible();
    await caption.fill(`Actualizado con @${username} y otra vez @${username}. @sin_cuenta`);
    await dialog.getByRole('button', { name: 'Publicar en Comunidad', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Comunidad', exact: true })).toBeVisible();
    await expect(ownPost.locator('.feed-caption')).toContainText('Actualizado con');
    await notice.click();
    await expect(other).toHaveURL(new RegExp(`person=${author.id}.*workout=${draft.id}`));
    await expect(other.locator('.detail-hero h2')).toHaveText('Entreno con Bruno');
    await expect(other.getByLabel(`Opciones de la publicación: ${draft.name}`)).toHaveCount(0);
    const postCaption = other.locator('.feed-caption');
    await expect(postCaption.getByRole('link', { name: `@${username}`, exact: true })).toHaveCount(2);
    await expect(postCaption.getByRole('link', { name: '@sin_cuenta' })).toHaveCount(0);
    await expect(postCaption).toContainText('@sin_cuenta');
    await postCaption.getByRole('link', { name: `@${username}`, exact: true }).first().click();
    await expect(other).toHaveURL(new RegExp(`person=${recipient.id}`));
    await expect(other.getByRole('heading', { name: 'Bruno', exact: true })).toBeVisible();
  } finally { await context.close(); }
});

test('global feed paginates real rows, persists likes/comments, opens profiles and respects private direct links', async ({ page, context }) => {
  test.setTimeout(150000);
  const posts = Array.from({ length: 23 }, (_, i) => workout(`Entrenamiento publicado ${i + 1}`));
  const hidden = { ...workout('Entrenamiento privado'), publication: { published: false } };
  const legacy = workout('Entrenamiento histórico privado'); delete legacy.publication;
  const author = await harness.seed('feed-author@example.test', undefined, account('Atleta Feed', [...posts, hidden, legacy]));
  await harness.seed('feed-viewer@example.test', undefined, account('Persona Lectora'));
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  const cursors: unknown[] = [];
  page.on('request', request => { if (request.url().endsWith('/rpc/cheesit_read_feed')) cursors.push(request.postDataJSON().p_before); });
  await login(page, 'feed-viewer@example.test'); await nav(page, 'Comunidad').click();
  await expect(page.locator('.feed-post')).toHaveCount(20);
  await expect(page.locator('.feed-post-header time').first()).toHaveText('20/10/26');
  await expect(page.getByText('NOTA PRIVADA DE LA SESIÓN', { exact: true })).toHaveCount(0);
  await expect(page.getByText('NOTA PRIVADA DEL EJERCICIO', { exact: true })).toHaveCount(0);
  await page.locator('.feed-post').last().scrollIntoViewIfNeeded();
  await expect(page.locator('.feed-post')).toHaveCount(23);
  expect(cursors.some(Boolean)).toBe(true);
  expect(new Set(await page.locator('.feed-post').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-post-id')))).size).toBe(23);
  await expect(page.locator('.feed-end')).toContainText('Estás al día');
  await expect(page.getByRole('heading', { name: 'Entrenamiento privado', exact: true })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Entrenamiento histórico privado', exact: true })).toHaveCount(0);
  await page.evaluate(() => window.scrollTo(0, 0));
  let post = page.locator('.feed-post').first();
  const firstTitle = await post.locator('h2').textContent();
  await post.getByRole('button', { name: 'Dar me gusta', exact: true }).click();
  await expect(post.getByRole('button', { name: 'Quitar me gusta', exact: true })).toBeEnabled();
  await page.reload(); post = page.locator('.feed-post').first();
  await expect(post.locator('h2')).toHaveText(firstTitle!);
  await expect(post.getByRole('button', { name: 'Quitar me gusta', exact: true })).toContainText('1');
  await post.getByRole('button', { name: 'Quitar me gusta', exact: true }).click();
  await expect(post.getByRole('button', { name: 'Dar me gusta', exact: true })).toContainText('0');
  await post.getByRole('button', { name: 'Dar me gusta', exact: true }).click();
  await expect(post.getByRole('button', { name: 'Quitar me gusta', exact: true })).toContainText('1');
  await post.getByRole('button', { name: '0 comentarios', exact: true }).click();
  await expect(post.getByPlaceholder('Escribe aquí un comentario', { exact: true })).toBeVisible();
  await post.getByLabel('Añade un comentario').fill('¡Buena sesión! Sigue así.');
  await post.screenshot({ path: 'artifacts/workout-feed/comment-composer.png', animations: 'disabled' });
  await post.getByRole('button', { name: 'Publicar comentario', exact: true }).click();
  await expect(post.locator('.feed-comment-list')).toContainText('¡Buena sesión! Sigue así.');
  await expect(post.locator('.feed-comment-list time').first()).toHaveText(/^\d{2}\/\d{2}\/\d{2}$/);
  await page.reload(); post = page.locator('.feed-post').first();
  await post.getByRole('button', { name: '1 comentarios', exact: true }).click();
  await expect(post.locator('.feed-comment-list')).toContainText('¡Buena sesión! Sigue así.');
  page.once('dialog', dialog => void dialog.accept());
  await post.getByRole('button', { name: 'Eliminar mi comentario', exact: true }).click();
  await expect(post.getByRole('button', { name: '0 comentarios', exact: true })).toBeVisible();
  await page.reload(); post = page.locator('.feed-post').first();
  await post.getByRole('button', { name: '0 comentarios', exact: true }).click();
  await expect(post.locator('.feed-comment-list li')).toHaveCount(0);
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  // Exercise the real clipboard fallback without opening the operating system share sheet.
  await page.evaluate(() => Object.defineProperty(navigator, 'share', { configurable: true, value: undefined }));
  await post.getByRole('button', { name: 'Compartir entrenamiento', exact: true }).click();
  await expect(post.getByText('Enlace copiado.', { exact: true })).toBeVisible();
  const sharedLink = await page.evaluate(() => navigator.clipboard.readText());
  expect(sharedLink).toContain(`person=${author.id}`);
  expect(sharedLink).toContain('workout=');
  await page.goto(sharedLink);
  await expect(page.locator('.detail-hero h2')).toHaveText(firstTitle!);
  await expect(page.locator('main')).not.toContainText('NOTA PRIVADA');
  await page.getByRole('button', { name: 'Ver perfil de Atleta Feed', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Atleta Feed', exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Publicaciones del perfil' })).toBeVisible();
  await expect(page.locator('.feed-post')).toHaveCount(20);
  await page.locator('.feed-post').last().scrollIntoViewIfNeeded();
  await expect(page.locator('.feed-post')).toHaveCount(23);
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 960 });
    await page.evaluate(() => window.scrollTo(0, 0));
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `artifacts/workout-feed/profile-${width}.png`, fullPage: false, animations: 'disabled' });
  }
  await page.goto(`/#view=social&person=${author.id}&workout=${hidden.id}`);
  await expect(page.getByRole('heading', { name: 'Entrenamiento no disponible.', exact: true })).toBeVisible();
  await harness.setPublic('feed-author@example.test', false);
  await page.goto(sharedLink);
  await expect(page.getByRole('heading', { name: 'Entrenamiento no disponible.', exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test('finish saves public/photo and private sessions, settings owns privacy, and training/calendar work on both layouts', async ({ page, browser }) => {
  test.setTimeout(150000);
  const visibleDraft = workout('Sesión con foto', 'draft'); delete visibleDraft.publication;
  const privateDraft = workout('Sesión guardada en privado', 'draft'); delete privateDraft.publication;
  const author = await harness.seed('finish-author@example.test', undefined, account('Autora Foto', [visibleDraft, privateDraft]));
  await harness.seed('finish-viewer@example.test', undefined, account('Visita Foto'));
  await login(page, 'finish-author@example.test');
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 960 });
    await nav(page, 'Entrenar').click();
    await expect(page.getByRole('heading', { name: 'Entrenar', exact: true })).toBeVisible();
    await expect(page.getByRole('group', { name: 'Apartados de Entrenar' }).getByRole('button')).toHaveText(['Empezar entreno', 'Mis rutinas', 'Planes de entrenamiento', 'Catálogo de ejercicios']);
    await expect(page.getByRole('navigation', { name: 'Navegación principal' }).getByRole('button')).toHaveText(['Inicio', 'Comunidad', 'Entrenar', 'Progreso', 'Arcade']);
    await nav(page, 'Progreso').click();
    await expect(page.getByRole('heading', { name: 'Calendario', exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `artifacts/workout-feed/progress-${width}.png`, fullPage: false, animations: 'disabled' });
  }
  await page.goto(`/#view=editor&id=${visibleDraft.id}`);
  await page.getByRole('button', { name: 'Guardar entrenamiento', exact: true }).click();
  const confirm = page.getByRole('dialog', { name: 'Finalizar entrenamiento', exact: true });
  await confirm.getByRole('button', { name: 'Guardar entrenamiento', exact: true }).click();
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  await page.getByRole('button', { name: 'Publicar en Comunidad', exact: true }).click();
  const dialog = page.getByRole('main');
  await expect(dialog.getByRole('switch', { name: 'Publicar en Comunidad', exact: true })).toHaveAttribute('aria-checked', 'true');
  await dialog.getByLabel(/Descripción de la publicación/).fill('Hoy tocaba darlo todo.\nUn paso más. 💪');
  const image = await page.evaluate(() => { const canvas = document.createElement('canvas'); canvas.width = 1600; canvas.height = 1000; const context = canvas.getContext('2d')!; context.fillStyle = '#b8a0ff'; context.fillRect(0, 0, canvas.width, canvas.height); return canvas.toDataURL('image/png').split(',')[1]; });
  const photo = { name: 'entreno.png', mimeType: 'image/png', buffer: Buffer.from(image, 'base64') };
  await dialog.getByLabel('Foto del entrenamiento', { exact: true }).setInputFiles(photo);
  await expect(dialog.getByAltText('Vista previa de la foto del entrenamiento')).toBeVisible();
  await dialog.getByRole('button', { name: 'Quitar foto', exact: true }).click();
  await expect(dialog.getByAltText('Vista previa de la foto del entrenamiento')).toHaveCount(0);
  await dialog.getByLabel('Foto del entrenamiento', { exact: true }).setInputFiles(photo);
  await expect(dialog.getByAltText('Vista previa de la foto del entrenamiento')).toBeVisible();
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 960 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `artifacts/workout-feed/finish-dialog-${width}.png`, fullPage: false, animations: 'disabled' });
  }
  await dialog.getByRole('button', { name: 'Publicar en Comunidad', exact: true }).click();
  await expect(page.getByText('Publicación guardada.', { exact: true })).toBeVisible();
  const saved = ((await harness.account('finish-author@example.test')).data as AppData).workouts.find(item => item.id === visibleDraft.id)!;
  expect(saved.publication?.published).toBe(true); expect(saved.publication?.photoPath).toContain(author.id);
  expect(saved.publication?.caption).toBe('Hoy tocaba darlo todo.\nUn paso más. 💪');
  await page.goto(`/#view=editor&id=${privateDraft.id}`);
  await page.getByRole('button', { name: 'Guardar entrenamiento', exact: true }).click();
  await confirm.getByRole('button', { name: 'Guardar entrenamiento', exact: true }).click();
  await expect(page.getByText('Entrenamiento guardado.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  await expect.poll(async () => ((await harness.account('finish-author@example.test')).data as AppData).workouts.find(item => item.id === privateDraft.id)?.publication?.published).toBe(false);
  await page.getByLabel('Menú de perfil', { exact: true }).click(); await page.getByRole('button', { name: 'Mi perfil', exact: true }).click();
  await expect(page.getByRole('switch', { name: 'Perfil público', exact: true })).toHaveCount(0);
  await page.getByLabel('Menú de perfil', { exact: true }).click(); await page.getByRole('group', { name: 'Opciones de perfil' }).getByRole('button', { name: 'Ajustes', exact: true }).click();
  await expect(page.getByRole('switch', { name: 'Perfil público', exact: true })).toHaveAttribute('aria-checked', 'true');
  const viewerContext = await browser.newContext({ viewport: { width: 390, height: 844 } }); const viewer = await viewerContext.newPage();
  try {
    await viewer.addInitScript(() => sessionStorage.setItem('grind-intro-v1', '1'));
    await login(viewer, 'finish-viewer@example.test'); await nav(viewer, 'Comunidad').click();
    await expect(viewer.locator('.feed-post')).toHaveCount(1);
    await expect(viewer.getByAltText('Foto del entrenamiento de Autora Foto')).toBeVisible();
    await expect(viewer.locator('.feed-post h2')).toHaveText('Sesión con foto');
    await expect(viewer.locator('.feed-caption')).toContainText('Hoy tocaba darlo todo.');
    for (const width of [320, 390]) {
      await viewer.setViewportSize({ width, height: 844 });
      expect(await viewer.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      const photoBounds = await viewer.locator('.feed-photo').boundingBox();
      expect(photoBounds!.x).toBeCloseTo(0, 0);
      expect(photoBounds!.x + photoBounds!.width).toBeCloseTo(width, 0);
      await expect(viewer.locator('.feed-post')).toHaveCSS('border-radius', '0px');
      const controls = await viewer.locator('.feed-actions').boundingBox(), summary = await viewer.locator('.feed-post-summary').boundingBox();
      expect(controls!.y + controls!.height).toBeLessThanOrEqual(summary!.y + 1);
      await viewer.screenshot({ path: `artifacts/workout-feed/feed-photo-${width}.png`, fullPage: false, animations: 'disabled' });
    }
    await viewer.screenshot({ path: 'artifacts/workout-feed/feed-photo-mobile.png', fullPage: false, animations: 'disabled' });
    const auth = harness.confirm('finish-viewer@example.test');
    const url = `http://127.0.0.1:${process.env.CHEESIT_ACCOUNTS_PORT ?? '55440'}/storage/v1/object/workout-photos/${saved.publication!.photoPath}`;
    expect((await viewer.request.get(url, { headers: { authorization: `Bearer ${auth.access_token}` } })).status()).toBe(200);
    await page.getByRole('switch', { name: 'Perfil público', exact: true }).click();
    await expect(page.getByRole('switch', { name: 'Perfil público', exact: true })).toHaveAttribute('aria-checked', 'false');
    await viewer.reload(); await expect(viewer.locator('.feed-post')).toHaveCount(0);
    expect((await viewer.request.get(url, { headers: { authorization: `Bearer ${auth.access_token}` } })).status()).toBe(400);
    await viewer.goto(`/#view=social&person=${author.id}&workout=${privateDraft.id}`);
    await expect(viewer.getByRole('heading', { name: 'Entrenamiento no disponible.', exact: true })).toBeVisible();
  } finally { await viewerContext.close(); }
});

test('training starts real routines and split progression survives reload with a formerly archived routine', async ({ page }) => {
  test.setTimeout(120000);
  const routines = ['Rutina A', 'Rutina B'].map(name => ({ id: crypto.randomUUID(), name, color: '#B8A0FF', archived: name === 'Rutina B', exercises: [{ id: crypto.randomUUID(), exerciseId: 'press-banca-barra', sets: 1, repsMin: 10, repsMax: 10, targetWeight: 40 }] }));
  await harness.seed('split-author@example.test', undefined, { ...account('Persona Split'), routines });
  await login(page, 'split-author@example.test'); await nav(page, 'Entrenar').click();
  await page.getByRole('button', { name: 'Empezar entreno', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Empezar entreno', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Volver', exact: true }).click();
  await nav(page, 'Entrenar').click();
  await page.getByRole('button', { name: 'Mis rutinas', exact: true }).click();
  const routineBox = await page.locator('.routine-list').boundingBox(), createBox = await page.getByRole('button', { name: 'Crear rutina', exact: true }).boundingBox();
  expect(createBox!.y).toBeGreaterThanOrEqual(routineBox!.y + routineBox!.height);
  await expect(page.locator('.routine-list .routine-card')).toHaveCount(2);
  await expect(page.getByRole('button', { name: 'Archivar Rutina B', exact: true })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Archivadas', exact: true })).toHaveCount(0);
  await nav(page, 'Entrenar').click();
  await page.getByRole('button', { name: 'Planes de entrenamiento', exact: true }).click();
  await page.getByRole('button', { name: '＋ Crear split', exact: true }).click();
  await page.getByLabel('Nombre del split', { exact: true }).fill('Alternar A y B');
  await page.getByRole('combobox', { name: 'Añadir rutina', exact: true }).selectOption({ label: 'Rutina A' });
  await page.getByRole('combobox', { name: 'Añadir rutina', exact: true }).selectOption({ label: 'Rutina B' });
  await page.getByRole('button', { name: 'Guardar split', exact: true }).click();
  await expect(page.locator('.cycle-card')).toContainText('Próxima · Rutina A');
  await page.getByRole('button', { name: 'Iniciar próxima →', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Confirmar serie 1', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Confirmar serie 1', exact: true }).click();
  await page.getByRole('button', { name: 'Guardar entrenamiento', exact: true }).click();
  await page.getByRole('dialog', { name: 'Finalizar entrenamiento' }).getByRole('button', { name: 'Guardar entrenamiento', exact: true }).click();
  await expect(page.getByText('Entrenamiento guardado.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  await expect.poll(async () => ((await harness.account('split-author@example.test')).data as AppData).workouts.filter(item => item.status === 'finished').length).toBe(1);
  await nav(page, 'Entrenar').click();
  await page.getByRole('button', { name: 'Planes de entrenamiento', exact: true }).click();
  await expect(page.locator('.cycle-card')).toContainText('Próxima · Rutina B');
  await page.reload(); await expect(page.locator('.cycle-card')).toContainText('Próxima · Rutina B');
  const stored = (await harness.account('split-author@example.test')).data as AppData;
  expect(stored.training!.cycles[0].position).toBe(1);
  expect(stored.training!.cycles[0].completedWorkoutIds).toHaveLength(1);
  expect(stored.routines.map(routine => [routine.id, routine.archived])).toEqual(routines.map(routine => [routine.id, routine.archived]));
  await nav(page, 'Progreso').click();
  await expect(page.locator('.day.today')).toHaveAccessibleName(/1 entrenamiento/);
  await page.locator('.progress-calendar .list-row').first().filter({ hasText: 'Rutina A' }).click();
  await expect(page.locator('.detail-hero h2')).toHaveText('Rutina A');
  await page.getByRole('button', { name: 'Volver', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Calendario', exact: true })).toBeVisible();
  await page.goto('/#view=calendar&date=2026-10-20');
  await expect(page.getByRole('heading', { name: 'Progreso', exact: true })).toBeVisible();
  expect(page.url()).toContain('view=progress');
  await expect(page.locator('.calendar-title h2')).toContainText('octubre');
});
