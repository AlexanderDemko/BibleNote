import { test, expect } from '../../fixtures/app.fixture.js';

test('@notes дерево раскрывает блокнот, раздел и дочернюю страницу', async ({ appPage: page }) => {
  await page.locator('#tree > .tree-row').filter({ hasText: 'Учебный блокнот' }).click();
  await page.locator('#tree .section-row').filter({ hasText: 'Евангелие от Иоанна' }).click();

  const firstPage = page.locator('#tree .page-row').filter({ hasText: 'Благодать и надежда' });
  const secondPage = page.locator('#tree .page-row').filter({ hasText: 'Молитва учеников' });
  await expect(firstPage).toBeVisible();
  await expect(secondPage).toBeVisible();

  await secondPage.click();
  await expect(page.locator('#content h2')).toHaveText('Молитва учеников');
  await expect(page.locator('#content .page-text')).toContainText('сохраняли верность');
  await expect(page).toHaveURL(/\/page\/page-prayer$/);
});

test('@notes вкладка последних заметок открывает ранее просмотренную страницу', async ({ appPage: page }) => {
  await page.locator('#notesRecentView').click();
  const recentPage = page.locator('#tree .recent-page-row').filter({ hasText: 'Благодать и надежда' });
  await expect(recentPage).toBeVisible();
  await recentPage.click();
  await expect(page.locator('#content h2')).toHaveText('Благодать и надежда');
});

test('@notes раскрытая панель ссылок не дублирует ссылки и навигирует по абзацам', async ({ app, appPage: page }) => {
  await page.goto(`${app.baseUrl}/page/page-grace`);
  const references = page.locator('details.bible-page-refs');
  await expect(references.locator('summary')).toHaveText('Библейские ссылки: 2');
  await references.locator('summary').click();
  await expect(references.locator('.bible-chip')).toHaveText(['Ин 3:14-16', 'Ин 3:16']);

  await references.getByRole('button', { name:'Показать, где в заметке используется Ин 3:16' }).click();
  await expect(page.locator('.match-nav .match-count')).toHaveText('1 / 2');
  await page.getByRole('button', { name:'Следующее совпадение' }).click();
  await expect(page.locator('.match-nav .match-count')).toHaveText('2 / 2');
});

test('@notes повторный клик по активной заметке сохраняет DOM и раскрытые секции', async ({ app, appPage: page }) => {
  await page.goto(`${app.baseUrl}/page/page-grace`);
  const references = page.locator('details.bible-page-refs');
  await references.locator('summary').click();
  await page.evaluate(() => {
    const article = document.querySelector('#content article.page');
    if (article) article.setAttribute('data-e2e-preserved', 'true');
  });

  await page.locator('#notesRecentView').click();
  await page.locator('#tree .recent-page-row').filter({ hasText:'Благодать и надежда' }).click();

  await expect(page.locator('#content article.page')).toHaveAttribute('data-e2e-preserved', 'true');
  await expect(references).toHaveAttribute('open', '');
});

test('@notes текстовый и HTML-режимы используют одинаковую ширину без двойной прокрутки', async ({ app, appPage: page }) => {
  await page.setViewportSize({ width:1100, height:620 });
  await page.goto(`${app.baseUrl}/page/page-grace`);
  const textWidth = await page.locator('#content .page-text').evaluate(element => element.getBoundingClientRect().width);

  await page.getByRole('button', { name:'Показать HTML' }).click();
  const frame = page.locator('#content iframe.html-frame');
  await expect(frame).toBeVisible();
  const htmlWidth = await frame.evaluate(element => element.getBoundingClientRect().width);
  expect(Math.abs(textWidth - htmlWidth)).toBeLessThanOrEqual(2);
  await expect(page.locator('#contentScrollbar')).toBeHidden();

  const references = page.locator('details.bible-page-refs');
  await references.locator('summary').click();
  await expect(page.locator('#contentScrollbar')).toBeVisible();
  await expect.poll(() => page.locator('#content').evaluate(element => element.scrollHeight > element.clientHeight)).toBe(true);
});
