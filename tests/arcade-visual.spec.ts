import { test, expect } from '@playwright/test';

test('the welcome uses the complete bench illustration without deforming it', async ({ page }) => {
  await page.goto('/');
  const athlete = page.locator('.arcade-intro .pixel-athlete-bench > .pixel-athlete-art');
  await expect(athlete).toBeVisible();
  await expect(athlete.locator('svg')).toHaveAttribute('preserveAspectRatio', 'xMidYMid meet');
  await expect(athlete.locator('image')).toHaveAttribute('href', '/assets/grind-athlete.png');
  await expect(athlete).toHaveCSS('animation-name', 'none');
  await expect(athlete).toHaveCSS('transform', 'none');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(athlete).toHaveCSS('animation-name', 'none');
});

test('arcade pages fit mobile, tablet and desktop and provide visual captures', async ({ page }, testInfo) => {
  test.setTimeout(90000);
  const browserErrors: string[] = [];
  page.on('pageerror', error => browserErrors.push(error.message));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Resumen' })).toBeVisible();
  await page.getByRole('button', { name: 'Cerrar bienvenida', exact: true }).click();
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: width >= 768 ? 1000 : 844 });
    await page.getByRole('button', { name: 'cheesit, ir al resumen', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Resumen' })).toBeVisible();
    let size = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, content: document.documentElement.scrollWidth }));
    expect(size.content, `Resumen fits ${width}px`).toBeLessThanOrEqual(size.viewport + 1);
    if (width === 390 || width === 1440) await page.screenshot({ path: testInfo.outputPath(`summary-${width}.png`), fullPage: true, animations: 'disabled' });
    await page.getByRole('button', { name: 'Créditos y cofres', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Zona arcade' })).toBeVisible();
    for (const label of ['Objetivos', 'Cuerpo', 'Cofres', 'Colección', 'Ascenso']) {
      await page.getByRole('tab', { name: label, exact: true }).click();
      await expect(page.getByRole('tabpanel')).toBeVisible();
      size = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, content: document.documentElement.scrollWidth }));
      if(size.content>size.viewport+1){
        const boxes=await page.locator('main *').evaluateAll(elements=>elements.map(element=>{const rect=element.getBoundingClientRect();const css=getComputedStyle(element);return{tag:element.tagName,className:element.getAttribute('class'),right:rect.right,width:rect.width,display:css.display,columns:css.gridTemplateColumns}}).filter(rect=>rect.right>document.documentElement.clientWidth+1&&rect.width>0).slice(-24));
        await testInfo.attach('horizontal-overflow',{body:JSON.stringify(boxes,null,2),contentType:'application/json'});
      }
      expect(size.content, `${label} fits ${width}px`).toBeLessThanOrEqual(size.viewport + 1);
      if ((width === 390 || width === 1440) && ['Cuerpo', 'Cofres', 'Ascenso'].includes(label)) await page.screenshot({ path: testInfo.outputPath(`${label.toLowerCase()}-${width}.png`), fullPage: true, animations: 'disabled' });
    }
  }
  expect(browserErrors).toEqual([]);
});
