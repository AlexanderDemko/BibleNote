import { test, expect } from '../../fixtures/app.fixture.js';

for (const [width, parallel] of [[1280, true], [600, false]] as const) {
  test(`@bible verse translations show every installed module with mapped verses (${width})`, async ({ app, appPage:page }, testInfo) => {
    await page.setViewportSize({ width, height:760 });
    await page.evaluate(value => {
      localStorage.setItem('biblenote.reader.module', 'kjv');
      localStorage.setItem('biblenote.reader.translationModules', JSON.stringify(value ? ['kjv','rst'] : ['kjv']));
    }, parallel);
    await page.route('**/api/biblenote/modules', route => route.fulfill({ json:{ available:true, modules:[
      { shortName:'rst', displayName:'Русский синодальный' },
      { shortName:'kjv', displayName:'King James Version' },
      { shortName:"bti'15", displayName:'Перевод Кулакова' },
      { shortName:'missing', displayName:'Перевод без этого стиха' },
      { shortName:'broken', displayName:'Недоступный перевод' }
    ] } }));
    await page.route('**/api/bible/parallel-text?**', route => {
      const params = new URL(route.request().url()).searchParams;
      const module = params.get('module');
      if (module === 'broken') return route.fulfill({ status:503, json:{ error:'Temporary failure' } });
      const verses = module === 'rst' ? [
        { chapter:4, verse:7, text:'Первое соответствие.', richText:{
          decorations:[{ startOffset:0, endOffset:6, kind:'italic' }],
          footnotes:[{ offset:6, marker:'[1]', text:'Пояснение к соответствующему стиху.' }]
        } },
        { chapter:4, verse:8, text:'Второе соответствие.' }
      ] : module === 'missing' ? [{ chapter:3, verse:2, isEmpty:true }] : [
        { chapter:3, verse:2, text:'Другой перевод &lt;стиха&gt;.' }
      ];
      return route.fulfill({ json:{ module, rows:[{ baseChapter:3, baseVerse:2, verses }] } });
    });
    await page.goto(`${app.baseUrl}/bible/kjv/43/3`);
    if (width === 600) await page.evaluate(() => document.documentElement.dataset.theme = 'c');
    const row = page.locator('#content #bible-verse-3-2');
    const button = row.getByRole('button', { name:'Показать переводы для Ин 3:2', exact:true });
    await expect(button.locator('svg')).toHaveCount(1);
    const before = await page.evaluate(() => [
      localStorage.getItem('onenote.bibleModule'), localStorage.getItem('biblenote.reader.translationModules')
    ]);
    const url = page.url();
    await button.click();
    const dialog = page.getByRole('dialog', { name:'Переводы стиха · Ин 3:2', exact:true });
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('.bible-verse-translations-list')).toHaveAttribute('aria-busy', 'false');
    await expect(dialog.locator('.bible-verse-translation')).toHaveCount(5);
    await expect(dialog.locator('.bible-verse-translation').first()).toHaveAttribute('data-module', 'kjv');
    const source = dialog.locator('[data-module="kjv"]');
    await expect(source.locator('.bible-reader-translation-fragment')).toHaveCount(1);
    await expect(source).toContainText('Оно было в начале у Бога.');
    const mapped = dialog.locator('[data-module="rst"]');
    await expect(mapped.locator('.bible-verse-translations-reference')).toHaveText(['Ин 4:7', 'Ин 4:8']);
    await expect(mapped.locator('.bible-rich-italic')).toHaveText('Первое');
    await expect(dialog.locator('[data-module="missing"]')).toContainText('Соответствующий стих отсутствует.');
    await expect(dialog.locator('[data-module="broken"]')).toContainText('Не удалось загрузить перевод.');
    await expect(dialog.locator(`[data-module="bti'15"]`)).toContainText('Другой перевод <стиха>.');
    await mapped.locator('.bible-footnote-marker').click();
    await expect(mapped.locator('.bible-verse-footnote[open]')).toContainText('Пояснение к соответствующему стиху.');
    expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
    const bounds = (await dialog.boundingBox())!;
    expect(bounds.width).toBeLessThanOrEqual(width - 30);
    expect(bounds.height).toBeLessThanOrEqual(730);
    await page.screenshot({ path:testInfo.outputPath(`verse-translations-${width}.png`) });
    await dialog.getByRole('button', { name:'Закрыть', exact:true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(row).not.toHaveClass(/selected/);
    await expect(page).toHaveURL(url);
    expect(await page.evaluate(() => [
      localStorage.getItem('onenote.bibleModule'), localStorage.getItem('biblenote.reader.translationModules')
    ])).toEqual(before);
    await expect(button).toBeFocused();
  });
}

test('@bible closing a loading verse translations dialog prevents stale results after reopening', async ({ app, appPage:page }) => {
  await page.goto(`${app.baseUrl}/bible/rst/43/1`);
  let release!:() => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  let requests = 0;
  await page.route('**/api/bible/parallel-text?**', async route => {
    const first = ++requests === 1;
    if (first) await gate;
    await route.fulfill({ json:{ module:'kjv', rows:[1,2].map(verse => ({
      baseChapter:1, baseVerse:verse, verses:[{ chapter:1, verse, text:`Translated verse ${verse}` }]
    })) } }).catch(() => {});
  });
  try {
    await page.locator('#bible-verse-1-1 .bible-reader-translations-action').click();
    await expect.poll(() => requests).toBe(1);
    await page.keyboard.press('Escape');
    await expect(page.locator('#bibleVerseTranslationsDialog')).toHaveCount(0);
    await page.locator('#bible-verse-1-2 .bible-reader-translations-action').click();
    const dialog = page.getByRole('dialog', { name:'Переводы стиха · Ин 1:2', exact:true });
    await expect(dialog).toContainText('Translated verse 2');
    release();
    await expect(dialog).not.toContainText('Translated verse 1');
    await expect(dialog.locator('.bible-verse-translation')).toHaveCount(2);
    await dialog.getByRole('button', { name:'Закрыть', exact:true }).click();
  } finally {
    release();
  }
});
