import { test, expect } from '../../fixtures/app.fixture.js';

test('@notes Alt+номер переключает вкладки по текущему порядку', async ({ appPage: page }) => {
  for (let index = 1; index < 10; index++) await page.locator('#newWorkspaceTab').click();
  const tabs = page.locator('.workspace-tab');
  for (const number of [1, 2, 9]) {
    await page.keyboard.press(`Alt+${number}`);
    await expect(tabs.nth(number - 1)).toHaveClass(/active/);
  }
  await page.keyboard.press('Alt+Shift+Digit1');
  await page.keyboard.press('Control+1');
  await page.keyboard.press('Control+Alt+2');
  await page.keyboard.press('Alt+0');
  await expect(tabs.nth(8)).toHaveClass(/active/);

  const firstId = await tabs.first().getAttribute('data-tab-id');
  await tabs.first().focus();
  await page.keyboard.press('Alt+Shift+ArrowRight');
  await page.keyboard.press('Alt+2');
  await expect(page.locator('.workspace-tab.active')).toHaveAttribute('data-tab-id', firstId!);
  for (let count = 10; count > 2; count--) await tabs.last().locator('.workspace-tab-close').click();
  await page.keyboard.press('Alt+9');
  await expect(tabs.nth(1)).toHaveClass(/active/);
});

test('@notes Alt+номер работает из HTML и возвращает фокус в активную вкладку', async ({ app, appPage: page }) => {
  await page.goto(`${app.baseUrl}/page/page-grace`);
  await page.getByRole('button', { name:'Показать HTML' }).click();
  const frame = page.frameLocator('#content iframe.html-frame');
  await expect(frame.locator('body')).toBeVisible();
  await expect(page.locator('#content')).not.toHaveAttribute('aria-busy', 'true');
  await page.locator('#newWorkspaceTab').click();
  await page.keyboard.press('Alt+1');
  await frame.locator('body').click({ position:{ x:5, y:5 } });
  await page.keyboard.press('Alt+2');
  await expect(page.locator('.workspace-tab').nth(1)).toHaveClass(/active/);
  await expect(page.locator('#content')).toBeFocused();
  await page.keyboard.press('Alt+1');
  await expect(frame.locator('body')).toBeVisible();
});

async function openGospelPages(page: import('@playwright/test').Page) {
  await page.locator('#tree > .source-row').filter({ hasText:'OneNote Cloud' }).click();
  await page.locator('#tree > .tree-row').filter({ hasText:'Учебный блокнот' }).click();
  await page.locator('#tree .section-row').filter({ hasText:'Евангелие от Иоанна' }).click();
}

for (const source of ['tree', 'new-tab', 'ribbon', 'search'] as const) {
  test(`@notes открытая заметка повторно активируется без загрузки и дубликатов (${source})`, async ({ app, appPage: page }) => {
    await page.setViewportSize({ width:1100, height:620 });
    await page.goto(`${app.baseUrl}/page/page-grace`);
    await page.getByRole('button', { name:'Показать HTML', exact:true }).click();
    const frame = page.frameLocator('#content iframe.html-frame');
    await expect(frame.locator('body')).toBeVisible();
    await expect(page.locator('#content')).not.toHaveAttribute('aria-busy', 'true');
    await page.locator('#content .html-zoom input').fill('140');
    await expect(frame.locator('html')).toHaveCSS('zoom', '1.4');
    await frame.locator('html').evaluate(element => { element.scrollTop = 750; });
    const scroll = await frame.locator('html').evaluate(element => element.scrollTop);
    expect(scroll).toBeGreaterThan(300);
    const firstTabId = await page.locator('.workspace-tab.active').getAttribute('data-tab-id');
    await page.locator('#content .page').evaluate(element => { (element as HTMLElement).dataset.reuseMarker = 'first'; });
    await openGospelPages(page);
    await page.locator('#tree .page-row').filter({ hasText:'Молитва учеников' }).click({ modifiers:['Control'] });
    await expect(page.locator('#content h2')).toHaveText('Молитва учеников');
    await page.locator('#content .page').evaluate(element => { (element as HTMLElement).dataset.reuseMarker = 'second'; });
    const secondTabId = await page.locator('.workspace-tab.active').getAttribute('data-tab-id');
    let contentRequests = 0;
    page.on('request', request => {
      if (['/api/page', '/api/page-html'].includes(new URL(request.url()).pathname)) contentRequests++;
    });
    if (source === 'ribbon') {
      const result = await page.evaluate(async () => {
        const ui = window as any;
        await ui.showRibbonPageLoading('Благодать и надежда');
        return ui.openPage('page-grace', { clearTarget:true, highlightQuery:'' });
      });
      expect(result?.reused).toBe(true);
    } else {
      if (source === 'search') await page.locator('#search').fill('Ин 3:16');
      await page.locator('#tree .page-row').filter({ hasText:'Благодать и надежда' })
        .click(source === 'new-tab' ? { modifiers:['Control'] } : {});
    }
    await expect(page.locator('.workspace-tab')).toHaveCount(2);
    await expect(page.locator('.workspace-tab.active')).toHaveAttribute('data-tab-id', firstTabId!);
    await expect(page.locator('#content .page')).toHaveAttribute('data-reuse-marker', 'first');
    await expect(page.locator('#content h2')).toHaveText('Благодать и надежда');
    await expect(frame.locator('html')).toHaveCSS('zoom', '1.4');
    if (source === 'search') {
      await expect(page.locator('.match-count')).toHaveText('1 / 3');
      await expect(frame.locator('[data-onenote-target-match="true"]')).toHaveCount(3);
    } else {
      await expect.poll(() => frame.locator('html').evaluate(element => element.scrollTop)).toBeCloseTo(scroll, 0);
    }
    expect(contentRequests).toBe(0);
    await page.locator(`.workspace-tab[data-tab-id="${secondTabId}"]`).click();
    await expect(page.locator('#content h2')).toHaveText('Молитва учеников');
    await expect(page.locator('#content .page')).toHaveAttribute('data-reuse-marker', 'second');
    expect(contentRequests).toBe(0);
  });
}

for (const view of ['text', 'html']) {
  test(`@notes Alt+номер сохраняет режим целиком и обновляет панель (${view})`, async ({ app, appPage: page }) => {
    await page.goto(`${app.baseUrl}/page/page-grace`);
    if (view === 'html') {
      await page.getByRole('button', { name:'Показать HTML' }).click();
      await expect(page.frameLocator('#content iframe').locator('body')).toBeVisible();
    }
    await expect(page.locator('#content')).not.toHaveAttribute('aria-busy', 'true');
    await openGospelPages(page);
    await page.locator('#tree .page-row').filter({ hasText:'Молитва учеников' }).click({ modifiers:['Control'] });
    await expect(page.locator('#content h2')).toHaveText('Молитва учеников');
    await page.locator('#newWorkspaceTab').click();
    await page.locator('#newWorkspaceTab').click();
    await page.evaluate(() => (window as any).openBibleTextInReader({ module:'rst', bookIndex:43, chapter:3, verse:16 }));
    await expect(page.locator('#content h2')).toHaveText('От Иоанна 3');
    await page.keyboard.press('Alt+1');
    await page.getByRole('button', { name:'Открыть страницу «Благодать и надежда» целиком' }).click();
    await page.locator('#pageFocusZoomRange').fill('140');
    if (view === 'html') {
      const frame = page.frameLocator('#content iframe');
      await expect(frame.locator('html')).toHaveClass(/onenote-page-focus-mode/);
      await frame.locator('body').click({ position:{ x:5, y:5 } });
    }
    await page.keyboard.press('Alt+2');
    await expect(page.locator('html')).toHaveClass(/page-focus-mode/);
    await expect(page.locator('#pageFocusTitle')).toHaveText('Молитва учеников');
    await expect(page.locator('#pageFocusZoomRange')).toHaveValue('100');
    await page.locator('#pageFocusMenuButton').click();
    await expect(page.locator('#pageFocusMenu .selected')).toHaveText('Молитва учеников');
    await page.keyboard.press('Alt+3');
    await expect(page.locator('html')).toHaveClass(/page-focus-mode/);
    await expect(page.locator('#pageFocusTitle')).toHaveText('Новая вкладка');
    await expect(page.locator('#pageFocusMenu')).toBeHidden();
    await expect(page.locator('#pageFocusZoom')).toBeHidden();
    await expect(page.locator('#pageFocusNext')).toBeDisabled();
    await page.keyboard.press('Alt+4');
    await expect(page.locator('html')).toHaveClass(/page-focus-mode/);
    await expect(page.locator('#pageFocusTitle')).toHaveText('Ин 3');
    await page.keyboard.press('Alt+1');
    await expect(page.locator('html')).toHaveClass(/page-focus-mode/);
    await expect(page.locator('#pageFocusTitle')).toHaveText('Благодать и надежда');
    await expect(page.locator('#pageFocusZoomRange')).toHaveValue('140');
    await page.keyboard.press('Alt+9');
    await expect(page.locator('#pageFocusTitle')).toHaveText('Благодать и надежда');
    await page.keyboard.press('Alt+2');
    await page.keyboard.press('Escape');
    await expect(page.locator('html')).not.toHaveClass(/page-focus-mode/);
    await page.keyboard.press('Alt+1');
    await expect(page.locator('html')).not.toHaveClass(/page-focus-mode/);
    if (view === 'html') {
      await expect(page.frameLocator('#content iframe').locator('html')).not.toHaveClass(/onenote-page-focus-mode/);
    }
  });
}

async function setStartupMode(page: import('@playwright/test').Page, mode: 'empty' | 'restore') {
  await page.locator('#openSettings').click();
  const section = page.locator('#settingsDialog details.view-settings');
  if (await section.getAttribute('open') === null) await section.locator('summary').click();
  await page.getByRole('combobox', { name:/При открытии приложения/ }).selectOption(mode);
  await page.locator('#closeSettings').click();
}

test('@notes @settings запуск восстанавливает прокрутку текста и Библии в разных вкладках', async ({ app, appPage: page }) => {
  await page.setViewportSize({ width:1100, height:620 });
  await setStartupMode(page, 'restore');
  await page.route('**/api/page?id=page-grace', async route => {
    const response = await route.fetch();
    const note = await response.json();
    note.text += '\n' + Array.from({ length:120 }, (_, index) => `Абзац заметки ${index + 1}`).join('\n');
    await route.fulfill({ json:note });
  });
  await page.route('**/api/bible/text?**', route => route.fulfill({ json:{
    module:'rst', bookIndex:43, bookName:'От Иоанна', bookShortName:'Ин', chapter:3,
    verses:Array.from({ length:60 }, (_, index) => ({ chapter:3, verse:index + 1, text:'Текст стиха для проверки прокрутки.' }))
  } }));
  await page.goto(`${app.baseUrl}/page/page-grace`);
  await expect(page.locator('#content h2')).toHaveText('Благодать и надежда');
  await page.locator('#content').evaluate(element => { element.scrollTop = 850; });
  const noteScroll = await page.locator('#content').evaluate(element => element.scrollTop);
  expect(noteScroll).toBeGreaterThan(300);
  await page.evaluate(() => (window as any).openBibleTextInReader({ module:'rst', bookIndex:43, chapter:3, verse:16 }));
  await expect(page.locator('#content h2')).toHaveText('От Иоанна 3');
  // Let the initial smooth navigation to verse 16 finish before choosing a new position.
  await expect.poll(() => page.locator('#content').evaluate(element => element.scrollTop)).toBeGreaterThan(0);
  await page.locator('#content').evaluate(element => element.scrollTo({ top:1250, behavior:'instant' }));
  const bibleScroll = await page.locator('#content').evaluate(element => element.scrollTop);
  expect(bibleScroll).toBeGreaterThan(300);
  await page.goto(app.baseUrl);
  await expect(page.locator('#content h2')).toHaveText('От Иоанна 3');
  await expect.poll(() => page.locator('#content').evaluate(element => element.scrollTop)).toBeCloseTo(bibleScroll, 0);
  await page.locator('.workspace-tab').first().click();
  await expect(page.locator('#content h2')).toHaveText('Благодать и надежда');
  await expect.poll(() => page.locator('#content').evaluate(element => element.scrollTop)).toBeCloseTo(noteScroll, 0);
});

test('@notes @settings запуск сохраняет прокрутку и масштаб HTML даже у неоткрытой восстановленной вкладки', async ({ app, appPage: page }) => {
  await page.setViewportSize({ width:1100, height:620 });
  await setStartupMode(page, 'restore');
  await page.goto(`${app.baseUrl}/page/page-grace`);
  await page.getByRole('button', { name:'Показать HTML' }).click();
  const frame = page.frameLocator('#content iframe.html-frame');
  await expect(frame.locator('body')).toBeVisible();
  await expect(page.locator('#content')).not.toHaveAttribute('aria-busy', 'true');
  await page.locator('#content .html-zoom input').fill('140');
  await expect(frame.locator('html')).toHaveCSS('zoom', '1.4');
  await frame.locator('html').evaluate(element => { element.scrollTop = 750; });
  const scrollTop = await frame.locator('html').evaluate(element => element.scrollTop);
  expect(scrollTop).toBeGreaterThan(300);
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('biblenote.tabs.session')!).tabs[0].viewState?.frameViewState?.scrollTop)).toBeCloseTo(scrollTop, 0);
  await page.locator('#newWorkspaceTab').click();
  await page.goto(app.baseUrl);
  await expect(page.locator('.workspace-tab')).toHaveCount(2);
  await expect(page.locator('#content .empty-state')).toBeVisible();
  // A second launch must not replace the unloaded HTML tab's saved position with zero.
  await page.reload();
  await expect(page.locator('.workspace-tab')).toHaveCount(2);
  await page.locator('.workspace-tab').first().click();
  await expect(frame.locator('body')).toBeVisible();
  await expect(frame.locator('html')).toHaveCSS('zoom', '1.4');
  await expect.poll(() => frame.locator('html').evaluate(element => element.scrollTop)).toBeCloseTo(scrollTop, 0);
});

test('@notes @settings при запуске по умолчанию открывается пустая страница', async ({ app, appPage: page }) => {
  await page.goto(`${app.baseUrl}/page/page-grace`);
  await expect(page.locator('#content h2')).toHaveText('Благодать и надежда');
  await page.goto(app.baseUrl);
  await expect(page.locator('#content .empty-state')).toContainText('Выберите страницу слева');
  await expect(page.locator('.workspace-tab')).toHaveCount(1);
  await page.locator('#openSettings').click();
  await page.locator('#settingsDialog details.view-settings > summary').click();
  await expect(page.locator('#startupMode')).toHaveValue('empty');
});

test('@notes @settings запуск восстанавливает порядок и активную вкладку, исключая закрытые вручную', async ({ app, appPage: page }) => {
  await setStartupMode(page, 'restore');
  await page.goto(`${app.baseUrl}/page/page-grace`);
  await expect(page.locator('#content h2')).toHaveText('Благодать и надежда');
  await openGospelPages(page);
  await page.locator('#tree .page-row').filter({ hasText:'Молитва учеников' }).click({ modifiers:['Control'] });
  await expect(page.locator('#content h2')).toHaveText('Молитва учеников');
  await page.locator('.workspace-tab').first().dragTo(page.locator('.workspace-tab').last());
  await page.locator('#newWorkspaceTab').click();
  await page.locator('.workspace-tab').first().click();

  await page.goto(app.baseUrl);
  await expect(page.locator('.workspace-tab-label')).toHaveText(['Молитва учеников', 'Благодать и надежда', 'Новая вкладка']);
  await expect(page.locator('.workspace-tab').first()).toHaveClass(/active/);
  await expect(page.locator('#content h2')).toHaveText('Молитва учеников');
  await page.locator('.workspace-tab').nth(1).click();
  await expect(page.locator('#content h2')).toHaveText('Благодать и надежда');
  await page.locator('.workspace-tab.active .workspace-tab-close').click();
  await expect(page.locator('#content .empty-state')).toContainText('Выберите страницу слева');

  await page.goto(app.baseUrl);
  await expect(page.locator('.workspace-tab-label')).toHaveText(['Молитва учеников', 'Новая вкладка']);
  await expect(page.locator('.workspace-tab').last()).toHaveClass(/active/);
  await expect(page.locator('#content .empty-state')).toContainText('Выберите страницу слева');
  await setStartupMode(page, 'empty');
  await page.goto(app.baseUrl);
  await expect(page.locator('.workspace-tab')).toHaveCount(1);
  await expect(page.locator('#content .empty-state')).toContainText('Выберите страницу слева');
});

test('@notes @settings запуск восстанавливает Библию и заметку, прямая ссылка имеет приоритет', async ({ app, appPage: page }) => {
  await setStartupMode(page, 'restore');
  await page.goto(`${app.baseUrl}/page/page-grace`);
  await page.locator('details.bible-page-refs summary').click();
  await page.getByRole('button', { name:'Показать в контексте Ин 3:16' }).click();
  await page.getByRole('button', { name:'Открыть в Библии', exact:true }).click();
  await expect(page.locator('#content h2')).toHaveText('От Иоанна 3');
  await page.goto(app.baseUrl);
  await expect(page.locator('.workspace-tab')).toHaveCount(2);
  await expect(page.locator('#content h2')).toHaveText('От Иоанна 3');
  await page.locator('.workspace-tab').first().click();
  await expect(page.locator('#content h2')).toHaveText('Благодать и надежда');
  await page.goto(app.baseUrl);
  await expect(page.locator('#content h2')).toHaveText('Благодать и надежда');
  await page.locator('.workspace-tab').last().click();
  await expect(page.locator('#content h2')).toHaveText('От Иоанна 3');
  await page.goto(`${app.baseUrl}/bible/rst/43/1`);
  await expect(page.locator('#content h2')).toHaveText('От Иоанна 1');
  await expect(page.locator('.workspace-tab')).toHaveCount(1);
});

test('@notes @settings повреждённая сессия не мешает открыть пустую страницу', async ({ app, appPage: page }) => {
  await setStartupMode(page, 'restore');
  await page.addInitScript(() => localStorage.setItem('biblenote.tabs.session', '{broken'));
  await page.goto(app.baseUrl);
  await expect(page.locator('#content .empty-state')).toContainText('Выберите страницу слева');
  await expect(page.locator('.workspace-tab')).toHaveCount(1);
});

test('@notes новая вкладка принимает выбранную заметку и сохраняет прежнюю', async ({ app, appPage: page }) => {
  await page.goto(`${app.baseUrl}/page/page-grace`);
  await expect(page.locator('#content h2')).toHaveText('Благодать и надежда');
  await page.locator('#newWorkspaceTab').click();
  await expect(page.locator('#content .empty-state')).toContainText('Выберите страницу слева');

  await openGospelPages(page);
  await page.locator('#tree .page-row').filter({ hasText:'Молитва учеников' }).click();
  await expect(page.locator('#content h2')).toHaveText('Молитва учеников');
  await expect(page.locator('.workspace-tab')).toHaveCount(2);

  await page.locator('.workspace-tab').filter({ hasText:'Благодать и надежда' }).click();
  await expect(page.locator('#content h2')).toHaveText('Благодать и надежда');
  await page.locator('.workspace-tab.active .workspace-tab-close').click();
  await expect(page.locator('#content h2')).toHaveText('Молитва учеников');
  await expect(page.locator('.workspace-tab')).toHaveCount(1);
});

test('@notes Ctrl+клик открывает заметку в новой вкладке', async ({ app, appPage: page }) => {
  await page.goto(`${app.baseUrl}/page/page-grace`);
  await openGospelPages(page);
  await page.locator('#tree .page-row').filter({ hasText:'Молитва учеников' }).click({ modifiers:['Control'] });

  await expect(page.locator('#content h2')).toHaveText('Молитва учеников');
  await expect(page.locator('.workspace-tab')).toHaveCount(2);
  await expect(page.locator('.workspace-tab').filter({ hasText:'Благодать и надежда' })).toHaveCount(1);
});

test('@notes вкладки можно переставлять перетаскиванием без смены активного содержимого', async ({ app, appPage: page }) => {
  await page.goto(`${app.baseUrl}/page/page-grace`);
  await page.locator('#newWorkspaceTab').click();
  await openGospelPages(page);
  await page.locator('#tree .page-row').filter({ hasText:'Молитва учеников' }).click();

  const tabs = page.locator('.workspace-tab');
  await expect(tabs).toHaveCount(2);
  await expect(tabs.locator('.workspace-tab-label')).toHaveText(['Благодать и надежда', 'Молитва учеников']);
  await expect(page.locator('#content h2')).toHaveText('Молитва учеников');

  await tabs.first().dragTo(tabs.last());

  await expect(tabs.locator('.workspace-tab-label')).toHaveText(['Молитва учеников', 'Благодать и надежда']);
  await expect(page.locator('#content h2')).toHaveText('Молитва учеников');
  await expect(tabs.first()).toHaveClass(/active/);
});
