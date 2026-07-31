import { test, expect } from '../../fixtures/app.fixture.js';

test('@inductive пометка создаётся через выделение и сохраняется после перезагрузки', async ({ app, appPage: page }) => {
  await page.goto(`${app.baseUrl}/bible/rst/43/1`);
  await expect(page.locator('#bible-verse-1-1 .bible-reader-verse-text')).toBeVisible();
  await page.locator('.inductive-mode-button').click();

  await page.locator('#bible-verse-1-1 .bible-reader-verse-text').evaluate(element => {
    const textNode = element.firstChild;
    if (!textNode) throw new Error('Verse text node is missing.');
    const range = document.createRange();
    range.setStart(textNode, 0);
    range.setEnd(textNode, 8);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  });

  await expect(page.locator('.inductive-selection-popover')).toBeVisible();
  await expect(page.locator('.inductive-popover-style[title="Вывод"]')).toHaveCount(1);
  await expect(page.locator('.inductive-popover-relation[data-type="conclusion"]')).toHaveCount(0);
  await page.locator('.inductive-popover-style').first().click();
  await expect(page.locator('#bible-verse-1-1 .inductive-mark')).toContainText('В начале');

  await page.reload();
  await expect(page.locator('#bible-verse-1-1 .inductive-mark')).toContainText('В начале');
  await expect(page.locator('.inductive-observation-row')).toHaveCount(1);
});

test('@inductive Escape закрывает палитру выбора отметки', async ({ app, appPage:page }) => {
  await page.goto(`${app.baseUrl}/bible/rst/43/1`);
  await page.locator('.inductive-mode-button').click();
  await page.locator('#bible-verse-1-1 .bible-reader-verse-text').evaluate(element => {
    const textNode = element.firstChild;
    if (!textNode) throw new Error('Verse text node is missing.');
    const range = document.createRange();
    range.setStart(textNode, 0);
    range.setEnd(textNode, 8);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    element.dispatchEvent(new MouseEvent('mouseup', { bubbles:true }));
  });

  await expect(page.locator('.inductive-selection-popover')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.inductive-selection-popover')).toBeHidden();
  expect(await page.evaluate(() => window.getSelection()?.isCollapsed)).toBe(true);
});
