import { test, expect } from '../../fixtures/app.fixture.js';

test('@notes обычное открытие другой заметки не переносит совпадение из адреса предыдущей', async ({ app, appPage: page }) => {
  await page.goto(`${app.baseUrl}/page/page-prayer#p-0`);
  await expect(page.locator('#content h2')).toHaveText('Молитва учеников');
  await page.evaluate(async () => {
    const ui = window as any;
    await ui.showRibbonPageLoading('Благодать и надежда');
    await ui.openPage('page-grace');
  });
  await expect(page.locator('#content h2')).toHaveText('Благодать и надежда');
  await expect(page.locator('#content h2')).not.toHaveClass(/bible-paragraph-target|page-title-target|current-match/);
  await expect(page.locator('#content .match-nav')).toHaveCount(0);
  await expect(page).toHaveURL(/\/page\/page-grace$/);
});

test('@notes повторное открытие из OneNote сбрасывает выбранный абзац и подсветку поиска', async ({ app, appPage: page }) => {
  await page.goto(`${app.baseUrl}/page/page-grace#p-0`);
  await expect(page.locator('#content .match-nav')).toHaveCount(1);
  await page.evaluate(async () => {
    const ui = window as any;
    await ui.showRibbonPageLoading('Благодать и надежда');
    await ui.openPage('page-grace', { clearTarget:true, highlightQuery:'' });
    // The same options are used when the Ribbon command refreshes the cached note.
    await ui.openPage('page-grace', { updateUrl:false, rememberHistory:false, clearTarget:true, highlightQuery:'' });
  });
  await expect(page.locator('#content h2')).not.toHaveClass(/bible-paragraph-target|page-title-target|current-match/);
  await expect(page.locator('#content .match-nav, #content mark, #content .bible-reference-target')).toHaveCount(0);
  await expect(page).toHaveURL(/\/page\/page-grace$/);
});

for (const startup of ['url', 'restored'] as const) {
  test(`@notes команда Заметка во время запуска побеждает восстановление Библии (${startup})`, async ({ app, page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('biblenote.setupWizardDone', 'true');
      localStorage.setItem('biblenote.microsoftScopeVersion', 'notes-read-all-v1');
      localStorage.setItem('onenote.pageViewMode', 'text');
      localStorage.setItem('onenote.bibleModule', 'rst');
      localStorage.setItem('biblenote.tabs.startupMode', 'restore');
      localStorage.setItem('biblenote.tabs.session', JSON.stringify({ version:1, activeIndex:0, tabs:[
        { type:'bible', title:'Ин 3', bibleLocation:{ module:'rst', bookIndex:43, chapter:3 } }
      ] }));
    });
    let releaseModules!: () => void;
    const gate = new Promise<void>(resolve => { releaseModules = resolve; });
    await page.route('**/api/biblenote/modules', async route => {
      await gate;
      await route.continue();
    });
    try {
      const modulesRequested = page.waitForRequest('**/api/biblenote/modules');
      await page.goto(startup === 'url' ? `${app.baseUrl}/bible/rst/43/3` : app.baseUrl);
      await modulesRequested;
      await page.evaluate(() => {
        const ui = window as any;
        ui.ribbonOpen = (async () => {
          await ui.showRibbonPageLoading('Молитва учеников');
          await ui.openPage('page-prayer');
        })();
      });
      releaseModules();
      await page.evaluate(() => (window as any).ribbonOpen);
      // Settle the startup work too, including the restored active tab's load.
      await page.evaluate(() => (window as any).eval('bibleNoteInitialization'));
      await expect(page.locator('#content h2')).toHaveText('Молитва учеников');
      await expect(page.locator('.workspace-tab.active')).toContainText('Молитва учеников');
      await expect(page).toHaveURL(/\/page\/page-prayer$/);
      await expect(page.locator('#content')).not.toHaveAttribute('aria-busy', 'true');
    } finally { releaseModules(); }
  });
}

test('@notes уведомление целиком видно над вкладками и панелью режима целиком', async ({ appPage: page }) => {
  await page.setViewportSize({ width:1100, height:620 });
  await page.evaluate(() => (window as any).showActivity('Синхронизация завершена: проверено 1, загружено 1, ошибок 0', 'success', true));
  const toast = page.locator('#activityToast');
  await expect(toast).toHaveCSS('opacity', '1');
  const fullyOnTop = () => toast.evaluate(element => {
    const rect = element.getBoundingClientRect();
    return rect.top >= 0 && rect.left >= 0 && rect.right <= innerWidth && rect.bottom <= innerHeight
      && [[rect.left + rect.width / 2, rect.top + 2], [rect.right - 2, rect.top + rect.height / 2], [rect.left + rect.width / 2, rect.bottom - 2]]
        .every(([x, y]) => document.elementsFromPoint(x, y)[0] === element);
  });
  // Hit-testing also sees the toast, which normally lets clicks pass through.
  await toast.evaluate(element => { (element as HTMLElement).style.pointerEvents = 'auto'; });
  await expect.poll(fullyOnTop).toBe(true);
  await page.evaluate(async () => {
    const ui = window as any;
    await ui.openPage('page-grace');
    ui.setPageFocusMode(true);
  });
  await expect.poll(fullyOnTop).toBe(true);
  await page.setViewportSize({ width:390, height:620 });
  await page.evaluate(() => (window as any).showActivity('ОченьДлинноеНазваниеСтраницы'.repeat(15), 'running', true));
  await expect.poll(fullyOnTop).toBe(true);
  expect(await toast.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
});
