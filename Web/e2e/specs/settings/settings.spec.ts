import { test, expect } from '../../fixtures/app.fixture.js';

test('@settings можно одновременно добавить несколько источников данных и удалить любой из них', async ({ appPage: page }) => {
  let configuredSources = [
    { id:'source:com', type:'com', displayName:'OneNote Local' },
    { id:'source:folder:notes', type:'folder', displayName:'Notes', folderPaths:['C:\\Notes'] }
  ];
  await page.route('**/api/onenote/access-settings', async route => {
    if (route.request().method() === 'PUT') {
      const body = route.request().postDataJSON();
      configuredSources = body.sources.map((source: any) => ({
        ...source,
        id:source.id || (source.type === 'folder' ? 'source:folder:' + source.folderPaths.join('|') : 'source:' + source.type),
        displayName:source.displayName || (source.type === 'graph' ? 'OneNote Cloud' : source.type === 'com' ? 'OneNote Local' : 'Notes')
      }));
    }
    await route.fulfill({
      status:200,
      contentType:'application/json',
      body:JSON.stringify({ dataSource:configuredSources[0]?.type || 'graph', sources:configuredSources, folderPaths:[] })
    });
  });
  await page.route('**/api/onenote/remote-notebooks**', route => {
    const local = new URL(route.request().url()).searchParams.get('source') === 'com';
    return route.fulfill({
      status:200,
      contentType:'application/json',
      body:JSON.stringify({ notebooks:local
        ? [{ id:'{local-study}', displayName:'Локальный блокнот' }]
        : [
            { id:'cloud-study', displayName:'Изучение Библии' },
            { id:'cloud-archive', displayName:'Архив' }
          ]
      })
    });
  });

  await page.locator('#openSettings').click();
  const sources = page.locator('#settingsDialog details.data-source-settings');
  await expect(sources.locator('> summary')).toHaveText('Источники данных');
  await sources.locator('> summary').click();
  await expect(sources.locator('#oneNoteDataSource option')).toHaveText(['OneNote Cloud', 'OneNote Local', 'Папка']);
  await expect(sources.locator('.data-source-card')).toHaveCount(2);
  await expect(sources.locator('.data-source-card strong')).toHaveText(['OneNote Local', 'Notes']);
  await expect(sources.locator('#folderSourceSettings')).toBeHidden();
  const localSource = sources.locator('.data-source-card').filter({ hasText:'OneNote Local' });
  await expect(localSource.getByRole('button', { name:'Изменить источник «OneNote Local»' })).toBeVisible();
  await localSource.getByRole('button', { name:'Изменить источник «OneNote Local»' }).click();
  await expect(sources.locator('#oneNoteSourceSettings')).toBeVisible();
  await expect(sources.locator('#oneNoteSourceNotebookList')).toContainText('Локальный блокнот');
  await sources.locator('#cancelOneNoteSourceEdit').click();

  await sources.locator('#oneNoteDataSource').selectOption('folder');
  await sources.locator('#addDataSource').click();
  await expect(sources.locator('#folderSourceSettings')).toBeVisible();
  await sources.locator('#cancelFolderSourceEdit').click();
  await sources.locator('#oneNoteDataSource').selectOption('graph');
  await expect(sources.locator('#folderSourceSettings')).toBeHidden();
  await sources.locator('#addDataSource').click();
  await expect(sources.locator('#oneNoteSourceSettings')).toBeVisible();
  await expect(sources.locator('#oneNoteSourceNotebookList .setup-notebook-option')).toHaveCount(2);
  await sources.locator('#oneNoteSourceNotebookList .setup-notebook-option').filter({ hasText:'Архив' }).locator('input').uncheck();
  await sources.locator('#saveOneNoteSource').click();
  await expect(sources.locator('.data-source-card')).toHaveCount(3);
  await expect(sources.locator('.data-source-card strong')).toContainText(['OneNote Local', 'Notes', 'OneNote Cloud']);
  await expect(sources.locator('.data-source-card').filter({ hasText:'OneNote Cloud' })).toContainText('Изучение Библии');
  await expect(sources.locator('.data-source-card').filter({ hasText:'OneNote Cloud' })).not.toContainText('Архив');
  await expect(page.locator('#notebookPanel')).toHaveCount(0);

  await sources.locator('#oneNoteDataSource').selectOption('folder');
  await sources.locator('#addDataSource').click();
  await sources.locator('#folderSourceName').fill('Проповеди и конспекты');
  await sources.locator('#folderSourcePaths').fill('C:\\Sermons\nD:\\Study');
  await sources.locator('#folderSourceDeduplicateFiles').check();
  await sources.locator('#saveFolderSource').click();
  await expect(sources.locator('.data-source-card')).toHaveCount(4);
  let combined = sources.locator('.data-source-card').filter({ hasText:'Проповеди и конспекты' });
  await expect(combined).toContainText('Папок: 2');
  await expect(combined).toContainText('Одинаковые имена: DOCX → DOC → HTML → TXT → PDF');
  await expect(combined.locator('.data-source-folder-list li')).toHaveText(['C:\\Sermons', 'D:\\Study']);
  await combined.getByRole('button', { name:'Изменить источник «Проповеди и конспекты»' }).click();
  await expect(sources.locator('#folderSourceName')).toHaveValue('Проповеди и конспекты');
  await expect(sources.locator('#folderSourceDeduplicateFiles')).toBeChecked();
  await sources.locator('#folderSourceName').fill('Материалы для занятий');
  await sources.locator('#folderSourcePaths').fill('D:\\Study\nE:\\Archive');
  await sources.locator('#saveFolderSource').click();
  combined = sources.locator('.data-source-card').filter({ hasText:'Материалы для занятий' });
  await expect(combined.locator('.data-source-folder-list li')).toHaveText(['D:\\Study', 'E:\\Archive']);

  await sources.locator('.data-source-card').filter({ hasText:'Notes' }).getByRole('button', { name:/Удалить источник/ }).click();
  await expect(sources.locator('.data-source-card')).toHaveCount(3);
  await expect(sources.locator('.data-source-card').filter({ hasText:'Notes' })).toHaveCount(0);
});

test('@settings тема сохраняется и применяется при следующей загрузке', async ({ appPage: page }) => {
  await page.locator('#openSettings').click();
  await expect(page.locator('#settingsDialog')).toHaveAttribute('open', '');
  await page.locator('#settingsDialog details.view-settings > summary').click();
  await page.locator('#themeSelect').selectOption('c');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'c');

  await page.locator('#closeSettings').click();
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'c');
});

test('@settings режим открытия Библии во вкладках сохраняется', async ({ appPage: page }) => {
  await page.locator('#openSettings').click();
  await page.locator('#settingsDialog details.view-settings > summary').click();
  await page.locator('#bibleTabOpenMode').selectOption('new');
  await page.locator('#closeSettings').click();

  await page.reload();
  await page.locator('#openSettings').click();
  await page.locator('#settingsDialog details.view-settings > summary').click();
  await expect(page.locator('#bibleTabOpenMode')).toHaveValue('new');
});

test('@settings синхронизация собрана в одном понятном разделе без технических опций', async ({ appPage: page }) => {
  await page.locator('#openSettings').click();
  const syncPanel = page.locator('#settingsMovedPanels > details.sync-panel');
  await expect(syncPanel).toHaveCount(1);
  await expect(syncPanel.locator('> summary')).toHaveText('Синхронизация');
  await syncPanel.locator('> summary').click();

  await expect(syncPanel.locator('.sync-mode-card')).toHaveCount(3);
  await expect(syncPanel.locator('#syncPlanSummary')).toContainText('Библейские ссылки будут обработаны автоматически');
  await expect(syncPanel).not.toContainText('Максимум страниц');
  await expect(syncPanel).not.toContainText('Скорость запросов');
  await expect(syncPanel).not.toContainText('Принудительно обновлять');
  await expect(syncPanel).not.toContainText('Повторно распознать');

  await expect(syncPanel.locator('details.sync-advanced')).toHaveCount(0);
  await expect(syncPanel.locator('#syncIncludeHtml')).toHaveCount(0);
});

test('@settings журнал сохраняет строки и показывает ошибку обновления внутри окна', async ({ app, context, page }) => {
  await context.addInitScript(() => {
    if (window.top !== window) return;
    localStorage.setItem('biblenote.setupWizardDone', 'true');
    localStorage.setItem('biblenote.microsoftScopeVersion', 'notes-read-all-v1');
    localStorage.setItem('onenote.pageViewMode', 'text');
  });
  let historyRequestCount = 0;
  let releaseFailedRefresh = () => {};
  let markRefreshStarted = () => {};
  const failedRefreshGate = new Promise<void>(resolve => { releaseFailedRefresh = resolve; });
  const refreshStarted = new Promise<void>(resolve => { markRefreshStarted = resolve; });
  await page.route('**/api/sync-history?**', async route => {
    historyRequestCount += 1;
    if (historyRequestCount > 1) {
      markRefreshStarted();
      await failedRefreshGate;
      await route.fulfill({
        status:503,
        contentType:'application/json',
        body:JSON.stringify({ error:'История временно недоступна' })
      });
      return;
    }
    await route.fulfill({
      status:200,
      contentType:'application/json',
      body:JSON.stringify({
        total:28,
        rows:[{
          id:28,
          startedAt:'2026-09-08T15:01:09.708Z',
          finishedAt:'2026-09-08T15:01:19.202Z',
          status:'success',
          mode:'page',
          scope:'Тестовая страница',
          request:{ pageId:'page-1' },
          result:{ pages:1, contentDownloaded:1, contentSkipped:0, bibleRefsRecognized:1 },
          error:null
        }]
      })
    });
  });

  await page.goto(app.baseUrl);
  await expect(page.locator('#logList .sync-history-row')).toHaveCount(1);
  await page.locator('#status').click();
  await refreshStarted;

  await expect(page.locator('#downloadLogDialog')).toHaveAttribute('open', '');
  await expect(page.locator('#logList .sync-history-row')).toHaveCount(1);
  await expect(page.locator('#refreshLog')).toBeDisabled();
  await expect(page.locator('#logNext')).toBeDisabled();
  await expect(page.locator('#logStatus')).toHaveText('Обновление истории…');
  await expect(page.locator('#content .error-box')).toHaveCount(0);

  releaseFailedRefresh();
  await expect(page.locator('#logStatus')).toContainText('Не удалось обновить историю');
  await expect(page.locator('#logList .sync-history-row')).toHaveCount(1);
  await expect(page.locator('#content .error-box')).toHaveCount(0);
});

test('@settings визард скрывает подключение и при существующем кеше выбирает быстрое обновление', async ({ app, context, page }) => {
  await context.addInitScript(() => {
    if (window.top !== window) return;
    localStorage.removeItem('biblenote.setupWizardDone');
    localStorage.setItem('onenote.pageViewMode', 'text');
    localStorage.setItem('onenote.bibleModule', 'rst');
    localStorage.removeItem('onenote.hiddenNotebookIds');
  });
  let wizardSources = [{ id:'source:graph', type:'graph', displayName:'OneNote Cloud' }];
  await page.route('**/api/onenote/access-settings', async route => {
    if (route.request().method() === 'PUT') wizardSources = route.request().postDataJSON().sources;
    await route.fulfill({
      status:200,
      contentType:'application/json',
      body:JSON.stringify({ dataSource:'graph', sources:wizardSources })
    });
  });
  await page.route('**/api/onenote/login/status', route => route.fulfill({
    status:200,
    contentType:'application/json',
    body:JSON.stringify({ status:'success', account:{ username:'e2e@example.test', name:'E2E' } })
  }));
  await page.route('**/api/onenote/remote-notebooks**', route => route.fulfill({
    status:200,
    contentType:'application/json',
    body:JSON.stringify({ notebooks:[{ id:'notebook-study', displayName:'Учебный блокнот' }] })
  }));
  await page.goto(app.baseUrl);

  const wizard = page.locator('#setupWizardDialog');
  await expect(wizard).toHaveAttribute('open', '');
  await expect(page.locator('#setupMicrosoftAccount')).toContainText('OneNote подключён: e2e@example.test');
  await expect(page.locator('#setupMicrosoftConnectionControls')).toBeHidden();
  await expect(page.locator('#setupChangeMicrosoftAccount')).toBeVisible();

  await page.locator('#setupWizardNext').click();
  await expect(wizard.locator('[data-setup-step="1"]')).toBeVisible();
  await page.locator('#setupWizardNext').click();
  await expect(wizard.locator('[data-setup-step="2"]')).toBeVisible();
  await page.locator('#setupWizardNext').click();
  await expect(wizard.locator('[data-setup-step="3"]')).toBeVisible();
  await expect(page.locator('#setupNotebookStepTitle')).toHaveText('Коллекции и обновление');
  await expect(page.locator('#setupInitialSyncStatus')).toContainText('Будут проверены только изменения');
  await expect(page.locator('#setupWizardNext')).toHaveText('Обновить заметки');

  let syncPayload: Record<string, unknown> | undefined;
  let syncFinished = false;
  let syncPollUnavailable = true;
  await page.route('**/api/sync', async route => {
    if (route.request().method() === 'POST') {
      syncPayload = route.request().postDataJSON();
      await route.fulfill({ status:202, contentType:'application/json', body:JSON.stringify({ status:'running' }) });
      return;
    }
    if (syncPayload && syncPollUnavailable) {
      await route.abort('failed');
      return;
    }
    await route.fulfill({
      status:200,
      contentType:'application/json',
      body:JSON.stringify(syncFinished
        ? {
            status:'success',
            result:{ pages:2, contentDownloaded:0, contentSkipped:2, contentErrors:0, sectionScanErrors:0,
              bibleRefsPagesParsed:0, bibleRefsRecognized:0, bibleRefsParseErrors:0 }
          }
        : {
            status:'running',
            startedAt:new Date(Date.now() - (231 * 60 + 10) * 1000).toISOString(),
            progress:{ phase:'bible-parse', bibleParseDone:4895, bibleParseTotal:7377 }
          })
    });
  });
  await page.locator('#setupWizardNext').click();
  await expect(page.locator('#setupInitialSyncStatus')).toContainText('Ожидание связи с синхронизацией');
  await expect(page.locator('#setupSelectAllNotebooks')).toBeDisabled();
  await expect(page.locator('#setupClearAllNotebooks')).toBeDisabled();
  await expect(page.locator('#setupNotebookList input[data-notebook-id]')).toBeDisabled();
  syncPollUnavailable = false;
  await expect(page.locator('#setupInitialSyncStatus')).toContainText('прошло: 3 ч 51 мин');
  await expect(page.locator('#setupSelectAllNotebooks')).toBeDisabled();
  await expect(page.locator('#setupClearAllNotebooks')).toBeDisabled();
  await expect(page.locator('#setupNotebookList input[data-notebook-id]')).toBeDisabled();
  syncFinished = true;
  await expect(wizard.locator('[data-setup-step="4"]')).toBeVisible();
  await expect(page.locator('#setupSelectAllNotebooks')).toBeEnabled();
  await expect(page.locator('#setupClearAllNotebooks')).toBeEnabled();
  await expect(page.locator('#setupNotebookList input[data-notebook-id]')).toBeEnabled();
  expect(syncPayload).toMatchObject({ incrementalMetadata:true, parseBibleRefs:true, forceContent:false });
  await expect(page.locator('#setupWizardSummary')).toContainText('Всего страниц в локальном кеше');
  await expect(page.locator('#setupWizardSummary')).toContainText('Проверено при этом обновлении');
});
