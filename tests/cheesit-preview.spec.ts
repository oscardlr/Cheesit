import { test } from '@playwright/test';
import { captureCheesits } from '../scripts/capture-cheesits';

test('capture isolated mobile, desktop, wardrobe and eight-cheesit animation preview', async ({ browser }) => {
  test.setTimeout(90000);
  await captureCheesits(browser);
});
