import { test, expect } from '../../fixtures/app.fixture.js';

for (const [theme, width] of [['a', 1280], ['c', 1280], ['c', 760]] as const) {
  test(`@bible footnotes stay below their translation and readable (${theme}, ${width})`, async ({ app, appPage: page }) => {
    await page.setViewportSize({ width, height:900 });
    await page.addInitScript(value => {
      localStorage.setItem('biblenote.setupWizardDone', 'true');
      localStorage.setItem('onenote.bibleModule', 'rst');
      localStorage.setItem('biblenote.reader.translationModules', JSON.stringify(['rst', 'kjv', 'bti']));
    }, theme);
    const footnotes = [{ marker:'[1]', text:'Пояснение к стиху. '.repeat(12) + 'Длинноеслово'.repeat(30) }];
    await page.route('**/api/biblenote/modules', async route => {
      const response = await route.fetch();
      const body = await response.json();
      body.modules.push({ shortName:'bti', displayName:'BTI fixture' });
      await route.fulfill({ response, json:body });
    });
    await page.route('**/api/bible/text?**', async route => {
      const response = await route.fetch();
      const body = await response.json();
      body.verses[0].richText = { footnotes };
      await route.fulfill({ response, json:body });
    });
    await page.route('**/api/bible/parallel-text?**', route => route.fulfill({
      json:{ module:new URL(route.request().url()).searchParams.get('module'), rows:[{
        baseChapter:1, baseVerse:1,
        verses:[{ chapter:1, verse:new URL(route.request().url()).searchParams.get('module') === 'bti' ? 1 : 2,
          text:'Стих с примечанием.', richText:{ footnotes } }]
      }] }
    }));
    await page.goto(`${app.baseUrl}/bible/rst/43/1`);
    await page.evaluate(value => document.documentElement.dataset.theme = value, theme);
    const row = page.locator('#bible-verse-1-1');
    await expect(row.locator('.bible-verse-footnote')).toHaveCount(3);
    for (const note of await row.locator('.bible-verse-footnote').all()) {
      await note.locator('summary').click();
      await expect(note).toHaveAttribute('open', '');
      await expect(page.locator('.bible-verse-footnote[open]')).toHaveCount(1);
      const layout = await note.evaluate(element => {
        const cell = element.closest('.bible-reader-translation-cell')!;
        const box = element.getBoundingClientRect();
        const bounds = cell.getBoundingClientRect();
        const body = element.querySelector('.bible-verse-footnote-body')!;
        const text = cell.querySelector('.bible-reader-translation-text, .bible-reader-translation-fragment > span:last-of-type')!;
        return {
          inside:box.left >= bounds.left && box.right <= bounds.right + 1,
          below:box.top >= text.getBoundingClientRect().bottom,
          fits:element.scrollWidth <= element.clientWidth + 1,
          color:getComputedStyle(body).color,
          expectedColor:getComputedStyle(document.body).color,
          background:getComputedStyle(element).backgroundColor
        };
      });
      expect(layout.inside).toBe(true);
      expect(layout.below).toBe(true);
      expect(layout.fits).toBe(true);
      expect(layout.color).toBe(layout.expectedColor);
      if (theme === 'c') expect(layout.background).toBe('rgb(41, 38, 47)');
    }
    await expect(row).not.toHaveClass(/selected/);
    await row.locator('.bible-verse-footnote summary').last().click();
    await expect(page.locator('.bible-verse-footnote[open]')).toHaveCount(0);
  });
}
