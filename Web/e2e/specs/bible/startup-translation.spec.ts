import { test, expect } from '../../fixtures/app.fixture.js';

test('@bible restored translations wait for the initial module list and remain selectable', async ({ app, context, page }) => {
  await context.addInitScript(() => {
    localStorage.setItem('biblenote.setupWizardDone', 'true');
    localStorage.setItem('biblenote.microsoftScopeVersion', 'notes-read-all-v1');
    localStorage.setItem('onenote.bibleModule', 'rst');
    localStorage.setItem('biblenote.reader.module', "bti'15");
    localStorage.setItem('biblenote.tabs.startupMode', 'restore');
    localStorage.setItem('biblenote.tabs.session', JSON.stringify({ version:1, activeIndex:2, tabs:[
      { type:'page', pageId:'page-grace', title:'Благодать и надежда' },
      { type:'page', pageId:'page-study', title:'Заметка' },
      { type:'bible', title:'Ин 3', bibleLocation:{ module:"bti'15", bookIndex:43, chapter:3 } }
    ] }));
  });
  let release!:() => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/biblenote/modules', async route => {
    await gate;
    const response = await route.fetch();
    const body = await response.json();
    body.modules.push({ shortName:"bti'15", displayName:'Перевод Кулакова' });
    await route.fulfill({ response, json:body });
  });
  try {
    await page.goto(app.baseUrl);
    await expect(page.locator('.workspace-tab')).toHaveCount(3);
    await expect(page.locator('#bibleReaderStatus')).toHaveText('Загрузка модулей...');
    release();
    await expect(page.locator('#content h2')).toHaveText('От Иоанна 3');
    await expect(page.locator('#bibleReaderModule')).toBeEnabled();
    await expect(page.locator('#bibleReaderModule')).toHaveValue("bti'15");
    await expect(page.locator('#bibleReaderBook')).toHaveValue('43');
    await expect(page.locator('#bibleReaderChapter')).toHaveValue('3');
    await expect(page.locator('#bibleReaderStatus')).toBeEmpty();
    await page.locator('#bibleReaderModule').selectOption('kjv');
    await expect(page).toHaveURL(/\/bible\/kjv\/43\/3$/);
    await expect(page.locator('#content [data-inductive-text]').first()).toHaveAttribute('data-module', 'kjv');
    expect(await page.evaluate(() => localStorage.getItem('onenote.bibleModule'))).toBe('rst');
  } finally {
    release();
  }
});
