import { test, expect } from '../../fixtures/app.fixture.js';

for (const searchMode of ['global', 'page'] as const) {
  test(`@sync @search поиск по стиху сохраняется после синхронизации заметки (${searchMode})`, async ({ app, appPage: page }) => {
    if (searchMode === 'global') {
      await page.locator('#search').fill('Ин 3:16');
      await page.locator('#tree .page-row').filter({ hasText:'Благодать и надежда' }).click();
      await expect(page.locator('.match-count')).toHaveText('1 / 3');
    } else {
      await page.goto(`${app.baseUrl}/page/page-grace`);
      const references = page.locator('details.bible-page-refs');
      await references.locator('summary').click();
      await references.getByRole('button', { name:'Показать, где в заметке используется Ин 3:16', exact:true }).click();
      await references.locator('summary').click();
      await expect(page.locator('.match-count')).toHaveText('1 / 2');
    }
    const expectedLinks = searchMode === 'global'
      ? ['Ин 3:14-16', 'Ин 3:16', 'Ин 3:16'] : ['Ин 3:16', 'Ин 3:16'];
    await page.getByRole('button', { name:'Показать HTML', exact:true }).click();
    const frame = page.frameLocator('#content iframe.html-frame');
    await expect(frame.locator('[data-onenote-target-match="true"]')).toHaveText(expectedLinks);

    // Keep the note unchanged to isolate the UI refresh from the data source.
    await page.route('**/api/sync', route => route.fulfill({
      status:route.request().method() === 'POST' ? 202 : 200,
      contentType:'application/json',
      body:JSON.stringify({
        status:'success', startedAt:'2026-10-25T10:00:00Z', finishedAt:'2026-10-25T10:00:01Z',
        result:{ pages:1, contentDownloaded:1, contentErrors:0, bibleRefsParseErrors:0 }
      })
    }));
    const reload = page.waitForResponse(response => new URL(response.url()).pathname === '/api/page');
    await page.locator('.title-sync').click();
    await reload;
    await expect(page.locator('.title-sync')).toBeEnabled();
    await expect(page.locator('.page-text .bible-reference-target')).toHaveText(expectedLinks);
    await expect(frame.locator('[data-onenote-target-match="true"]')).toHaveText(expectedLinks);
    await expect(page.locator('.match-count')).toHaveText(`1 / ${expectedLinks.length}`);
    await page.getByRole('button', { name:'Следующее совпадение', exact:true }).click();
    await expect(page.locator('.match-count')).toHaveText(`2 / ${expectedLinks.length}`);
    await expect(frame.locator('[data-onenote-target-match-current="true"]'))
      .toHaveAttribute('data-onenote-target-match-index', '1');
  });
}
