import { expect, test } from '@playwright/test';

// Keep the motion evidence as a playable local artifact, not just stills.
test.use({ video: 'on' });

for (const width of [390, 1440]) {
  test(`ascent stays registered while its light animates at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Resumen', exact: true })).toBeVisible();
    const closeWelcome = page.getByRole('button', { name: 'Cerrar bienvenida', exact: true });
    if (await closeWelcome.isVisible()) await closeWelcome.click();
    await page.getByRole('button', { name: 'Créditos y cofres', exact: true }).click();
    await page.getByRole('tab', { name: 'Ascenso', exact: true }).click();
    const scene = page.locator('.ascent-art > .pixel-athlete-climb');
    const art = scene.locator('.pixel-athlete-art');
    await expect(scene).toBeVisible();
    await scene.scrollIntoViewIfNeeded();
    await expect(art.locator('svg')).toHaveAttribute('preserveAspectRatio', 'xMidYMid meet');
    await expect(page.locator('.ascent-staircase, .ascent-chest')).toHaveCount(0);

    const geometry = await scene.boundingBox();
    const initialOpacity = await scene.evaluate(element => getComputedStyle(element, '::after').opacity);
    await expect.poll(() => scene.evaluate(element => getComputedStyle(element, '::after').opacity)).not.toBe(initialOpacity);
    for (let frame = 0; frame < 5; frame++) {
      await expect(scene).toHaveCSS('transform', 'none');
      await expect(scene).toHaveCSS('opacity', '1');
      await expect(art).toHaveCSS('transform', 'none');
      expect(await scene.boundingBox()).toEqual(geometry);
      await page.waitForTimeout(350);
    }
    const size = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, content: document.documentElement.scrollWidth }));
    expect(size.content).toBeLessThanOrEqual(size.viewport + 1);
    await page.screenshot({ path: testInfo.outputPath(`ascent-${width}.png`), fullPage: true });

    await page.emulateMedia({ reducedMotion: 'reduce' });
    expect(await scene.evaluate(element => getComputedStyle(element, '::after').animationName)).toBe('none');
    await expect(scene).toHaveCSS('transform', 'none');
    await expect(scene).toHaveCSS('opacity', '1');
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.getByRole('button', { name: 'Ajustes de Cheesit' }).click();
    await page.getByRole('switch', { name: 'Efectos y confeti', exact: true }).click();
    await page.getByRole('button', { name: 'Créditos y cofres', exact: true }).click();
    await page.getByRole('tab', { name: 'Ascenso', exact: true }).click();
    await expect(scene).toBeVisible();
    expect(await scene.evaluate(element => getComputedStyle(element, '::after').animationName)).toBe('none');
    await expect(scene).toHaveCSS('transform', 'none');
    await expect(scene).toHaveCSS('opacity', '1');
  });
}

test('ascent keeps a stable fallback if the source artwork fails', async ({ page }) => {
  await page.route('**/assets/grind-athlete.png', route => route.abort());
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Resumen', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Créditos y cofres', exact: true }).click();
  await page.getByRole('tab', { name: 'Ascenso', exact: true }).click();
  await expect(page.locator('.ascent-art [data-art-failed] .pixel-athlete-fallback')).toBeVisible();
  await expect(page.locator('.ascent-art > .pixel-athlete')).toHaveCSS('opacity', '1');
});
