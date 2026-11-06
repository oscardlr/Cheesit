import { devices, expect, test, type Page } from '@playwright/test';

test.use({ ...devices['Pixel 7'], viewport: { width: 390, height: 700 } });

const navigation = (page: Page) => page.getByRole('navigation', { name: 'Navegación principal' });
const scrollY = (page: Page) => page.evaluate(() => window.scrollY);

async function enter(page: Page) {
  await page.addInitScript(() => sessionStorage.setItem('grind-intro-v1', '1'));
  await page.goto('/');
  const guest = page.getByRole('button', { name: 'Continuar como invitado' });
  const home = page.getByRole('heading', { name: 'Inicio', exact: true });
  await expect(guest.or(home)).toBeVisible();
  if (await guest.isVisible()) await guest.tap();
  await expect(home).toBeVisible();
}

async function touchScroll(page: Page) {
  const cdp = await page.context().newCDPSession(page);
  return (x: number, y: number, distance: number) => cdp.send('Input.synthesizeScrollGesture', {
    x, y, yDistance: -distance, gestureSourceType: 'touch', preventFling: true, speed: 1200,
  });
}

test('mobile navigation hides down and returns on an upward scroll above the threshold', async ({ page }) => {
  await enter(page);
  const swipe = await touchScroll(page);
  const nav = navigation(page);
  await swipe(185, 505, 260);
  await expect.poll(() => scrollY(page)).toBeGreaterThan(100);
  await expect.poll(async () => (await nav.boundingBox())!.y).toBeGreaterThanOrEqual(700);

  const position = await scrollY(page);
  await page.evaluate(() => window.scrollBy(0, -3));
  await expect.poll(() => scrollY(page)).toBe(position - 3);
  await expect(nav).toHaveAttribute('data-scroll-hidden', '');
  await swipe(185, 355, -75);
  await expect.poll(async () => (await nav.boundingBox())!.y).toBeLessThan(700);
  expect(await scrollY(page)).toBeGreaterThan(35);
});

test('during a workout only the exercise list scrolls, even when mobile navigation changes', async ({ page }) => {
  await enter(page);
  await page.getByRole('button', { name: 'Empezar entreno', exact: true }).tap();
  await page.getByRole('button', { name: 'Empezar sin rutina', exact: true }).tap();
  const add = page.getByRole('button', { name: /Añadir ejercicio$/ });
  const picker = page.getByRole('dialog', { name: 'Añadir ejercicio' });
  const list = picker.getByRole('region', { name: 'Resultados de ejercicios' });
  await add.tap();
  await picker.getByRole('button', { name: /Press de banca con barra/i }).tap();
  await add.tap();
  await list.evaluate(async node => {
    await Promise.all(node.closest('.exercise-picker')!.getAnimations().map(animation => animation.finished));
  });

  const swipe = await touchScroll(page);
  const nav = navigation(page);
  const position = () => list.evaluate(node => node.scrollTop);
  const layout = () => Promise.all([
    picker.getByRole('heading', { name: 'Añadir ejercicio' }).boundingBox(),
    picker.getByRole('searchbox').boundingBox(),
    picker.getByRole('group', { name: 'Grupo muscular' }).boundingBox(),
    picker.getByRole('combobox', { name: 'Material', exact: true }).boundingBox(),
    picker.getByRole('button', { name: 'Crear ejercicio propio' }).boundingBox(),
  ]);
  const initial = await layout();
  const background = await scrollY(page);
  expect(background).toBeGreaterThan(0);
  const bounds = (await list.boundingBox())!;
  expect(bounds.height).toBeGreaterThan(120);
  const x = bounds.x + bounds.width / 2;
  const y = bounds.y + bounds.height / 2;

  await swipe(x, y, -140);
  expect(await position()).toBe(0);
  expect(await layout()).toEqual(initial);
  expect(await scrollY(page)).toBe(background);

  await swipe(x, y, 190);
  await expect.poll(position).toBeGreaterThan(90);
  await expect(nav).toHaveAttribute('data-scroll-hidden', '');
  const hiddenPosition = await position();
  await expect.poll(async () => (await nav.boundingBox())!.y).toBeGreaterThanOrEqual(700);
  expect(await position()).toBe(hiddenPosition);

  await swipe(x, y, -70);
  await expect.poll(async () => (await nav.boundingBox())!.y).toBeLessThan(700);
  expect(await position()).toBeGreaterThan(30);
  expect(await position()).toBeLessThan(hiddenPosition);
  expect(await layout()).toEqual(initial);

  const bottom = await list.evaluate(node => {
    node.scrollTop = node.scrollHeight;
    return node.scrollHeight - node.clientHeight;
  });
  await swipe(x, y, 160);
  expect(await position()).toBe(bottom);
  expect(await scrollY(page)).toBe(background);
  expect(await layout()).toEqual(initial);

  await picker.getByRole('searchbox').fill('press de banca con barra');
  await picker.getByRole('searchbox').blur();
  await expect(picker.getByRole('status')).toHaveText('1 ejercicio');
  expect(await list.evaluate(node => node.scrollHeight <= node.clientHeight)).toBe(true);
  await swipe(x, y, 150);
  await swipe(x, y, -150);
  expect(await position()).toBe(0);
  expect(await layout()).toEqual(initial);
  expect(await scrollY(page)).toBe(background);

  await picker.getByRole('button', { name: /^Ficha técnica/ }).tap();
  await expect(picker.getByRole('region', { name: /^Ficha:/ })).toBeVisible();
  await picker.getByRole('button', { name: 'Cerrar ficha' }).tap();
  await expect(picker.getByRole('searchbox')).toHaveValue('press de banca con barra');
  await picker.getByRole('button', { name: 'Cerrar', exact: true }).tap();
  expect(await scrollY(page)).toBe(background);
});
