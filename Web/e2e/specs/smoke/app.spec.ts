import { test, expect } from '../../fixtures/app.fixture.js';
import { seeded } from '../../fixtures/seed-cache.js';

test('@smoke @notes приложение запускается и открывает заметку по прямой ссылке', async ({ app, appPage: page }) => {
  await page.goto(`${app.baseUrl}/page/${seeded.firstPageId}`);

  await expect(page.locator('#content h2')).toHaveText('Благодать и надежда');
  await expect(page.locator('#content .page-text')).toContainText('Воскресение даёт надежду и изменяет всё');
  await expect(page).toHaveURL(new RegExp(`/page/${seeded.firstPageId}$`));
});
