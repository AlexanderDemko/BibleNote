import { test, expect } from '../../fixtures/app.fixture.js';

test('@bible параллельный стих из окна ссылки открывается в основном окне', async ({ app, page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('biblenote.setupWizardDone', 'true');
    localStorage.setItem('onenote.bibleModule', 'rst');
    window.close = () => { (window as Window & { popupCloseRequested?:boolean }).popupCloseRequested = true; };
  });
  const link = 'bnverse:rst/43%203;Ин%203';
  await page.goto(`${app.baseUrl}/?bibleVersePopup=1&openBibleRef=${encodeURIComponent(link)}`);
  await expect(page.locator('#bibleTextDialog')).toHaveAttribute('open', '');
  const actionRequest = page.waitForRequest(request =>
    new URL(request.url()).pathname === '/api/system/main-bible-action'
  );

  await page.locator('.bible-verse-parallel-button').nth(1).click();
  const request = await actionRequest;
  const body = request.postDataJSON();
  expect(body.action).toBe('parallel');
  expect(body.ref).toMatchObject({ bookIndex:43, chapter:3, verse:2 });
  await expect(page.locator('#bibleParallelDrawer')).toBeHidden();
  await expect.poll(() => page.evaluate(() =>
    (window as Window & { popupCloseRequested?:boolean }).popupCloseRequested
  )).toBe(true);
});

for (const mode of ['current', 'dedicated', 'new']) {
  test(`@bible ссылка и смена главы сохраняют режим целиком (${mode})`, async ({ app, appPage: page }) => {
    await page.evaluate(value => localStorage.setItem('biblenote.tabs.bibleOpenMode', value), mode);
    await page.goto(`${app.baseUrl}/page/page-grace`);
    await page.getByRole('button', { name:'Показать HTML' }).click();
    const frame = page.frameLocator('#content iframe.html-frame');
    await expect(frame.locator('body')).toBeVisible();
    await expect(page.locator('#content')).not.toHaveAttribute('aria-busy', 'true');
    await page.getByRole('button', { name:'Открыть страницу «Благодать и надежда» целиком' }).click();
    const openLink = async () => {
      await frame.getByText('Ин 3:16', { exact:true }).last().click();
      await expect(page.locator('#bibleTextDialog')).toHaveAttribute('open', '');
      await page.getByRole('button', { name:'Открыть в Библии', exact:true }).click();
      await expect(page.locator('#content h2')).toHaveText('От Иоанна 3');
      await expect(page.locator('html')).toHaveClass(/page-focus-mode/);
      await expect(page.locator('#pageFocusTitle')).toHaveText('Ин 3');
      await expect(page.locator('#pageFocusZoom')).toBeHidden();
    };
    await openLink();
    await expect(page.locator('.workspace-tab')).toHaveCount(mode === 'current' ? 1 : 2);
    await page.locator('.bible-reader-toolbar .bible-reader-nav-button').first().click();
    await expect(page.locator('#content h2')).toHaveText('От Иоанна 2');
    await expect(page.locator('html')).toHaveClass(/page-focus-mode/);
    await expect(page.locator('#pageFocusTitle')).toHaveText('Ин 2');
    if (mode !== 'current') {
      await page.keyboard.press('Alt+1');
      await expect(page.locator('#pageFocusTitle')).toHaveText('Благодать и надежда');
      await expect(frame.locator('html')).toHaveClass(/onenote-page-focus-mode/);
      await openLink();
      await expect(page.locator('.workspace-tab')).toHaveCount(mode === 'dedicated' ? 2 : 3);
    }
    await page.keyboard.press('Escape');
    await expect(page.locator('html')).not.toHaveClass(/page-focus-mode/);
  });
}

test('@bible отдельная вкладка сохраняет Word/HTML загруженным и на прежней позиции', async ({ app, appPage: page }) => {
  await page.setViewportSize({ width:1100, height:620 });
  await page.goto(`${app.baseUrl}/page/page-grace`);
  await page.getByRole('button', { name:'Показать HTML' }).click();

  const frame = page.frameLocator('iframe.html-frame');
  await expect(frame.locator('body')).toBeVisible();
  await frame.locator('html').evaluate(element => {
    element.scrollTop = element.scrollHeight;
  });
  const scrollTop = await frame.locator('html').evaluate(element => element.scrollTop);
  expect(scrollTop).toBeGreaterThan(300);
  await frame.locator('html').evaluate(element => {
    (element.ownerDocument.defaultView as Window & { bibleNoteTabSentinel?:string }).bibleNoteTabSentinel = 'still-loaded';
  });

  await frame.getByText('Ин 3:16', { exact:true }).last().click();
  await expect(page.locator('#bibleTextDialog')).toHaveAttribute('open', '');
  await page.getByRole('button', { name:'Открыть в Библии', exact:true }).click();
  await expect(page.locator('#content h2')).toHaveText('От Иоанна 3');
  await expect(page.locator('.workspace-tab')).toHaveCount(2);

  await page.locator('.workspace-tab').filter({ hasText:'Благодать и надежда' }).click();
  await expect(page.locator('#content h2')).toHaveText('Благодать и надежда');
  await expect(frame.locator('body')).toBeVisible();
  await expect.poll(() => frame.locator('html').evaluate(element =>
    (element.ownerDocument.defaultView as Window & { bibleNoteTabSentinel?:string }).bibleNoteTabSentinel
  )).toBe('still-loaded');
  await expect.poll(async () => frame.locator('html').evaluate(element => element.scrollTop)).toBeCloseTo(scrollTop, 0);

  await frame.getByText('Ин 3:16', { exact:true }).last().click();
  await page.getByRole('button', { name:'Открыть в Библии', exact:true }).click();
  await expect(page.locator('#content h2')).toHaveText('От Иоанна 3');
  await expect(page.locator('.workspace-tab')).toHaveCount(2);
});

test('@bible режим текущей вкладки сохраняет обычную историю Назад', async ({ app, page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('biblenote.setupWizardDone', 'true');
    localStorage.setItem('biblenote.microsoftScopeVersion', 'notes-read-all-v1');
    localStorage.setItem('onenote.pageViewMode', 'text');
    localStorage.setItem('onenote.bibleModule', 'rst');
    localStorage.setItem('biblenote.tabs.bibleOpenMode', 'current');
  });
  await page.goto(`${app.baseUrl}/page/page-grace`);
  await page.locator('details.bible-page-refs summary').click();
  await page.getByRole('button', { name:'Показать в контексте Ин 3:16' }).click();
  await page.getByRole('button', { name:'Открыть в Библии', exact:true }).click();

  await expect(page.locator('.workspace-tab')).toHaveCount(1);
  await expect(page.locator('#content h2')).toHaveText('От Иоанна 3');
  await page.locator('#content .view-history-back').click();
  await expect(page.locator('#content h2')).toHaveText('Благодать и надежда');
});

test('@bible переключение вкладки во время загрузки не заменяет активную заметку', async ({ app, appPage: page }) => {
  await page.route('**/api/bible/text?**', async route => {
    await new Promise(resolve => setTimeout(resolve, 500));
    await route.fulfill({
      status:200,
      contentType:'application/json',
      body:JSON.stringify({
        module:'rst', moduleName:'Русский синодальный', bookIndex:43,
        bookName:'От Иоанна', bookShortName:'Ин', chapter:3, reference:'Ин 3',
        verses:[{ chapter:3, verse:16, text:'Ибо так возлюбил Бог мир.' }]
      })
    });
  });
  await page.goto(`${app.baseUrl}/page/page-grace`);
  await expect(page.locator('#content h2')).toHaveText('Благодать и надежда');
  await page.evaluate(() => {
    void (window as typeof window & {
      openBibleTextInReader:(ref: Record<string, unknown>) => Promise<void>;
    }).openBibleTextInReader({ module:'rst', bookIndex:43, chapter:3, verse:16 });
  });
  await expect(page.locator('.workspace-tab')).toHaveCount(2);
  await page.locator('.workspace-tab').filter({ hasText:'Благодать и надежда' }).click();

  await page.waitForTimeout(650);
  await expect(page.locator('#content h2')).toHaveText('Благодать и надежда');
  await page.locator('.workspace-tab').filter({ hasText:'Библия' }).click();
  await expect(page.locator('#content h2')).toHaveText('От Иоанна 3');
});

test('@bible читатель открывает главу и переключается на следующую', async ({ app, appPage: page }) => {
  await page.goto(`${app.baseUrl}/bible/rst/43/1`);

  await expect(page.locator('#content h2')).toHaveText('От Иоанна 1');
  await expect(page.locator('#bible-verse-1-1 .bible-reader-verse-text')).toContainText('В начале было Слово');
  await expect(page.locator('.bible-reader-verse')).toHaveCount(3);

  await page.locator('.bible-reader-toolbar .bible-reader-nav-button').last().click();
  await expect(page.locator('#content h2')).toHaveText('От Иоанна 2');
  await expect(page).toHaveURL(/\/bible\/rst\/43\/2$/);
});

test('@bible меню переводов закрывается по клику снаружи и остаётся открытым при выборе', async ({ app, appPage: page }) => {
  await page.goto(`${app.baseUrl}/bible/rst/43/1`);
  const picker = page.locator('.bible-reader-translations');
  const summary = picker.locator('summary');
  const menu = picker.locator('.bible-reader-translations-menu');
  const translation = picker.locator('input[value="kjv"]');

  await summary.click();
  await expect(menu).toBeVisible();
  await picker.locator('.bible-reader-translations-hint').click();
  await expect(menu).toBeVisible();
  await translation.check();
  await expect(menu).toBeVisible();
  await expect(translation).toBeChecked();
  await expect(summary).toHaveAttribute('title', 'Переводы: выбрано 1 из 3');

  const heading = page.locator('#content h2');
  await heading.evaluate(element => {
    element.addEventListener('pointerdown', event => event.stopPropagation());
  });
  await heading.click();
  await expect(menu).toBeHidden();
  await expect(summary).toHaveAttribute('title', 'Переводы: выбрано 1 из 3');

  await summary.click();
  await expect(menu).toBeVisible();
  await expect(translation).toBeChecked();
  await summary.click();
  await expect(menu).toBeHidden();
  await summary.click();
  await translation.uncheck();
  await picker.getByRole('button', { name:'Показать', exact:true }).click();
  await expect(page.locator('.bible-reader-translations-menu')).toBeHidden();
  await expect(page.locator('#content h2')).toHaveText('От Иоанна 1');
});

test('@bible быстрый поиск в панели параллельных мест фильтрует ссылки и текст стихов', async ({ app, appPage: page }) => {
  await page.route('**/api/bible/parallel?**', route => route.fulfill({
    status:200,
    contentType:'application/json',
    body:JSON.stringify({ rows:[
      {
        bookIndex:11, bookName:'3 Царств', chapter:8, verse:53,
        relationWeight:0.91, maxRelationWeight:1, relations:2, paragraphs:2,
        pages:1, commonNotePageIds:['page-grace']
      },
      {
        bookIndex:43, bookName:'От Иоанна', chapter:15, verse:8,
        relationWeight:0.82, maxRelationWeight:1, relations:2, paragraphs:2,
        pages:1, commonNotePageIds:['page-grace']
      }
    ] })
  }));
  await page.route('**/api/bible/text?**', async route => {
    const url = new URL(route.request().url());
    const bookIndex = Number(url.searchParams.get('bookIndex'));
    const chapter = Number(url.searchParams.get('chapter'));
    const verse = Number(url.searchParams.get('verse'));
    const texts = new Map([
      ['11:8:53', 'ибо Ты отделил их Себе в удел из всех народов земли'],
      ['43:15:8', 'Тем прославится Отец Мой, если вы принесете много плода']
    ]);
    const text = texts.get(`${bookIndex}:${chapter}:${verse}`);
    if (!text) {
      await route.fallback();
      return;
    }
    await route.fulfill({
      status:200,
      contentType:'application/json',
      body:JSON.stringify({
        module:'rst', bookIndex, chapter,
        verses:[{ chapter, verse, reference:`${chapter}:${verse}`, text }]
      })
    });
  });

  await page.goto(`${app.baseUrl}/bible/rst/43/1`);
  await page.evaluate(() => {
    void (window as typeof window & {
      openBibleParallelPanel:(ref: Record<string, unknown>) => Promise<void>;
    }).openBibleParallelPanel({
      module:'rst', bookIndex:43, bookName:'От Иоанна', chapter:1, verse:1
    });
  });

  const drawer = page.locator('#bibleParallelDrawer');
  const rows = drawer.locator('.bible-parallel-row');
  const search = page.getByRole('searchbox', { name:'Поиск по параллельным ссылкам и тексту Библии' });
  await expect(drawer).toBeVisible();
  await expect(rows).toHaveCount(2);
  await expect(rows.filter({ hasText:'Тем прославится Отец Мой' })).toBeVisible();

  await search.fill('3Цар 8:53');
  await expect(rows.filter({ hasText:'3 Царств 8:53' })).toBeVisible();
  await expect(rows.filter({ hasText:'От Иоанна 15:8' })).toBeHidden();

  await search.fill('прославится Отец');
  await expect(rows.filter({ hasText:'3 Царств 8:53' })).toBeHidden();
  await expect(rows.filter({ hasText:'От Иоанна 15:8' })).toBeVisible();

  await search.fill('нет такого стиха');
  await expect(drawer.locator('.bible-parallel-filter-empty')).toBeVisible();

  await search.clear();
  await expect(rows.filter({ hasText:'3 Царств 8:53' })).toBeVisible();
  await expect(rows.filter({ hasText:'От Иоанна 15:8' })).toBeVisible();
});

test('@bible повторный клик снимает выделение стиха, а HTML-сущности декодируются', async ({ app, appPage: page }) => {
  await page.goto(`${app.baseUrl}/bible/rst/43/1`);
  const verse = page.locator('#bible-verse-1-1');

  await verse.click();
  await expect(verse).toHaveClass(/selected/);
  await verse.click();
  await expect(verse).not.toHaveClass(/selected/);

  await expect(page.locator('#bible-verse-1-3 .bible-reader-verse-text')).toContainText('знак < не должен');
  await expect(page.locator('#bible-verse-1-3 .bible-reader-verse-text')).not.toContainText('&lt;');
});

test('@bible длинный контекст помещается в окно и клик по фону закрывает диалог', async ({ app, appPage: page }) => {
  await page.setViewportSize({ width:900, height:520 });
  await page.goto(`${app.baseUrl}/page/page-grace`);
  const references = page.locator('details.bible-page-refs');
  await references.locator('summary').click();
  await references.getByRole('button', { name:'Показать в контексте Ин 3:16' }).click();

  const dialog = page.locator('#bibleTextDialog');
  await expect(dialog).toHaveAttribute('open', '');
  await expect(page.locator('#bibleTextContent')).toContainText('Контекстный стих 21');
  const bounds = await dialog.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.height).toBeLessThanOrEqual(488);
  await expect.poll(() => page.locator('#bibleTextContent').evaluate(element => element.scrollHeight > element.clientHeight)).toBe(true);

  await dialog.evaluate(element => element.dispatchEvent(new MouseEvent('click', {
    bubbles:true,
    clientX:1,
    clientY:1
  })));
  await expect(dialog).not.toHaveAttribute('open', '');
});
