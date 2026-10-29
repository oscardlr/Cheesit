import { expect, test } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { CHARACTER_MOTIONS } from '../src/lib/character-motion';

test.use({ video: 'on' });

for (const width of [390, 477, 1440]) {
  test(`registered gestures are visible, attached and controllable at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: width <= 760 ? 844 : 1000 });
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto('/dev/character');
    const workbench = page.locator('.inspection-workbench');
    const character = workbench.locator('.character-avatar');
    const assembly = character.locator('.character-layers');
    await workbench.getByRole('combobox', { name: 'Cabeza', exact: true }).selectOption('ronin-head');
    await workbench.getByRole('combobox', { name: 'Torso', exact: true }).selectOption('ronin-top');
    await workbench.getByRole('combobox', { name: 'Piernas', exact: true }).selectOption('ronin-bottom');
    await workbench.getByRole('combobox', { name: 'Mano', exact: true }).selectOption('titan-sword');
    await workbench.getByRole('combobox', { name: 'Espalda', exact: true }).selectOption('ronin-back');
    const report: Record<string, unknown> = {};

    for (const motion of CHARACTER_MOTIONS) {
      const button = page.getByRole('navigation', { name: 'Animaciones de inspección' }).getByRole('button', { name: motion.label, exact: true });
      await button.click();
      // Changing a mode must not scroll the animated character out of view.
      // Keep native button auto-scroll; do not rescue the test with a manual scroll.
      await expect(character).toBeInViewport({ ratio: .98 });
      await expect(button).toBeInViewport({ ratio: 1 });
      const [previewBounds, buttonBounds] = await Promise.all([workbench.locator('.inspection-live').boundingBox(), button.boundingBox()]);
      expect(previewBounds).not.toBeNull();
      expect(buttonBounds).not.toBeNull();
      if (width <= 760) expect(buttonBounds!.y).toBeGreaterThanOrEqual(previewBounds!.y + previewBounds!.height);
      if (motion.id === 'walk') await page.screenshot({ path: info.outputPath(`visible-controls-${width}.png`) });
      const first = await assembly.evaluate(element => getComputedStyle(element).transform);
      await expect.poll(() => assembly.evaluate(element => getComputedStyle(element).transform)).not.toBe(first);
      const samples = await assembly.evaluate(element => {
        const animation = element.getAnimations().find(item => (item.effect as KeyframeEffect | null)?.target === element)!;
        const duration = Number(animation.effect!.getTiming().duration);
        animation.pause();
        const values = [0, .12, .25, .38, .48, .5, .62, .65, .75, 1].map(progress => {
          animation.currentTime = duration * progress;
          const matrix = new DOMMatrix(getComputedStyle(element).transform);
          return {
            x: matrix.e, y: matrix.f,
            scaleX: Math.hypot(matrix.a, matrix.b), scaleY: Math.hypot(matrix.c, matrix.d),
            shear: matrix.a * matrix.c + matrix.b * matrix.d,
            independent: Array.from(element.querySelectorAll(':scope > svg')).map(layer => getComputedStyle(layer).transform),
          };
        });
        animation.currentTime = 0;
        animation.play();
        return values;
      });
      const xRange = Math.max(...samples.map(sample => sample.x)) - Math.min(...samples.map(sample => sample.x));
      const yRange = Math.max(...samples.map(sample => sample.y)) - Math.min(...samples.map(sample => sample.y));
      // These are visible screen-pixel ranges at the smallest workbench, not just
      // a changing CSS matrix. The old gestures only moved between 1 and 4 px.
      const minimum = { idle: 1.8, walk: 8, train: 7, victory: 10, power: 4 }[motion.id];
      expect(Math.max(xRange, yRange), `${motion.label} should show its complete gesture`).toBeGreaterThan(minimum);
      for (const sample of samples) {
        expect(Math.abs(sample.scaleX - 1)).toBeLessThan(.00001);
        expect(Math.abs(sample.scaleY - 1)).toBeLessThan(.00001);
        expect(Math.abs(sample.shear)).toBeLessThan(.00001);
        expect(sample.independent.every(transform => transform === 'none')).toBe(true);
      }
      report[motion.id] = { xRange, yRange };
      // Capture a full cycle in real time with its controls still on screen.
      const duration = await assembly.evaluate(element => Number(element.getAnimations()[0].effect!.getTiming().duration));
      await page.waitForTimeout(duration + 100);
    }
    await writeFile(info.outputPath('motion-screen-pixel-ranges.json'), JSON.stringify(report, null, 2));
    await info.attach('motion-screen-pixel-ranges', { body: JSON.stringify(report, null, 2), contentType: 'application/json' });

    await page.getByRole('button', { name: 'Pausar animación', exact: true }).click();
    await expect.poll(() => character.evaluate(element => element.getAnimations({ subtree: true }).length)).toBe(0);
    await expect(assembly).toHaveCSS('transform', 'none');
    await expect(page.getByRole('status').locator('.motion-feedback-active')).toHaveText('Animación en pausa.');
    await page.getByRole('button', { name: 'Reanudar animación', exact: true }).click();
    await expect.poll(() => assembly.evaluate(element => element.getAnimations().length)).toBe(1);

    await page.getByLabel('Efectos activados', { exact: true }).uncheck();
    await expect(assembly).toHaveCSS('transform', 'none');
    await expect(page.getByRole('status').locator('.motion-feedback-active')).toHaveText('Pose estática: los efectos están desactivados.');
    await page.getByLabel('Efectos activados', { exact: true }).check();
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expect.poll(() => character.evaluate(element => element.getAnimations({ subtree: true }).length)).toBe(0);
    await expect(assembly).toHaveCSS('transform', 'none');
    await expect(page.getByRole('status').locator('.motion-feedback-reduced')).toBeVisible();
    await workbench.screenshot({ path: info.outputPath(`motion-controls-${width}.png`), animations: 'disabled' });
  });
}
