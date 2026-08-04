import { test, expect } from '../../fixtures/app.fixture.js';
import { readScalar } from '../../fixtures/seed-cache.js';

test('@sync быстрый sync получает страницу из fake Graph и сохраняет её в кэш', async ({ app, appPage: page }) => {
  let quickSyncPayload: Record<string, unknown> | undefined;
  page.on('request', request => {
    if (request.method() === 'POST' && request.url().endsWith('/api/sync')) {
      quickSyncPayload = request.postDataJSON();
    }
  });
  await page.locator('#quickSync').click();

  await expect.poll(
    () => readScalar(app.dbPath, 'SELECT COUNT(*) FROM pages WHERE id = ?', 'page-from-sync'),
    { timeout: 20_000 }
  ).toBe(1);
  expect(quickSyncPayload?.incrementalMetadata).toBe(true);
  expect(quickSyncPayload).not.toHaveProperty('notebookIds');
  await expect.poll(
    () => readScalar(app.dbPath, 'SELECT content_text FROM pages WHERE id = ?', 'page-from-sync'),
    { timeout: 20_000 }
  ).toContain('детерминированным e2e-тестом');
  expect(readScalar(
    app.dbPath,
    'SELECT GROUP_CONCAT(parse_error, char(10)) FROM page_bible_parse_state WHERE parse_error IS NOT NULL'
  )).toBeNull();

  await expect(page.locator('#quickSync')).toBeEnabled({ timeout: 20_000 });
  await page.goto(`${app.baseUrl}/page/page-from-sync`);
  await expect(page.locator('#content h2')).toHaveText('Новая страница из OneNote');
  await expect(page.locator('#content .page-text')).toContainText('детерминированным e2e-тестом');
});

test('@sync интерфейс показывает этапы, детали и понятный итог синхронизации', async ({ appPage: page }) => {
  let getCount = 0;
  await page.route('**/api/sync', async route => {
    if (route.request().method() === 'POST') {
      await route.fulfill({ status:202, contentType:'application/json', body:JSON.stringify({ status:'running' }) });
      return;
    }
    getCount += 1;
    if (getCount === 1) {
      await route.fulfill({
        status:200,
        contentType:'application/json',
        body:JSON.stringify({
          status:'running',
          startedAt:new Date(Date.now() - 16_000).toISOString(),
          progress:{ phase:'sections', message:'sections', sectionGroups:4, sections:7, sectionTotal:12, pages:21 }
        })
      });
      return;
    }
    await route.fulfill({
      status:200,
      contentType:'application/json',
      body:JSON.stringify({
        status:'success',
        result:{ pages:21, contentDownloaded:3, contentSkipped:18, contentErrors:0,
          sectionScanErrors:0, bibleRefsPagesParsed:3, bibleRefsRecognized:8, bibleRefsParseErrors:0 }
      })
    });
  });

  await page.locator('#openSettings').click();
  await page.locator('#settingsMovedPanels > details.sync-panel > summary').click();
  await page.locator('#syncButton').click();
  const progress = page.locator('#syncState .sync-progress-box');
  await expect(progress).toBeVisible();
  await expect(progress).toContainText('Этап 1 из 3');
  await expect(progress).toContainText('Проверка структуры');
  await expect(progress).toContainText('Загрузка списка разделов');
  await expect(progress).toContainText('групп разделов: 4');
  await expect(progress).toContainText('разделов: 7/12');
  await expect(page.locator('#syncButton')).toBeDisabled();

  const result = page.locator('#syncState .sync-result-box');
  await expect(result).toBeVisible({ timeout:7_000 });
  await expect(result).toContainText('Синхронизация завершена');
  await expect(result).toContainText('21проверено страниц');
  await expect(result).toContainText('3загружено');
  await expect(result).toContainText('18без изменений');
  await expect(page.locator('#syncButton')).toBeEnabled();
});
