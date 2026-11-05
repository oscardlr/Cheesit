import { createServer } from 'node:http';
import { once } from 'node:events';
import { test, expect, type Page } from '@playwright/test';

test.skip(process.env.PLAYWRIGHT_PRODUCTION !== '1', 'Offline caching is verified against a production build.');

async function prepare(page: Page) {
  await page.addInitScript(() => { sessionStorage.setItem('grind-intro-v1', '1'); sessionStorage.setItem('cheesit-access-mode', 'guest'); localStorage.setItem('entrenos-experience-v1', JSON.stringify({ effects: false, sound: false })); });
}
async function startDraft(page: Page, previousBuild = false) {
  if (previousBuild) {
    await page.locator('.topbar').getByRole('button', { name: 'Empezar entrenamiento', exact: true }).click();
    await page.getByRole('main').getByRole('button', { name: 'Empezar entrenamiento', exact: true }).click();
  } else {
    await page.getByRole('navigation', { name: 'Navegación principal' }).getByRole('button', { name: 'Entrenar', exact: true }).click();
    await page.getByRole('button', { name: 'Empezar entreno', exact: true }).click();
    await page.getByRole('main').getByRole('button', { name: 'Empezar sin rutina', exact: true }).click();
  }
  await page.getByRole('button', { name: /Añadir ejercicio/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: /Press de banca con barra/ }).click();
  await page.getByLabel('Carga en kg, serie 1 de Press de banca con barra').fill('12,5');
  await page.getByLabel('Repeticiones, serie 1 de Press de banca con barra').fill('0');
}
async function checkDraft(page: Page, expectedReps = '0') {
  const weight = page.getByLabel('Carga en kg, serie 1 de Press de banca con barra');
  const view = new URLSearchParams(new URL(page.url()).hash.slice(1)).get('view');
  if (view !== 'editor') await page.getByRole('button', { name: 'Continuar entreno', exact: true }).click();
  await expect(weight).toHaveValue('12,5');
  await expect(page.getByLabel('Repeticiones, serie 1 de Press de banca con barra')).toHaveValue(expectedReps);
  await expect(page.getByRole('button', { name: 'Confirmar serie 1', exact: true })).toBeEnabled();
}

test('verified offline shell recovers an incomplete decimal draft after offline startup', async ({ page, context }) => {
  test.setTimeout(60000);
  await prepare(page);
  await page.goto('/');
  await expect(page.locator('.offline-shell')).toContainText('Disponible sin conexión', { timeout: 30000 });
  await startDraft(page);
  await page.getByRole('navigation').getByRole('button', { name: 'Inicio', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Guardado en este navegador');
  await context.setOffline(true);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Inicio', exact: true })).toBeVisible();
  await checkDraft(page);
  const thumbnail = page.locator('.exercise-head img');
  await expect(thumbnail).toBeVisible();
  await expect.poll(() => thumbnail.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
  await expect(page.locator('.offline-shell')).toContainText('Disponible sin conexión');
  await context.setOffline(false);
  await expect(page.getByRole('status')).toContainText('Guardado en este navegador');
  // Cache eviction can leave an active registration behind; retry must rebuild it.
  await page.evaluate(async () => { for (const key of await caches.keys()) if (key.startsWith('cheesit-shell-')) await caches.delete(key); });
  await page.reload();
  await expect(page.getByRole('button', { name: 'Reintentar preparación', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Reintentar preparación', exact: true }).click();
  await expect(page.locator('.offline-shell')).toContainText('Disponible sin conexión', { timeout: 30000 });
  await context.setOffline(true);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await checkDraft(page);
});

test('a second production build waits for consent, flushes the latest draft and then starts offline', async ({ browser }, testInfo) => {
  test.setTimeout(90000);
  const previous = process.env.PLAYWRIGHT_UPDATE_BASE_URL;
  test.skip(!previous, 'Run scripts/verify-offline-builds.mjs to provide two actual production builds.');
  const current = String(testInfo.project.use.baseURL);
  const oldManifest = await (await fetch(`${previous}/offline-manifest.json`)).json() as { version: string };
  const newManifest = await (await fetch(`${current}/offline-manifest.json`)).json() as { version: string };
  expect(oldManifest.version).not.toBe(newManifest.version);
  let upstream = previous!;
  const proxy = createServer(async (request, response) => {
    try {
      const result = await fetch(new URL(request.url ?? '/', upstream));
      response.statusCode = result.status;
      result.headers.forEach((value, name) => { if (!['content-encoding', 'content-length', 'transfer-encoding', 'connection'].includes(name)) response.setHeader(name, value); });
      response.end(Buffer.from(await result.arrayBuffer()));
    } catch { response.statusCode = 502; response.end('Deployment fixture unavailable'); }
  });
  proxy.listen(0, '127.0.0.1');
  await once(proxy, 'listening');
  const address = proxy.address();
  if (!address || typeof address === 'string') throw new Error('No se pudo iniciar la prueba de actualización.');
  const context = await browser.newContext({ serviceWorkers: 'allow', viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  try {
    await prepare(page);
    await page.goto(`http://127.0.0.1:${address.port}`);
    await expect(page.locator('.offline-shell')).toContainText('Disponible sin conexión', { timeout: 30000 });
    await page.getByRole('navigation').getByRole('button', { name: 'Entrenar', exact: true }).click();
    await page.getByRole('button', { name: /Crear rutina/ }).click();
    await page.getByLabel('Nombre de la rutina').fill('Rutina protegida durante actualización');
    // The new deployment is discovered with unsaved routine changes in memory.
    upstream = current;
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(page.getByRole('button', { name: 'Guardar y actualizar', exact: true })).toBeVisible({ timeout: 30000 });
    console.info('Offline update: second build is verified and waiting.');
    await page.getByRole('button', { name: 'Guardar y actualizar', exact: true }).click();
    await expect(page.getByLabel('Nombre de la rutina')).toHaveValue('Rutina protegida durante actualización');
    await expect(page.getByText('Guarda o descarta los cambios antes de actualizar.', { exact: true })).toBeVisible();
    console.info('Offline update: dirty routine correctly prevented reload.');
    await page.getByRole('button', { name: 'Guardar rutina', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Entrenar', exact: true })).toBeVisible();
    console.info('Offline update: routine saved; preparing pending session.');
    await startDraft(page, true);
    // This change is intentionally made immediately before activation, inside the autosave debounce.
    await page.getByLabel('Repeticiones, serie 1 de Press de banca con barra').fill('1001');
    await page.getByRole('button', { name: 'Guardar y actualizar', exact: true }).click();
    await expect(page.locator('.offline-shell')).toContainText('Disponible sin conexión');
    await checkDraft(page, '1001');
    console.info('Offline update: latest draft survived activation and reload.');
    const cachesAfterUpdate = await page.evaluate(async () => caches.keys());
    expect(cachesAfterUpdate).toContain(`cheesit-shell-${newManifest.version}`);
    await expect(page.getByRole('status')).toContainText('Guardado en este navegador');
    await context.setOffline(true);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await checkDraft(page, '1001');
    await expect(page.locator('.offline-shell')).toContainText('Disponible sin conexión');
  } finally {
    await context.close();
    proxy.closeAllConnections();
    await new Promise<void>(resolve => proxy.close(() => resolve()));
  }
});
