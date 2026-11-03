import { test, expect } from '../../fixtures/app.fixture.js';

test('@bible notes and parallel actions map the reading verse to the main translation', async ({ app, appPage: page }) => {
  await page.route('**/api/bible/parallel-text?**', route => route.fulfill({ json:{
    baseModule:'kjv', module:'rst', rows:[
      { baseChapter:2, baseVerse:1, verses:[{ chapter:3, verse:5, text:'Mapped verse' }] },
      { baseChapter:2, baseVerse:2, verses:[{ chapter:3, verse:6, topVerse:7, text:'Split verse' }] }
    ]
  } }));
  await page.goto(`${app.baseUrl}/bible/kjv/43/2`);
  const search = page.waitForRequest(request => new URL(request.url()).pathname === '/api/search');
  await page.locator('#bible-verse-2-1 .bible-reader-action').first().click();
  expect(new URL((await search).url()).searchParams.get('q')).toBe('Ин 3:5');

  const parallel = page.waitForRequest(request => new URL(request.url()).pathname === '/api/bible/parallel');
  await page.locator('#bible-verse-2-1 button[title="Показать параллельные ссылки"]').click();
  const params = new URL((await parallel).url()).searchParams;
  expect(params.get('chapter')).toBe('3');
  expect(params.get('verse')).toBe('5');
  await expect(page.locator('#bibleParallelDrawerTitle')).toHaveText('От Иоанна 3:5');
  await page.locator('#closeBibleParallelDrawer').click();

  await page.locator('#bible-verse-2-2 .bible-reader-action').first().click();
  const dialog = page.getByRole('dialog', { name:'Выберите соответствующий стих' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name:'Ин 3:6', exact:true })).toBeVisible();
  const splitSearch = page.waitForRequest(request => new URL(request.url()).pathname === '/api/search');
  await dialog.getByRole('button', { name:'Ин 3:7', exact:true }).click();
  expect(new URL((await splitSearch).url()).searchParams.get('q')).toBe('Ин 3:7');
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('#bibleReaderModule')).toHaveValue('kjv');
  expect(await page.evaluate(() => localStorage.getItem('onenote.bibleModule'))).toBe('rst');
  const requests:string[] = [];
  page.on('request', request => {
    if (['/api/search', '/api/bible/parallel'].includes(new URL(request.url()).pathname)) requests.push(request.url());
  });
  await page.locator('#bible-verse-2-3 .bible-reader-action').first().click();
  await expect(page.locator('#bibleReaderStatus')).toHaveText('Для этого стиха нет соответствия в основном переводе.');
  await expect(page.locator('#bible-verse-2-3')).toBeVisible();
  expect(requests).toEqual([]);
});

test('@bible comparison follows the reading translation and limits the picker to three modules', async ({ app, appPage: page }) => {
  await page.route('**/api/biblenote/modules', route => route.fulfill({ json:{ available:true, modules:[
    { shortName:'rst', displayName:'Русский синодальный' },
    { shortName:'kjv', displayName:'King James Version' },
    { shortName:'bti', displayName:'Перевод Кулакова' },
    { shortName:'extra', displayName:'Другой перевод' }
  ] } }));
  await page.route('**/api/bible/parallel-text?**', route => {
    const params = new URL(route.request().url()).searchParams;
    return route.fulfill({ json:{
      baseModule:params.get('baseModule'), module:params.get('module'),
      rows:[{ baseChapter:2, baseVerse:1, verses:[params.get('baseModule') === 'rst'
        && params.get('module') === 'kjv'
        ? { chapter:2, verse:1, text:'Same reading position' }
        : { chapter:3, verse:5, text:'Mapped verse 3:5' }] }]
    } });
  });
  await page.goto(`${app.baseUrl}/bible/rst/43/2`);
  const picker = page.locator('.bible-reader-translations');
  await picker.locator('summary').click();
  await picker.locator('input[value="kjv"]').check();
  await picker.locator('input[value="bti"]').check();
  await expect(picker.locator('input[value="extra"]')).toBeDisabled();
  await expect(picker.locator('input[value="rst"]')).toBeDisabled();
  await picker.getByRole('button', { name:'Показать', exact:true }).click();
  await expect(page.locator('.bible-reader-translation-heading')).toHaveCount(3);
  const panel = page.locator('.bible-reader-panel');
  if (await panel.getAttribute('open') === null) await page.locator('#bibleReaderSummary').click();
  await page.locator('#bibleReaderModule').selectOption('kjv');
  await expect(page).toHaveURL(/\/bible\/kjv\/43\/2$/);
  await expect(page.locator('.bible-reader-translation-heading').first()).toContainText('kjv');
  await expect(page.locator('.bible-reader-primary-badge')).toHaveCount(0);
  await expect(page.locator('.bible-reader-translation-heading').nth(1)).toContainText('rst');
  await expect(page.locator('.bible-reader-translation-heading').nth(2)).toContainText('bti');
  const row = page.locator('#bible-verse-2-1');
  await expect(row.locator('.bible-reader-translation-cell').nth(1)).toContainText('Mapped verse 3:5');
  await expect(row.locator('.bible-reader-translation-cell').nth(1)).toContainText('3:5');
  expect(await page.evaluate(() => localStorage.getItem('onenote.bibleModule'))).toBe('rst');
});

test('@bible a slower translation switch cannot replace the latest selection', async ({ app, appPage: page }) => {
  await page.goto(`${app.baseUrl}/bible/rst/43/2`);
  let release!:() => void;
  const blocked = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/bible/books?**', async route => {
    if (new URL(route.request().url()).searchParams.get('module') === 'kjv') await blocked;
    await route.continue();
  });
  const panel = page.locator('.bible-reader-panel');
  if (await panel.getAttribute('open') === null) await page.locator('#bibleReaderSummary').click();
  const request = page.waitForRequest('**/api/bible/books?module=kjv');
  await page.locator('#bibleReaderModule').selectOption('kjv');
  await request;
  await page.locator('#bibleReaderModule').selectOption('rst');
  const latest = page.waitForResponse('**/api/bible/text?module=rst&**');
  release();
  await latest;
  await expect(page.locator('#bibleReaderModule')).toHaveValue('rst');
  await expect(page.locator('#bibleReaderChapter')).toHaveValue('2');
  await expect(page.locator('#content [data-inductive-text="true"]').first()).toHaveAttribute('data-module', 'rst');
  await expect(page).toHaveURL(/\/bible\/rst\/43\/2$/);
  expect(await page.evaluate(() => localStorage.getItem('onenote.bibleModule'))).toBe('rst');
});

for (const choice of ['select', 'radio', 'parallel'] as const) {
  test(`@bible main module setting updates the current chapter (${choice})`, async ({ app, appPage: page }) => {
    await page.addInitScript(parallel => {
      localStorage.setItem('biblenote.reader.translationModules', JSON.stringify(parallel ? ['rst', 'kjv'] : ['rst']));
    }, choice === 'parallel');
    await page.route('**/api/bible/text?**', async route => {
      const response = await route.fetch();
      const body = await response.json();
      body.verses[0].text = `Text from ${body.module}`;
      await route.fulfill({ response, json:body });
    });
    await page.goto(`${app.baseUrl}/bible/rst/43/2`);
    await expect(page.locator('#content h2')).toHaveText('От Иоанна 2');
    await page.locator('#openSettings').click();
    await page.locator('#settingsDialog .biblenote-settings > summary').click();
    if (choice === 'radio') await page.locator('#bibleModulesList input[value="kjv"]').check();
    else await page.locator('#bibleModuleName').selectOption('kjv');
    await expect(page.locator('#bibleReaderModule')).toHaveValue('kjv');
    await expect(page).toHaveURL(/\/bible\/kjv\/43\/2$/);
    await expect(page.locator('#bibleReaderBook')).toHaveValue('43');
    await expect(page.locator('#bibleReaderChapter')).toHaveValue('2');
    await expect(page.locator('#bibleModulesList input[value="kjv"]')).toBeChecked();
    await expect(page.locator('#bibleModulesList')).not.toContainText('текущий в BibleNote');
    await page.locator('#closeSettings').click();
    await expect(page.locator('[data-inductive-text="true"]').first()).toContainText('Text from kjv');
    await expect(page.locator('.workspace-tab')).toHaveCount(1);
    if (choice === 'parallel') {
      await expect(page.locator('.bible-reader-translation-heading').first()).toContainText('kjv');
      await expect(page.locator('.bible-reader-primary-badge')).toHaveCount(0);
      await expect(page.locator('.bible-reader-translation-heading').nth(1)).toContainText('rst');
    }
    await page.reload();
    await expect(page.locator('[data-inductive-text="true"]').first()).toContainText('Text from kjv');
  });
}

test('@settings changing main module while reading a note keeps the note open', async ({ app, appPage: page }) => {
  await page.goto(`${app.baseUrl}/page/page-grace`);
  await expect(page.locator('#content h2')).toHaveText('Благодать и надежда');
  await page.locator('#openSettings').click();
  await page.locator('#settingsDialog .biblenote-settings > summary').click();
  await page.locator('#bibleModuleName').selectOption('kjv');
  await expect(page.locator('#bibleReaderModule')).toHaveValue('kjv');
  await page.locator('#closeSettings').click();
  await expect(page).toHaveURL(/\/page\/page-grace$/);
  await expect(page.locator('#content h2')).toHaveText('Благодать и надежда');
  await expect(page.locator('.workspace-tab')).toHaveCount(1);
});

test('@bible reader module selection keeps the main module setting and reading location', async ({ app, appPage: page }) => {
  await page.goto(`${app.baseUrl}/bible/rst/43/2`);
  const panel = page.locator('.bible-reader-panel');
  if (await panel.getAttribute('open') === null) await page.locator('#bibleReaderSummary').click();
  await page.locator('#bibleReaderModule').selectOption('kjv');
  await expect(page).toHaveURL(/\/bible\/kjv\/43\/2$/);
  await page.locator('#openSettings').click();
  await expect(page.locator('#bibleModuleName')).toHaveValue('rst');
  await expect(page.locator('#bibleModulesList input[value="rst"]')).toBeChecked();
  expect(await page.evaluate(() => [localStorage.getItem('onenote.bibleModule'), localStorage.getItem('biblenote.reader.module')])).toEqual(['rst', 'kjv']);
  await page.locator('#closeSettings').click();
  await page.reload();
  await expect(page.locator('#bibleReaderModule')).toHaveValue('kjv');
  await expect(page.locator('#bibleReaderBook')).toHaveValue('43');
  await expect(page.locator('#bibleReaderChapter')).toHaveValue('2');
  await expect(page.locator('[data-inductive-text="true"]').first()).toHaveAttribute('data-module', 'kjv');
});

test('@bible explicit modules and Bible tabs keep their translations without changing the main module', async ({ app, appPage: page }) => {
  await page.goto(`${app.baseUrl}/bible/rst/43/1`);
  await page.locator('#newWorkspaceTab').click();
  await page.evaluate(async () => {
    await (window as typeof window & { openBibleReaderLocation:(location:unknown) => Promise<void> })
      .openBibleReaderLocation({ module:'kjv', bookIndex:43, chapter:2 });
  });
  await expect(page).toHaveURL(/\/bible\/kjv\/43\/2$/);
  await page.locator('#openSettings').click();
  await expect(page.locator('#bibleModuleName')).toHaveValue('rst');
  await page.locator('#closeSettings').click();
  await page.locator('.workspace-tab').first().click();
  await expect(page.locator('#bibleReaderModule')).toHaveValue('rst');
  await expect(page.locator('#bibleModuleName')).toHaveValue('rst');
  await expect(page.locator('#bibleModulesList input[value="rst"]')).toBeChecked();
  await page.locator('.workspace-tab').nth(1).click();
  await expect(page.locator('#bibleReaderModule')).toHaveValue('kjv');
  await expect(page.locator('#bibleModuleName')).toHaveValue('rst');
  await expect(page.locator('#bibleReaderChapter')).toHaveValue('2');
  await expect(page.locator('#content [data-inductive-text="true"]').first()).toHaveAttribute('data-module', 'kjv');
});

for (const restore of [false, true]) {
  test(`@bible a different reading translation survives startup (${restore ? 'saved tab' : 'URL'})`, async ({ app, appPage: page }) => {
    await page.addInitScript(restoreSession => {
      localStorage.setItem('onenote.bibleModule', 'kjv');
      localStorage.setItem('biblenote.reader.module', 'rst');
      localStorage.setItem('biblenote.tabs.startupMode', restoreSession ? 'restore' : 'empty');
      if (restoreSession) localStorage.setItem('biblenote.tabs.session', JSON.stringify({
        version:1, activeIndex:0, tabs:[{ type:'bible', title:'Saved Bible', bibleLocation:{ module:'rst', bookIndex:43, chapter:2 } }]
      }));
    }, restore);
    await page.goto(restore ? app.baseUrl : `${app.baseUrl}/bible/rst/43/2`);
    await expect(page.locator('[data-inductive-text="true"]').first()).toHaveAttribute('data-module', 'rst');
    await expect(page.locator('#bibleReaderModule')).toHaveValue('rst');
    await expect(page.locator('#bibleReaderBook')).toHaveValue('43');
    await expect(page.locator('#bibleReaderChapter')).toHaveValue('2');
    await page.locator('#openSettings').click();
    await expect(page.locator('#bibleModuleName')).toHaveValue('kjv');
    expect(await page.evaluate(() => [localStorage.getItem('onenote.bibleModule'), localStorage.getItem('biblenote.reader.module')])).toEqual(['kjv', 'rst']);
  });
}
