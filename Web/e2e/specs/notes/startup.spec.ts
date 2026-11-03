import { test, expect } from '../../fixtures/app.fixture.js';

test('@notes restoring notes does not wait for Bible modules, and restored Bible tabs still open', async ({app, context, page}) => {
  await context.addInitScript(() => {
    localStorage.setItem('biblenote.setupWizardDone', 'true');
    localStorage.setItem('biblenote.microsoftScopeVersion', 'notes-read-all-v1');
    localStorage.setItem('onenote.pageViewMode', 'text');
    localStorage.setItem('biblenote.tabs.startupMode', 'restore');
    localStorage.setItem('biblenote.tabs.session', JSON.stringify({version:1, activeIndex:0, tabs:[
      {type:'page', pageId:'page-grace', title:'Благодать и надежда'},
      {type:'bible', title:'Ин 3', bibleLocation:{module:'rst', bookIndex:43, chapter:3}}
    ]}));
  });
  let releaseModules!: () => void;
  const modulesGate = new Promise<void>(resolve => {releaseModules = resolve;});
  await page.route('**/api/biblenote/modules', async route => {
    await modulesGate;
    await route.continue();
  });
  try {
    await page.goto(app.baseUrl);
    await expect(page.locator('#content h2')).toHaveText('Благодать и надежда');
    await expect(page.locator('.workspace-tab')).toHaveCount(2);
    await page.locator('.workspace-tab').nth(1).click();
    releaseModules();
    await expect(page.locator('#content h2')).toHaveText('От Иоанна 3');
  } finally {releaseModules();}
});
