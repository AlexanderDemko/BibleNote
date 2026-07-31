import { test, expect } from '../../fixtures/app.fixture.js';

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

  const advanced = syncPanel.locator('details.sync-advanced');
  await advanced.locator('summary').click();
  await expect(advanced).toHaveAttribute('open', '');
  await expect(advanced.locator('input[type="checkbox"]')).toHaveCount(1);
  await expect(advanced.locator('#syncIncludeHtml')).toBeChecked();
});

test('@settings визард скрывает подключение и при существующем кеше выбирает быстрое обновление', async ({ app, context, page }) => {
  await context.addInitScript(() => {
    if (window.top !== window) return;
    localStorage.removeItem('biblenote.setupWizardDone');
    localStorage.setItem('onenote.pageViewMode', 'text');
    localStorage.setItem('onenote.bibleModule', 'rst');
    localStorage.removeItem('onenote.hiddenNotebookIds');
  });
  await page.route('**/api/onenote/access-settings', route => route.fulfill({
    status:200,
    contentType:'application/json',
    body:JSON.stringify({ dataSource:'graph' })
  }));
  await page.route('**/api/onenote/login/status', route => route.fulfill({
    status:200,
    contentType:'application/json',
    body:JSON.stringify({ status:'success', account:{ username:'e2e@example.test', name:'E2E' } })
  }));
  await page.route('**/api/onenote/remote-notebooks', route => route.fulfill({
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
  await expect(page.locator('#setupNotebookStepTitle')).toHaveText('Блокноты и обновление');
  await expect(page.locator('#setupInitialSyncStatus')).toContainText('Будут проверены только изменения');
  await expect(page.locator('#setupWizardNext')).toHaveText('Обновить заметки');

  let syncPayload: Record<string, unknown> | undefined;
  await page.route('**/api/sync', async route => {
    if (route.request().method() === 'POST') {
      syncPayload = route.request().postDataJSON();
      await route.fulfill({ status:202, contentType:'application/json', body:JSON.stringify({ status:'running' }) });
      return;
    }
    await route.fulfill({
      status:200,
      contentType:'application/json',
      body:JSON.stringify({
        status:'success',
        result:{ pages:2, contentDownloaded:0, contentSkipped:2, contentErrors:0, sectionScanErrors:0,
          bibleRefsPagesParsed:0, bibleRefsRecognized:0, bibleRefsParseErrors:0 }
      })
    });
  });
  await page.locator('#setupWizardNext').click();
  await expect(wizard.locator('[data-setup-step="4"]')).toBeVisible();
  expect(syncPayload).toMatchObject({ incrementalMetadata:true, parseBibleRefs:true, forceContent:false });
  await expect(page.locator('#setupWizardSummary')).toContainText('Всего страниц в локальном кеше');
  await expect(page.locator('#setupWizardSummary')).toContainText('Проверено при этом обновлении');
});
