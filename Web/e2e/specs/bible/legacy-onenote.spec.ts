import { test, expect } from '../../fixtures/app.fixture.js';

test('@bible открывает текущую главу через старый BibleNote после перехода по ссылке', async ({ app, appPage: page }) => {
  await page.evaluate(() => localStorage.setItem('biblenote.onenoteLinksOpenInBible', 'true'));
  await page.goto(`${app.baseUrl}/?openBibleRef=${encodeURIComponent('isbtBibleVerse:rst/43 3:16;Ин 3:16')}`);
  await expect(page.locator('#content h2')).toHaveText('От Иоанна 3');
  const button = page.getByRole('button', { name:'Открыть главу в OneNote', exact:true });
  await expect(button).toHaveAttribute('title', 'Открыть главу в OneNote через старый BibleNote');
  const opened = page.waitForResponse(response => response.url().endsWith('/api/system/legacy-bible/open-chapter'));
  await button.click();
  expect(await (await opened).json()).toEqual({ opened:true, method:'POST', ref:{ bookIndex:43, chapter:3, bookName:'Ин' } });

  await page.locator('.bible-reader-toolbar .bible-reader-nav-button').first().click();
  await expect(page.locator('#content h2')).toHaveText('От Иоанна 2');
  const nextOpened = page.waitForResponse(response => response.url().endsWith('/api/system/legacy-bible/open-chapter'));
  await button.click();
  expect((await (await nextOpened).json()).ref).toEqual({ bookIndex:43, chapter:2, bookName:'Ин' });
  await page.evaluate(() => {
    const input = document.querySelector<HTMLInputElement>('#openOneNoteBibleLinksInReader')!;
    input.checked = false;
    input.dispatchEvent(new Event('change'));
  });
  await expect(button).toBeVisible();
  await page.evaluate(() => {
    const input = document.querySelector<HTMLInputElement>('#openOneNoteBibleLinksInReader')!;
    input.checked = true;
    input.dispatchEvent(new Event('change'));
  });
  await expect(button).toBeVisible();
});

test('@bible окно ссылки открывает исходный стих в OneNote после показа контекста', async ({ app, appPage: page }) => {
  await page.evaluate(() => localStorage.setItem('biblenote.onenoteLinksOpenInBible', 'true'));
  await page.goto(`${app.baseUrl}/page/page-grace`);
  await page.locator('details.bible-page-refs summary').click();
  await page.getByRole('button', { name:'Показать в контексте Ин 3:16' }).click();
  const opened = page.waitForResponse(response => response.url().endsWith('/api/system/legacy-bible/open-verse'));
  await page.getByRole('button', { name:'Открыть стих в OneNote', exact:true }).click();
  expect((await (await opened).json()).ref).toEqual({ bookIndex:43, chapter:3, bookName:'Ин', verse:16 });
});

test('@bible отдельное окно ссылки переходит к началу исходного диапазона независимо от настройки', async ({ app, appPage: page }) => {
  await page.evaluate(() => localStorage.setItem('biblenote.onenoteLinksOpenInBible', 'false'));
  const link = 'bnVerse:rst/43 3:16-4:2;Ин 3:16-4:2';
  await page.goto(`${app.baseUrl}/?bibleVersePopup=1&openBibleRef=${encodeURIComponent(link)}`);
  const button = page.getByRole('button', { name:'Открыть стих в OneNote', exact:true });
  await expect(button).toBeVisible();
  await page.getByRole('button', { name:'Показать в контексте', exact:true }).click();
  const opened = page.waitForResponse(response => response.url().endsWith('/api/system/legacy-bible/open-verse'));
  await button.click();
  expect((await (await opened).json()).ref).toEqual({ bookIndex:43, chapter:3, bookName:'Ин', verse:16 });

  await page.evaluate(async () => {
    const popup = window as Window & { bibleNoteOpenBibleRef:(link: string) => Promise<void> };
    await popup.bibleNoteOpenBibleRef('bnVerse:rst/43 2:5-7;Ин 2:5-7');
  });
  await page.locator('#bibleTextBack').click();
  await expect(page.locator('#bibleTextTitle')).toContainText('Ин 3');
  const restored = page.waitForResponse(response => response.url().endsWith('/api/system/legacy-bible/open-verse'));
  await button.click();
  expect((await (await restored).json()).ref).toEqual({ bookIndex:43, chapter:3, bookName:'Ин', verse:16 });
});

test('@bible отдельное окно скрывает кнопку стиха без старого BibleNote', async ({ app, appPage: page }) => {
  await page.evaluate(() => localStorage.setItem('biblenote.onenoteLinksOpenInBible', 'false'));
  await page.route('**/api/system/legacy-bible', route => route.fulfill({ json:{ available:false } }));
  await page.goto(`${app.baseUrl}/?bibleVersePopup=1&openBibleRef=${encodeURIComponent('bnVerse:rst/43 3:16;Ин 3:16')}`);
  await expect(page.locator('#bibleTextDialog')).toHaveAttribute('open', '');
  await expect(page.locator('#bibleTextDialog .legacy-bible-chapter-button')).toHaveCount(1);
  await expect(page.getByRole('button', { name:'Открыть стих в OneNote', exact:true })).toHaveCount(0);
});

test('@bible глава открывается в OneNote при выключенном открытии ссылок в читателе', async ({ app, appPage: page }) => {
  await page.evaluate(() => localStorage.setItem('biblenote.onenoteLinksOpenInBible', 'false'));
  await page.goto(`${app.baseUrl}/bible/rst/43/3`);
  const button = page.getByRole('button', { name:'Открыть главу в OneNote', exact:true });
  await expect(button).toBeVisible();
  const opened = page.waitForResponse(response => response.url().endsWith('/api/system/legacy-bible/open-chapter'));
  await button.click();
  expect((await (await opened).json()).ref).toEqual({ bookIndex:43, chapter:3, bookName:'Ин' });
});

test('@bible скрывает переход к главе без старого BibleNote', async ({ app, appPage: page }) => {
  await page.route('**/api/system/legacy-bible', route => route.fulfill({ json:{ available:false } }));
  await page.goto(`${app.baseUrl}/bible/rst/43/3`);
  await expect(page.locator('#content h2')).toHaveText('От Иоанна 3');
  await expect(page.locator('.bible-reader-toolbar .legacy-bible-chapter-button')).toHaveCount(1);
  await expect(page.getByRole('button', { name:'Открыть главу в OneNote', exact:true })).toHaveCount(0);
});

test('@bible повторные ссылки используют проверенную доступность и показывают кнопку до загрузки текста', async ({ app, appPage: page }) => {
  let statusRequests = 0;
  await page.route('**/api/system/legacy-bible', route => {
    statusRequests += 1;
    return route.fulfill({ json:{ available:true } });
  });
  await page.goto(`${app.baseUrl}/?bibleVersePopup=1&openBibleRef=${encodeURIComponent('bnVerse:rst/43 3:16;Ин 3:16')}`);
  const button = page.getByRole('button', { name:'Открыть стих в OneNote', exact:true });
  await expect(button).toBeVisible();
  await expect(page.locator('#bibleTextContent')).not.toHaveText('Загрузка...');

  let releaseText!: () => void;
  const textGate = new Promise<void>(resolve => { releaseText = resolve; });
  await page.route('**/api/bible/text?*', async route => {
    await textGate;
    await route.continue();
  });
  try {
    const loadingText = page.waitForRequest(request => request.url().includes('/api/bible/text?'));
    await page.evaluate(() => {
      const popup = window as Window & { bibleNoteOpenBibleRef:(link: string) => Promise<void> };
      void popup.bibleNoteOpenBibleRef('bnVerse:rst/43 2:5-7;Ин 2:5-7');
    });
    await loadingText;
    await expect(page.locator('#bibleTextContent')).toHaveText('Загрузка...');
    await expect(button).toBeVisible();
    expect(statusRequests).toBe(1);
  } finally {
    releaseText();
  }
  await expect(page.locator('#bibleTextContent')).not.toHaveText('Загрузка...');
  await page.getByRole('button', { name:'Показать в контексте', exact:true }).click();
  await expect(button).toBeVisible();
  expect(statusRequests).toBe(1);
});
