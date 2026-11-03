import { test, expect } from '../../fixtures/app.fixture.js';

for (const parallel of [false, true]) {
  test(`@bible boundary paragraph markers do not add empty verse lines (${parallel ? 'comparison' : 'single'})`, async ({ app, appPage:page }) => {
    await page.addInitScript(value => {
      localStorage.setItem('biblenote.reader.translationModules', JSON.stringify(value ? ['rst', 'kjv'] : ['rst']));
    }, parallel);
    const text = 'Первое слово. Второе слово.';
    const richText = {
      breaks:[
        { offset:0, kind:'paragraph' }, { offset:text.length, kind:'line' },
        { offset:-1, kind:'line' }, { offset:text.length + 1, kind:'paragraph' }
      ],
      decorations:[{ startOffset:0, endOffset:6, kind:'italic' }],
      footnotes:[{ offset:13, marker:'[1]', text:'Пояснение к стиху.' }]
    };
    await page.route('**/api/bible/text?**', async route => {
      const response = await route.fetch();
      const body = await response.json();
      body.verses.forEach((verse:Record<string, unknown>, index:number) => {
        verse.text = text;
        if (index === 1) verse.richText = richText;
        if (index === 2) verse.richText = { breaks:[{ offset:14, kind:'paragraph' }] };
      });
      await route.fulfill({ response, json:body });
    });
    await page.route('**/api/bible/parallel-text?**', route => route.fulfill({ json:{ module:'kjv', rows:[1, 2, 3].map(verse => ({
      baseChapter:1, baseVerse:verse, verses:[{
        chapter:1, verse, text, richText:verse === 2 ? richText : undefined
      }]
    })) } }));
    await page.goto(`${app.baseUrl}/bible/rst/43/1`);
    const normal = page.locator('#content #bible-verse-1-1');
    const boundary = page.locator('#content #bible-verse-1-2');
    const textSelector = parallel ? '.bible-reader-translation-cell.primary [data-inductive-text]' : '.bible-reader-verse-text';
    const decorated = boundary.locator(textSelector);
    await expect(decorated).toHaveText(text);
    await expect(boundary.locator('.bible-rich-break')).toHaveCount(0);
    await expect(decorated.locator('.bible-rich-italic')).toHaveText('Первое');
    expect(Math.abs((await boundary.boundingBox())!.height - (await normal.boundingBox())!.height)).toBeLessThan(2);
    const firstTextOffset = await decorated.evaluate(element => {
      const range = document.createRange();
      range.selectNodeContents(element.querySelector('.bible-rich-italic')!);
      return range.getBoundingClientRect().top - element.getBoundingClientRect().top;
    });
    expect(firstTextOffset).toBeLessThan(10);
    // Actual paragraph breaks inside a verse remain visible.
    await expect(page.locator('#content #bible-verse-1-3 .bible-rich-break.paragraph')).toHaveCount(1);
    const marker = decorated.locator('.bible-footnote-marker');
    await marker.click();
    await expect(page.locator('.bible-verse-footnote[open] .bible-verse-footnote-body')).toHaveText('Пояснение к стиху.');
    await expect(decorated).toHaveText(text);
  });
}
