import { test, expect } from '../../fixtures/app.fixture.js';

test('@bible imported module appears in the existing reader translation picker', async ({ app, appPage: page }) => {
  await page.goto(`${app.baseUrl}/bible/rst/43/1`);
  await expect(page.locator('#content h2')).toHaveText('От Иоанна 1');
  let installed = false;
  await page.route('**/api/biblenote/modules', async route => {
    const response = await route.fetch();
    const body = await response.json();
    if (installed) body.modules.push({ shortName:"bti'15", displayName:'BTI fixture', type:'Bible', locale:'ru' });
    await route.fulfill({ response, json:body });
  });
  await page.route('**/api/biblenote/modules/upload', async route => {
    installed = true;
    await route.fulfill({ json:{ installed:true, moduleName:"bti'15" } });
  });
  await page.locator('#openSettings').click();
  await page.locator('#settingsDialog .biblenote-settings > summary').click();
  await page.locator('#bibleModuleFile').setInputFiles({
    name:'renamed-package.bnm', mimeType:'application/octet-stream', buffer:Buffer.from('fixture')
  });
  await page.locator('#uploadBibleModule').click();
  await expect(page.locator('#bibleModuleStatus')).toContainText('Загружено модулей: 1/1');
  await expect(page.locator('#bibleModulesList')).toContainText('BTI fixture');
  await page.locator('#closeSettings').click();
  await page.locator('.bible-reader-translations > summary').click();
  await expect(page.locator('.bible-reader-translations input[value="bti\'15"]')).toBeVisible();
  await expect(page.locator('.bible-reader-translations input[value="bti\'15"]')).toBeChecked();
  await page.locator('.bible-reader-translations input[value="rst"]').check();
  await page.locator('.bible-reader-translations').getByRole('button', { name:'Показать', exact:true }).click();
  await expect(page.locator('.bible-reader-translation-heading').filter({ hasText:'BTI fixture' })).toBeVisible();
});

test('@settings failed module installation is shown as an error', async ({ appPage: page }) => {
  await page.route('**/api/biblenote/modules/upload', route => route.fulfill({
    json:{ installed:false, moduleName:'not-installed', message:'Installation failed fixture' }
  }));
  await page.locator('#openSettings').click();
  await page.locator('#settingsDialog .biblenote-settings > summary').click();
  await page.locator('#bibleModuleFile').setInputFiles({
    name:'failed.bnm', mimeType:'application/octet-stream', buffer:Buffer.from('fixture')
  });
  await page.locator('#uploadBibleModule').click();
  await expect(page.locator('#bibleModuleStatus')).toContainText('Не удалось загрузить модуль: Installation failed fixture');
  await expect(page.locator('#bibleModuleName')).not.toHaveValue('not-installed');
});
