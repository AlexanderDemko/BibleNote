import type { Page } from '@playwright/test';
import { test, expect } from '../../fixtures/app.fixture.js';

async function psalmRoutes(page:Page, shorterTarget=false) {
  await page.setViewportSize({ width:1100, height:700 });
  await page.route('**/api/bible/books?**', route => route.fulfill({ json:{ books:[{
    index:19, name:'Псалтирь', shortName:'Пс', chapterCount:150,
    chapters:Array.from({ length:150 }, (_, index) => index + 1)
  }] } }));
  await page.route('**/api/bible/text?**', route => {
    const params = new URL(route.request().url()).searchParams;
    const chapter = Number(params.get('chapter'));
    return route.fulfill({ json:{
      module:params.get('module'), moduleName:params.get('module'),
      bookIndex:19, bookName:'Псалтирь', bookShortName:'Пс', chapter,
      verses:Array.from({ length:40 }, (_, index) => ({
        chapter, verse:index + 1,
        text:`Стих ${index + 1}. ` + 'Длинный текст для проверки места чтения при смене перевода. '
          .repeat(shorterTarget ? params.get('module') === 'rst' ? 20 : 1 : 6)
      }))
    } });
  });
  await page.route('**/api/bible/parallel-text?**', route => {
    const params = new URL(route.request().url()).searchParams;
    const chapter = Number(params.get('chapter'));
    const baseModule = params.get('baseModule');
    // Correspondences from Api/Modules/rst/manifest.xml, including the
    // superscription and the point where RST Psalm 9 becomes KJV Psalm 10.
    const rows = Array.from({ length:40 }, (_, index) => {
      const source = index + 1;
      let targetChapter = chapter;
      let verse = source;
      let topVerse:number | undefined;
      if (baseModule === 'rst' && chapter === 50) {
        targetChapter = 51;
        verse = Math.max(1, source - 2);
      } else if (baseModule === 'kjv' && chapter === 51) {
        targetChapter = 50;
        verse = source === 1 ? 1 : source + 2;
        if (source === 1) topVerse = 3;
      } else if (baseModule === 'rst' && chapter === 9) {
        targetChapter = source >= 22 ? 10 : 9;
        verse = source >= 22 ? source - 21 : Math.max(1, source - 1);
      } else if (baseModule === 'kjv' && chapter === 10) {
        targetChapter = 9;
        verse = source + 21;
      }
      return { baseChapter:chapter, baseVerse:source, verses:[{
        chapter:targetChapter, verse, topVerse, text:`Соответствие ${targetChapter}:${verse}`
      }] };
    });
    return route.fulfill({ json:{ baseModule, module:params.get('module'), rows } });
  });
}

async function verseOffset(page:Page, chapter:number, verse:number) {
  return page.locator(`#content #bible-verse-${chapter}-${verse}`).evaluate(element =>
    element.getBoundingClientRect().top - element.closest('main')!.getBoundingClientRect().top
  );
}

async function positionVerse(page:Page, chapter:number, verse:number, offset=60) {
  await page.locator(`#content #bible-verse-${chapter}-${verse}`).evaluate((element, top) => {
    const pane = element.closest('main')!;
    pane.scrollTo({
      top:pane.scrollTop + element.getBoundingClientRect().top - pane.getBoundingClientRect().top - top,
      behavior:'instant'
    });
  }, offset);
}

async function switchTranslation(page:Page, module:string) {
  if (await page.locator('.bible-reader-panel').getAttribute('open') === null) {
    await page.locator('#bibleReaderSummary').click();
  }
  await page.locator('#bibleReaderModule').selectOption(module);
}

for (const parallel of [false, true]) {
  test(`@bible Psalm reading position maps both chapter and verse in both directions (${parallel ? 'comparison' : 'single'})`, async ({ app, appPage:page }) => {
    await psalmRoutes(page);
    if (parallel) await page.evaluate(() => localStorage.setItem('biblenote.reader.translationModules', '["rst","kjv"]'));
    await page.goto(`${app.baseUrl}/bible/rst/19/50`);
    const source = page.locator('#content #bible-verse-50-12');
    await source.click();
    await positionVerse(page, 50, 12);
    const before = await verseOffset(page, 50, 12);
    await switchTranslation(page, 'kjv');
    await expect(page).toHaveURL(/\/bible\/kjv\/19\/51\?verse=10$/);
    await expect(page.locator('#content #bible-verse-51-10')).toHaveClass(/selected/);
    await expect.poll(async () => Math.abs(await verseOffset(page, 51, 10) - before)).toBeLessThan(2);
    await expect(page.locator('#bibleReaderChapter')).toHaveValue('51');
    await switchTranslation(page, 'rst');
    await expect(page).toHaveURL(/\/bible\/rst\/19\/50\?verse=12$/);
    await expect(page.locator('#content #bible-verse-50-12')).toHaveClass(/selected/);
    await expect.poll(async () => Math.abs(await verseOffset(page, 50, 12) - before)).toBeLessThan(2);
    expect(await page.evaluate(() => localStorage.getItem('onenote.bibleModule'))).toBe('rst');
  });
}

test('@bible a scrolled Psalm maps the visible verse instead of an old offscreen selection', async ({ app, appPage:page }) => {
  await psalmRoutes(page);
  await page.goto(`${app.baseUrl}/bible/rst/19/9`);
  await page.locator('#content #bible-verse-9-1').click();
  // The verse at the top is partially visible, without any selected verse in view.
  await positionVerse(page, 9, 25, -12);
  const before = await verseOffset(page, 9, 25);
  await switchTranslation(page, 'kjv');
  await expect(page).toHaveURL(/\/bible\/kjv\/19\/10$/);
  await expect(page.locator('#content .selected')).toHaveCount(0);
  await expect.poll(async () => Math.abs(await verseOffset(page, 10, 4) - before)).toBeLessThan(2);
  await switchTranslation(page, 'rst');
  await expect(page).toHaveURL(/\/bible\/rst\/19\/9$/);
  await expect.poll(async () => Math.abs(await verseOffset(page, 9, 25) - before)).toBeLessThan(2);
});

test('@bible a split Psalm verse opens at the start of its mapped passage', async ({ app, appPage:page }) => {
  await psalmRoutes(page);
  await page.goto(`${app.baseUrl}/bible/kjv/19/51`);
  await page.locator('#content #bible-verse-51-1').click();
  await switchTranslation(page, 'rst');
  await expect(page).toHaveURL(/\/bible\/rst\/19\/50\?verse=1&topVerse=3$/);
  await expect(page.locator('#content .bible-reader-verse.selected, #content .bible-reader-translation-row.selected')).toHaveCount(3);
  await expect(page.locator('#content #bible-verse-50-1')).toBeInViewport();
});

test('@bible reading inside a long verse remains inside its shorter translation', async ({ app, appPage:page }) => {
  await psalmRoutes(page, true);
  await page.goto(`${app.baseUrl}/bible/rst/19/50`);
  const fraction = await page.locator('#content #bible-verse-50-12').evaluate(element => {
    const pane = element.closest('main')!;
    const rect = element.getBoundingClientRect();
    pane.scrollTo({ top:pane.scrollTop + rect.top - pane.getBoundingClientRect().top + rect.height / 2, behavior:'instant' });
    return -(element.getBoundingClientRect().top - pane.getBoundingClientRect().top) / rect.height;
  });
  await switchTranslation(page, 'kjv');
  await expect(page).toHaveURL(/\/bible\/kjv\/19\/51$/);
  const target = page.locator('#content #bible-verse-51-10');
  await expect(target).toBeInViewport();
  await expect.poll(() => target.evaluate((element, sourceFraction) => {
    const rect = element.getBoundingClientRect();
    return Math.abs(-(rect.top - element.closest('main')!.getBoundingClientRect().top) / rect.height - sourceFraction);
  }, fraction)).toBeLessThan(0.03);
});

test('@bible a missing correspondence keeps the original translation and reading position', async ({ app, appPage:page }) => {
  await psalmRoutes(page);
  await page.goto(`${app.baseUrl}/bible/rst/19/50`);
  await positionVerse(page, 50, 12, -12);
  const before = await verseOffset(page, 50, 12);
  await page.route('**/api/bible/parallel-text?**', route => route.fulfill({ json:{
    baseModule:'rst', module:'kjv', rows:[{ baseChapter:50, baseVerse:12, verses:[{ chapter:51, verse:10, isEmpty:true }] }]
  } }));
  await switchTranslation(page, 'kjv');
  await expect(page.locator('#bibleReaderStatus')).toContainText('нет соответствующего стиха');
  await expect(page.locator('#bibleReaderModule')).toHaveValue('rst');
  await expect(page).toHaveURL(/\/bible\/rst\/19\/50$/);
  expect(Math.abs(await verseOffset(page, 50, 12) - before)).toBeLessThan(2);
  expect(await page.evaluate(() => localStorage.getItem('biblenote.reader.module'))).toBe('rst');
});

test('@bible changing the main translation in settings also maps the current reading position', async ({ app, appPage:page }) => {
  await psalmRoutes(page);
  await page.goto(`${app.baseUrl}/bible/rst/19/50`);
  await positionVerse(page, 50, 12, -12);
  const before = await verseOffset(page, 50, 12);
  await page.locator('#openSettings').click();
  await page.locator('#settingsDialog .biblenote-settings > summary').click();
  await page.locator('#bibleModuleName').selectOption('kjv');
  await expect(page).toHaveURL(/\/bible\/kjv\/19\/51$/);
  await page.locator('#closeSettings').click();
  await expect.poll(async () => Math.abs(await verseOffset(page, 51, 10) - before)).toBeLessThan(2);
  expect(await page.evaluate(() => localStorage.getItem('onenote.bibleModule'))).toBe('kjv');
});
