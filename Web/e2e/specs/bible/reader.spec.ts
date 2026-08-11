import { test, expect } from '../../fixtures/app.fixture.js';

test('@bible Назад возвращает Word/HTML на прежнюю позицию', async ({ app, appPage: page }) => {
  await page.setViewportSize({ width:1100, height:620 });
  await page.goto(`${app.baseUrl}/page/page-grace`);
  await page.getByRole('button', { name:'Показать HTML' }).click();

  const frame = page.frameLocator('iframe.html-frame');
  await expect(frame.locator('body')).toBeVisible();
  await frame.locator('html').evaluate(element => {
    element.scrollTop = element.scrollHeight;
  });
  const scrollTop = await frame.locator('html').evaluate(element => element.scrollTop);
  expect(scrollTop).toBeGreaterThan(300);

  await frame.getByText('Ин 3:16', { exact:true }).last().click();
  await expect(page.locator('#bibleTextDialog')).toHaveAttribute('open', '');
  await page.getByRole('button', { name:'Открыть в Библии', exact:true }).click();
  await expect(page.locator('#content h2')).toHaveText('От Иоанна 3');

  await page.locator('.view-history-back').click();
  await expect(page.locator('#content h2')).toHaveText('Благодать и надежда');
  await expect(frame.locator('body')).toBeVisible();
  await expect.poll(async () => frame.locator('html').evaluate(element => element.scrollTop)).toBeCloseTo(scrollTop, 0);
});

test('@bible читатель открывает главу и переключается на следующую', async ({ app, appPage: page }) => {
  await page.goto(`${app.baseUrl}/bible/rst/43/1`);

  await expect(page.locator('#content h2')).toHaveText('От Иоанна 1');
  await expect(page.locator('#bible-verse-1-1 .bible-reader-verse-text')).toContainText('В начале было Слово');
  await expect(page.locator('.bible-reader-verse')).toHaveCount(3);

  await page.locator('.bible-reader-toolbar .bible-reader-nav-button').last().click();
  await expect(page.locator('#content h2')).toHaveText('От Иоанна 2');
  await expect(page).toHaveURL(/\/bible\/rst\/43\/2$/);
});

test('@bible повторный клик снимает выделение стиха, а HTML-сущности декодируются', async ({ app, appPage: page }) => {
  await page.goto(`${app.baseUrl}/bible/rst/43/1`);
  const verse = page.locator('#bible-verse-1-1');

  await verse.click();
  await expect(verse).toHaveClass(/selected/);
  await verse.click();
  await expect(verse).not.toHaveClass(/selected/);

  await expect(page.locator('#bible-verse-1-3 .bible-reader-verse-text')).toContainText('знак < не должен');
  await expect(page.locator('#bible-verse-1-3 .bible-reader-verse-text')).not.toContainText('&lt;');
});

test('@bible длинный контекст помещается в окно и клик по фону закрывает диалог', async ({ app, appPage: page }) => {
  await page.setViewportSize({ width:900, height:520 });
  await page.goto(`${app.baseUrl}/page/page-grace`);
  const references = page.locator('details.bible-page-refs');
  await references.locator('summary').click();
  await references.getByRole('button', { name:'Показать в контексте Ин 3:16' }).click();

  const dialog = page.locator('#bibleTextDialog');
  await expect(dialog).toHaveAttribute('open', '');
  await expect(page.locator('#bibleTextContent')).toContainText('Контекстный стих 21');
  const bounds = await dialog.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.height).toBeLessThanOrEqual(488);
  await expect.poll(() => page.locator('#bibleTextContent').evaluate(element => element.scrollHeight > element.clientHeight)).toBe(true);

  await dialog.evaluate(element => element.dispatchEvent(new MouseEvent('click', {
    bubbles:true,
    clientX:1,
    clientY:1
  })));
  await expect(dialog).not.toHaveAttribute('open', '');
});
