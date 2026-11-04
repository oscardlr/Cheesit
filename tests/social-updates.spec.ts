import { test, expect, type Page } from '@playwright/test';
import { accountsHarness } from './accounts-harness';
import { CATALOG } from '../src/lib/catalog';
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
  await page.goto('/');
  await page.getByLabel('Correo electrónico').fill(email);
  await page.getByLabel('Contraseña', { exact: true }).fill('test-password-123');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Resumen', exact: true })).toBeVisible();
}
const nav = (page: Page, name: string) => page.getByRole('navigation', { name: 'Navegación principal' }).getByRole('button', { name, exact: true });
async function menu(page: Page, name: string) {
  await page.getByLabel('Menú de perfil', { exact: true }).click();
  await page.getByRole('group', { name: 'Opciones de perfil' }).getByRole('button', { name, exact: true }).click();
}
function workout(name: string): Workout {
  return { ...newWorkout(), name, status: 'finished', date: '2026-10-20', startedAt: '2026-10-20T09:00:00Z', finishedAt: '2026-10-20T10:00:00Z', publication: { published: true },
    exercises: [{ id: crypto.randomUUID(), ...exerciseSnapshot(CATALOG.find(exercise => exercise.id === 'press-banca-barra')!), sets: [{ ...newSet(), weight: 40, reps: 10, confirmed: true }] }] };
}
const account = (displayName: string, workouts: Workout[] = []): AppData => ({ ...emptyData(), workouts, personalProfile: { displayName, photo: null, bio: 'Mi biografía se conserva.' } });

test('feed tabs filter followed people on the server and interaction notifications open the post owner rather than the actor', async ({ page, browser }) => {
  test.setTimeout(90000);
  const followedPost = workout('Entreno de la persona seguida'), strangerPost = workout('Entreno de una persona nueva');
  const author = await harness.seed('updates-author@example.test', undefined, account('Atleta Seguido', [followedPost]));
  await harness.seed('updates-stranger@example.test', undefined, account('Atleta Nuevo', [strangerPost]));
  const viewer = await harness.seed('updates-viewer@example.test', undefined, account('Persona Lectora'));
  const requests: { p_following?: boolean }[] = [];
  page.on('request', request => { if (request.url().endsWith('/rpc/cheesit_read_feed')) requests.push(request.postDataJSON()); });
  await login(page, 'updates-viewer@example.test'); await nav(page, 'Feed').click();
  await expect(page.getByRole('tab', { name: 'Para ti', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tab', { name: 'Siguiendo', exact: true })).toBeVisible();
  await expect(page.locator('.feed-post')).toHaveCount(2);
  await expect(page.getByRole('heading', { name: strangerPost.name, exact: true })).toBeVisible();
  await expect(page.locator('.screen-feed .app-content > .home-header')).toHaveCount(0);
  await expect(page.getByText('Entrenamientos, esfuerzo y comunidad.', { exact: true })).toHaveCount(0);
  await expect(page.getByText('CADA REP CONECTA.', { exact: true })).toHaveCount(0);
  await page.getByRole('tab', { name: 'Siguiendo', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Todavía no hay publicaciones de las personas a las que sigues.', exact: true })).toBeVisible();
  await expect(page.locator('.feed-post')).toHaveCount(0);
  expect(requests.some(request => request.p_following === true)).toBe(true);
  await page.getByRole('tab', { name: 'Para ti', exact: true }).click();
  const post = page.locator('.feed-post').filter({ has: page.getByRole('heading', { name: followedPost.name, exact: true }) });
  await post.getByRole('button', { name: 'Ver perfil de Atleta Seguido', exact: true }).click();
  await page.getByRole('button', { name: 'Seguir', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Dejar de seguir', exact: true })).toBeVisible();
  await nav(page, 'Feed').click();
  await page.getByRole('tab', { name: 'Siguiendo', exact: true }).click();
  await expect(page.locator('.feed-post')).toHaveCount(1);
  await expect(page.locator('.feed-post h2')).toHaveText(followedPost.name);
  await expect(page.getByRole('heading', { name: strangerPost.name, exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Actualizar publicaciones', exact: true }).click();
  await expect(page.locator('.feed-post')).toHaveCount(1);
  await page.locator('.feed-post').getByRole('button', { name: 'Dar me gusta', exact: true }).click();
  await expect(page.locator('.feed-post').getByRole('button', { name: 'Quitar me gusta', exact: true })).toContainText('1');
  // An unlike/relike must not issue a second notification for the same actor/post.
  await page.locator('.feed-post').getByRole('button', { name: 'Quitar me gusta', exact: true }).click();
  await page.locator('.feed-post').getByRole('button', { name: 'Dar me gusta', exact: true }).click();
  await expect(page.locator('.feed-post').getByRole('button', { name: 'Quitar me gusta', exact: true })).toContainText('1');
  await page.locator('.feed-post').getByRole('button', { name: '0 comentarios', exact: true }).click();
  await page.getByLabel('Añade un comentario', { exact: true }).fill('Buen entrenamiento desde Siguiendo.');
  await page.getByRole('button', { name: 'Publicar comentario', exact: true }).click();
  await expect(page.locator('.feed-comment-list')).toContainText('Buen entrenamiento desde Siguiendo.');
  await page.screenshot({ path: 'artifacts/social-updates/following-mobile.png', fullPage: false, animations: 'disabled' });
  const authorContext = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  const authorPage = await authorContext.newPage();
  try {
    await authorPage.addInitScript(() => sessionStorage.setItem('grind-intro-v1', '1'));
    await login(authorPage, 'updates-author@example.test');
    const response = authorPage.waitForResponse(value => value.url().endsWith('/rpc/cheesit_read_notifications') && value.status() === 200);
    await authorPage.getByRole('button', { name: /^Notificaciones/ }).click();
    const payload = await (await response).json() as { items: { kind: string; actor_id: string; workout_owner: string | null; workout_id: string | null }[] };
    const interactions = payload.items.filter(item => item.kind === 'like' || item.kind === 'comment');
    expect(interactions.map(item => item.kind).sort()).toEqual(['comment', 'like']);
    expect(interactions.every(item => item.actor_id === viewer.id && item.workout_owner === author.id && item.workout_id === followedPost.id)).toBe(true);
    await expect(authorPage.locator('.notification-item').filter({ hasText: 'le ha dado me gusta a tu publicación' })).toHaveCount(1);
    await expect(authorPage.locator('.notification-item').filter({ hasText: 'ha comentado en tu publicación' })).toHaveCount(1);
    await authorPage.screenshot({ path: 'artifacts/social-updates/interaction-notifications-desktop.png', fullPage: false, animations: 'disabled' });
    await authorPage.locator('.notification-item').filter({ hasText: 'le ha dado me gusta a tu publicación' }).click();
    await expect(authorPage.locator('.detail-hero h2')).toHaveText(followedPost.name);
    expect(authorPage.url()).toContain(`person=${author.id}`);
    expect(authorPage.url()).toContain(`workout=${followedPost.id}`);
    await authorPage.getByRole('button', { name: 'Volver', exact: true }).click();
    await expect(authorPage.getByRole('heading', { name: 'Notificaciones', exact: true })).toBeVisible();
    await authorPage.locator('.notification-item').filter({ hasText: 'ha comentado en tu publicación' }).click();
    await expect(authorPage.locator('.detail-hero h2')).toHaveText(followedPost.name);
    expect(authorPage.url()).toContain(`person=${author.id}`);
    await authorPage.reload();
    await expect(authorPage.locator('.detail-hero h2')).toHaveText(followedPost.name);
  } finally { await authorContext.close(); }
});

test('gym settings persist in the account and appear above the biography on own and other profiles', async ({ page, browser }) => {
  test.setTimeout(90000);
  const owner = await harness.seed('gym-owner@example.test', undefined, account('Persona Gimnasio'));
  await harness.seed('gym-viewer@example.test', undefined, account('Visita Gimnasio'));
  await login(page, 'gym-owner@example.test'); await menu(page, 'Ajustes');
  await page.getByLabel('Gimnasio', { exact: true }).fill('Gimnasio Marte');
  await page.getByRole('button', { name: 'Guardar gimnasio', exact: true }).click();
  await expect(page.getByText('Gimnasio guardado.', { exact: true })).toBeVisible();
  expect(((await harness.account('gym-owner@example.test')).data as AppData).personalProfile?.gym).toBe('Gimnasio Marte');
  await page.reload();
  await expect(page.getByLabel('Gimnasio', { exact: true })).toHaveValue('Gimnasio Marte');
  await page.screenshot({ path: 'artifacts/social-updates/gym-settings-mobile.png', fullPage: false, animations: 'disabled' });
  await menu(page, 'Mi perfil');
  await expect(page.locator('.profile-gym')).toHaveText('Gimnasio Marte');
  await expect(page.locator('.profile-gym + .profile-bio')).toHaveText('Mi biografía se conserva.');
  await expect(page.getByLabel('Gimnasio', { exact: true })).toHaveCount(0);
  const otherContext = await browser.newContext({ viewport: { width: 390, height: 1000 }, reducedMotion: 'reduce' });
  const other = await otherContext.newPage();
  try {
    await other.addInitScript(() => sessionStorage.setItem('grind-intro-v1', '1'));
    await login(other, 'gym-viewer@example.test');
    await other.goto(`/#view=social&person=${owner.id}`);
    await expect(other.getByRole('heading', { name: 'Persona Gimnasio', exact: true })).toBeVisible();
    await expect(other.locator('.profile-gym')).toHaveText('Gimnasio Marte');
    await expect(other.locator('.profile-gym + .profile-bio')).toHaveText('Mi biografía se conserva.');
    await expect(other).toHaveURL(new RegExp(`view=social&person=${owner.id}`));
    await other.reload();
    await expect(other).toHaveURL(new RegExp(`view=social&person=${owner.id}`));
    await expect(other.locator('.profile-gym')).toHaveText('Gimnasio Marte');
    for (const width of [320, 390, 1440]) {
      await other.setViewportSize({ width, height: 1000 });
      expect(await other.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await other.screenshot({ path: `artifacts/social-updates/gym-profile-${width}.png`, fullPage: false, animations: 'disabled' });
    }
    await menu(page, 'Ajustes');
    await page.getByLabel('Gimnasio', { exact: true }).fill('');
    await page.getByRole('button', { name: 'Guardar gimnasio', exact: true }).click();
    await expect(page.getByText('Gimnasio eliminado del perfil.', { exact: true })).toBeVisible();
    await other.reload(); await expect(other.locator('.profile-gym')).toHaveCount(0);
    await expect(other.locator('.profile-bio')).toHaveText('Mi biografía se conserva.');
  } finally { await otherContext.close(); }
});
