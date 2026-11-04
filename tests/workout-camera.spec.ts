import { test, expect, type Page } from '@playwright/test';
import { accountsHarness } from './accounts-harness';
import { CATALOG } from '../src/lib/catalog';
import { emptyData, exerciseSnapshot, newSet, newWorkout, type AppData } from '../src/lib/model';

test.skip(process.env.CHEESIT_ACCOUNTS_FIXTURE !== '1', 'Requires isolated Auth/PostgreSQL fixture.');
test.use({ actionTimeout: 15000, permissions: ['camera'], launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] } });
let harness: Awaited<ReturnType<typeof accountsHarness>>;
let draftId: string;

test.beforeEach(async ({ page }) => {
  harness = await accountsHarness();
  const draft = { ...newWorkout(), name: 'Foto desde la cámara', exercises: [{ id: crypto.randomUUID(), ...exerciseSnapshot(CATALOG[0]), sets: [{ ...newSet(), weight: 40, reps: 10, confirmed: true }] }] };
  draftId = draft.id;
  await harness.seed('camera@example.test', undefined, { ...emptyData(), preferences: { effects: false, sound: false }, personalProfile: { displayName: 'Cámara de prueba', photo: null, bio: '' }, workouts: [draft] });
  await page.addInitScript(() => {
    sessionStorage.setItem('grind-intro-v1', '1');
    const state = window as unknown as { cameraStreams: MediaStream[]; cameraConstraints: MediaStreamConstraints[] };
    state.cameraStreams = []; state.cameraConstraints = [];
    const get = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async constraints => {
      state.cameraConstraints.push(constraints ?? {});
      const stream = await get(constraints); state.cameraStreams.push(stream); return stream;
    };
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
});
test.afterEach(async () => { await harness?.close(); });
async function openFinish(page: Page) {
  await page.goto('/'); await page.getByLabel('Correo electrónico').fill('camera@example.test');
  await page.getByLabel('Contraseña', { exact: true }).fill('test-password-123');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Resumen', exact: true })).toBeVisible();
  await page.goto(`/#view=editor&id=${draftId}`);
  await page.getByRole('button', { name: 'Finalizar entrenamiento', exact: true }).click();
  return page.getByRole('dialog', { name: 'Finalizar entrenamiento', exact: true });
}
const stopped = (page: Page) => page.evaluate(() => (window as unknown as { cameraStreams: MediaStream[] }).cameraStreams.every(stream => stream.getTracks().every(track => track.readyState === 'ended')));

test('inline camera captures and retakes locally, uploads only on acceptance and persists the photo', async ({ page }) => {
  const dialog = await openFinish(page);
  expect(await page.evaluate(() => (window as unknown as { cameraConstraints: unknown[] }).cameraConstraints.length)).toBe(0);
  const uploads: string[] = [];
  page.on('request', request => { if (request.method() === 'POST' && request.url().includes('/storage/v1/object/')) uploads.push(request.url()); });
  await dialog.getByRole('button', { name: 'Hacer foto', exact: true }).click();
  const camera = dialog.getByRole('region', { name: 'Cámara del entrenamiento', exact: true });
  await expect(camera.getByRole('button', { name: 'Tomar foto', exact: true })).toBeEnabled();
  await expect(dialog.getByRole('button', { name: 'Guardar entrenamiento', exact: true })).toBeDisabled();
  expect(await page.evaluate(() => (window as unknown as { cameraConstraints: MediaStreamConstraints[] }).cameraConstraints.every(value => value.audio === false))).toBe(true);
  await page.screenshot({ path: 'artifacts/workout-feed/camera-live-390.png', animations: 'disabled' });
  await camera.getByRole('button', { name: 'Tomar foto', exact: true }).click();
  await expect(camera.getByAltText('Foto recién tomada')).toBeVisible();
  await expect.poll(() => stopped(page)).toBe(true);
  expect(uploads).toHaveLength(0);
  await camera.getByRole('button', { name: 'Repetir foto', exact: true }).click();
  await expect(camera.getByRole('button', { name: 'Tomar foto', exact: true })).toBeEnabled();
  await camera.getByRole('button', { name: 'Tomar foto', exact: true }).click();
  await expect(camera.getByAltText('Foto recién tomada')).toBeVisible();
  await page.screenshot({ path: 'artifacts/workout-feed/camera-review-390.png', animations: 'disabled' });
  await camera.getByRole('button', { name: 'Usar foto', exact: true }).click();
  await expect(dialog.getByAltText('Vista previa de la foto del entrenamiento')).toBeVisible();
  await expect(camera).toHaveCount(0);
  expect(uploads).toHaveLength(1);
  await expect.poll(() => stopped(page)).toBe(true);
  await expect(dialog.getByRole('button', { name: 'Guardar entrenamiento', exact: true })).toBeEnabled();
  await dialog.getByRole('button', { name: 'Guardar entrenamiento', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Resumen', exact: true })).toBeVisible();
  await expect.poll(async () => ((await harness.account('camera@example.test')).data as AppData).workouts.find(w => w.id === draftId)?.status).toBe('finished');
  const saved = ((await harness.account('camera@example.test')).data as AppData).workouts.find(w => w.id === draftId)!;
  expect(saved.publication?.photoPath).toMatch(/\.jpg$/);
  expect(saved.publication?.published).toBe(true);
});

test('closing camera or leaving finalization stops every track without losing the workout', async ({ page }) => {
  const dialog = await openFinish(page);
  await dialog.getByRole('button', { name: 'Hacer foto', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Tomar foto', exact: true })).toBeEnabled();
  await dialog.getByRole('button', { name: 'Cerrar cámara', exact: true }).click();
  await expect.poll(() => stopped(page)).toBe(true);
  await expect(dialog.getByRole('button', { name: 'Guardar entrenamiento', exact: true })).toBeEnabled();
  await dialog.getByRole('button', { name: 'Hacer foto', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Tomar foto', exact: true })).toBeEnabled();
  await dialog.getByRole('button', { name: 'Seguir entrenando', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect.poll(() => stopped(page)).toBe(true);
  await page.getByRole('button', { name: 'Finalizar entrenamiento', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Guardar entrenamiento', exact: true })).toBeEnabled();
  await expect(dialog.getByAltText('Vista previa de la foto del entrenamiento')).toHaveCount(0);
});

test('denied permission explains recovery and allows saving without a photo', async ({ page }) => {
  const dialog = await openFinish(page);
  await page.evaluate(() => { navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException('Permission denied', 'NotAllowedError')); });
  await dialog.getByRole('button', { name: 'Hacer foto', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('No tenemos permiso para usar la cámara');
  await expect(dialog.getByRole('button', { name: 'Usar cámara del dispositivo', exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Cerrar cámara', exact: true }).click();
  await dialog.getByRole('button', { name: 'Guardar entrenamiento', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Resumen', exact: true })).toBeVisible();
  await expect.poll(async () => ((await harness.account('camera@example.test')).data as AppData).workouts.find(w => w.id === draftId)?.status).toBe('finished');
  const saved = ((await harness.account('camera@example.test')).data as AppData).workouts.find(w => w.id === draftId)!;
  expect(saved.publication?.photoPath).toBeUndefined();
});

test('a permission request resolved after cancellation cannot leave the camera active', async ({ page }) => {
  const dialog = await openFinish(page);
  await page.evaluate(() => {
    const state = window as unknown as { lateStream: MediaStream; resolveCamera: () => void };
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 32;
    state.lateStream = canvas.captureStream();
    navigator.mediaDevices.getUserMedia = () => new Promise<MediaStream>(resolve => { state.resolveCamera = () => resolve(state.lateStream); });
  });
  await dialog.getByRole('button', { name: 'Hacer foto', exact: true }).click();
  await expect(dialog.getByText(/Abriendo cámara/)).toBeVisible();
  await dialog.getByRole('button', { name: 'Cerrar cámara', exact: true }).click();
  await page.evaluate(() => (window as unknown as { resolveCamera: () => void }).resolveCamera());
  await expect.poll(() => page.evaluate(() => (window as unknown as { lateStream: MediaStream }).lateStream.getTracks().every(track => track.readyState === 'ended'))).toBe(true);
  await expect(dialog.getByRole('button', { name: 'Guardar entrenamiento', exact: true })).toBeEnabled();
});
