import { test, expect } from '../../fixtures/app.fixture.js';

for (const collapsed of [false, true]) {
  test(`@inductive скрытая разметка убирает панель наблюдений и её кнопку (${collapsed ? 'свёрнута' : 'открыта'})`, async ({ app, appPage: page }) => {
    await page.goto(`${app.baseUrl}/bible/rst/43/1`);
    const panel = page.locator('.inductive-observations-panel');
    const toggle = page.locator('.inductive-panel-toggle');
    await expect(panel).toBeVisible();
    const undo = page.locator('.inductive-undo-button');
    const redo = page.locator('.inductive-redo-button');
    await expect(undo).toBeVisible();
    await expect(redo).toBeVisible();
    if (collapsed) await toggle.click();
    await page.getByRole('button', { name:'Скрыть разметку', exact:true }).click();
    await expect(panel).toBeHidden();
    await expect(toggle).toHaveCount(0);
    await expect(undo).toBeHidden();
    await expect(redo).toBeHidden();
    const readerUsesFullWidth = () => page.locator('.inductive-reader-workspace').evaluate(element => {
      const main = element.querySelector('.inductive-reader-main');
      return main && Math.abs(element.getBoundingClientRect().width - main.getBoundingClientRect().width) <= 1;
    });
    await expect.poll(readerUsesFullWidth).toBe(true);
    await page.reload();
    await expect(page.getByRole('button', { name:'Показать разметку', exact:true })).toBeVisible();
    await expect(undo).toBeHidden();
    await expect(redo).toBeHidden();
    await expect(panel).toBeHidden();
    await expect(toggle).toHaveCount(0);
    await expect.poll(readerUsesFullWidth).toBe(true);
    await page.getByRole('button', { name:'Показать разметку', exact:true }).click();
    await expect(undo).toBeVisible();
    await expect(redo).toBeVisible();
    await expect(panel).toBeVisible();
    if (collapsed) await expect(panel).toHaveClass(/collapsed/);
    else await expect(panel).not.toHaveClass(/collapsed/);
    await expect(toggle).toBeVisible();
    await page.getByRole('button', { name:'Скрыть разметку', exact:true }).click();
    await page.getByRole('button', { name:'Включить режим разметки', exact:true }).click();
    await expect(undo).toBeVisible();
    await expect(redo).toBeVisible();
    await expect(panel).toBeVisible();
    await expect(toggle).toBeVisible();
    await expect(page.locator('.inductive-visibility-button')).toBeDisabled();
  });
}

test('@inductive скрытие разметки сохраняет многошаговую историю отмены и повтора отметок', async ({ app, appPage: page }) => {
  await page.goto(`${app.baseUrl}/bible/rst/43/1`);
  await page.getByRole('button', { name:'Включить режим разметки', exact:true }).click();
  for (const [verse, start, end] of [[1, 0, 8], [2, 9, 17]]) {
    await page.locator(`#bible-verse-1-${verse} .bible-reader-verse-text`).evaluate((element, offsets) => {
      const range = document.createRange();
      range.setStart(element.firstChild!, offsets.start);
      range.setEnd(element.firstChild!, offsets.end);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      element.dispatchEvent(new MouseEvent('mouseup', { bubbles:true }));
    }, { start, end });
    await page.locator('.inductive-popover-style').first().click();
    await expect(page.locator(`#bible-verse-1-${verse} .inductive-mark`)).toHaveCount(1);
  }
  await page.getByRole('button', { name:'Выключить режим разметки', exact:true }).click();
  const undo = page.locator('.inductive-undo-button');
  const redo = page.locator('.inductive-redo-button');
  const marks = page.locator('#content .inductive-mark');
  const hideAndShow = async () => {
    const undoState = { title:await undo.getAttribute('title'), enabled:await undo.isEnabled() };
    const redoState = { title:await redo.getAttribute('title'), enabled:await redo.isEnabled() };
    await page.getByRole('button', { name:'Скрыть разметку', exact:true }).click();
    await expect(undo).toBeHidden();
    await expect(redo).toBeHidden();
    await expect(marks).toHaveCount(0);
    await page.getByRole('button', { name:'Показать разметку', exact:true }).click();
    await expect(undo).toBeVisible();
    await expect(redo).toBeVisible();
    await expect(undo).toHaveAttribute('title', undoState.title!);
    await expect(redo).toHaveAttribute('title', redoState.title!);
    expect(await undo.isEnabled()).toBe(undoState.enabled);
    expect(await redo.isEnabled()).toBe(redoState.enabled);
  };
  await undo.click();
  await expect(marks).toHaveCount(1);
  await expect(undo).toBeEnabled();
  await expect(redo).toBeEnabled();
  await hideAndShow();
  await hideAndShow();
  await redo.click();
  await expect(marks).toHaveCount(2);
  await expect(redo).toBeDisabled();
  await hideAndShow();
  await undo.click();
  await expect(marks).toHaveCount(1);
  await undo.click();
  await expect(marks).toHaveCount(0);
  await expect(undo).toBeDisabled();
  await expect(redo).toBeEnabled();
  await hideAndShow();
  await redo.click();
  await expect(marks).toHaveCount(1);
  await redo.click();
  await expect(page.locator('#bible-verse-1-1 .inductive-mark')).toHaveText('В начале');
  await expect(page.locator('#bible-verse-1-2 .inductive-mark')).toHaveText('в начале');
  await expect(undo).toBeEnabled();
  await expect(redo).toBeDisabled();
});

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
