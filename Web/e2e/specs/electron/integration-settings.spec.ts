import { test, expect } from '../../fixtures/app.fixture.js';

test('@electron @settings UI отображает состояние Electron control bridge', async ({ appPage: page }) => {
  await page.route('**/api/onenote/access-settings', route => route.fulfill({
    status:200,
    contentType:'application/json',
    body:JSON.stringify({
      dataSource:'com',
      sources:[{ id:'source:com', type:'com', displayName:'OneNote Local' }],
      folderPaths:[]
    })
  }));
  await page.locator('#openSettings').click();

  await expect.poll(() => page.locator('#protocolStatus').textContent()).toContain('BibleNote');
  await expect(page.locator('#oneNoteIntegrationSettings')).not.toHaveAttribute('hidden', '');
  await expect(page.locator('#enableOneNoteRibbon')).toBeDisabled();
  await expect(page.locator('#enableOneNoteRibbonLabel')).toHaveText('Добавить вкладку BibleNote 4 в OneNote');
});

test('@electron @settings выбор версии BibleNote сохраняется при перезагрузке', async ({ appPage: page }) => {
  await page.route('**/api/onenote/access-settings', route => route.fulfill({
    json:{ dataSource:'com', sources:[{ id:'source:com', type:'com', displayName:'OneNote Local' }], folderPaths:[] }
  }));
  await page.locator('#openSettings').click();
  await page.locator('#oneNoteIntegrationSettings > summary').click();
  const handler = page.getByRole('checkbox', { name:'Открывать библейские ссылки в BibleNote 4', exact:true });
  const reader = page.getByRole('checkbox', { name:'Открывать ссылки из OneNote сразу в окне «Библия»', exact:true });
  await expect(handler).toBeChecked();
  await reader.check();

  const switching = page.waitForResponse(response => response.url().endsWith('/api/system/protocol')
    && response.request().method() === 'PUT');
  await handler.uncheck();
  const response = await switching;
  expect(response.request().postDataJSON()).toEqual({ enabled:false });
  expect(await response.json()).toMatchObject({ registered:false });
  await expect(page.locator('#protocolStatus')).toContainText('в старом BibleNote');
  await expect(reader).toBeDisabled();
  await expect(reader).toBeChecked();

  await page.reload();
  await page.locator('#openSettings').click();
  await page.locator('#oneNoteIntegrationSettings > summary').click();
  await expect(handler).not.toBeChecked();
  await expect(reader).toBeDisabled();
  await handler.check();
  await expect(page.locator('#protocolStatus')).toContainText('в BibleNote 4');
  await expect(reader).toBeEnabled();
  await expect(reader).toBeChecked();
});
