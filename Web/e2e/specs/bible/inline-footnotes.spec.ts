import { test, expect } from '../../fixtures/app.fixture.js';

for (const parallel of [false, true]) {
  test(`@bible footnote markers link their exact text positions (${parallel ? 'parallel' : 'single'})`, async ({ app, appPage: page }) => {
    const verseText = 'Первое второе третье.';
    const footnotes = [
      { offset:6, marker:'[1]', text:'Пояснение к первому слову.' },
      { offset:13, marker:'[2]', text:'Пояснение ко второму слову.' },
      { offset:verseText.length, marker:'[3]', text:'Пояснение к концу стиха.' },
      { offset:verseText.length, marker:'[4]', text:'Ещё одна сноска в той же позиции.' }
    ];
    await page.addInitScript(value => {
      localStorage.setItem('biblenote.reader.translationModules', JSON.stringify(value ? ['rst', 'kjv'] : ['rst']));
      localStorage.setItem('biblenote.inductive.mode', '0');
    }, parallel);
    await page.route('**/api/bible/text?**', async route => {
      const response = await route.fetch();
      const body = await response.json();
      body.verses[0].text = verseText;
      body.verses[0].richText = { text:verseText, footnotes, decorations:[{ startOffset:0, endOffset:6, kind:'italic' }] };
      await route.fulfill({ response, json:body });
    });
    await page.route('**/api/bible/parallel-text?**', route => route.fulfill({
      json:{ module:'kjv', rows:[{ baseChapter:1, baseVerse:1, verses:[{
        chapter:1, verse:1, text:verseText, richText:{ footnotes }
      }] }] }
    }));
    await page.goto(`${app.baseUrl}/bible/rst/43/1`);
    const scope = parallel
      ? page.locator('#bible-verse-1-1 .bible-reader-translation-cell.primary')
      : page.locator('.bible-reader-verse-block').first();
    const text = scope.locator('[data-inductive-text="true"]');
    const markers = text.locator('.bible-footnote-marker');
    await expect(markers).toHaveCount(4);
    await expect(text).toHaveText(verseText);
    expect(await markers.evaluateAll(elements => elements.map(marker => {
      const range = document.createRange();
      range.selectNodeContents(marker.parentElement!);
      range.setEndBefore(marker);
      return range.toString().length;
    }))).toEqual([6, 13, verseText.length, verseText.length]);
    await expect(text.locator('.bible-rich-italic')).toHaveText('Первое');
    await expect(scope.locator('.bible-verse-footnote-body')).toHaveCount(4);
    await expect(scope.locator('.bible-verse-footnotes')).toBeHidden();

    const second = markers.nth(1);
    const targetId = await second.getAttribute('aria-controls');
    const note = scope.locator('#' + targetId);
    await second.click();
    await expect(note).toHaveAttribute('open', '');
    await expect(note.locator('.bible-verse-footnote-body')).toHaveText(footnotes[1].text);
    await expect(second).toHaveAttribute('aria-expanded', 'true');
    await expect(scope.locator('.bible-verse-footnote[open]')).toHaveCount(1);
    await expect(page.locator('#bible-verse-1-1')).not.toHaveClass(/selected/);

    await markers.first().click();
    await expect(note).not.toHaveAttribute('open', '');
    await expect(second).toHaveAttribute('aria-expanded', 'false');
    await expect(markers.first()).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('.bible-verse-footnote[open]')).toHaveCount(1);
    await markers.first().click();
    await expect(page.locator('.bible-verse-footnote[open]')).toHaveCount(0);
    await expect(scope.locator('.bible-verse-footnotes')).toBeHidden();
    await second.click();

    await page.locator('.inductive-visibility-button').click();
    await expect(markers).toHaveCount(4);
    await expect(markers.nth(1)).toHaveAttribute('aria-expanded', 'true');
    await expect(text).toHaveText(verseText);

    if (parallel) {
      const secondary = page.locator('#bible-verse-1-1 .bible-reader-translation-cell').nth(1);
      const secondaryMarker = secondary.locator('.bible-footnote-marker').nth(1);
      expect(await secondaryMarker.getAttribute('aria-controls')).not.toBe(targetId);
      await secondaryMarker.click();
      await expect(secondary.locator('.bible-verse-footnote[open]')).toHaveCount(1);
      await expect(note).not.toHaveAttribute('open', '');
      await expect(markers.nth(1)).toHaveAttribute('aria-expanded', 'false');
      await expect(page.locator('.bible-verse-footnote[open]')).toHaveCount(1);
      await markers.nth(1).click();
      await expect(secondary.locator('.bible-verse-footnote[open]')).toHaveCount(0);
      await expect(secondaryMarker).toHaveAttribute('aria-expanded', 'false');
    }
    await note.locator('summary').click();
    await expect(markers.nth(1)).toHaveAttribute('aria-expanded', 'false');
    await markers.nth(2).focus();
    await page.keyboard.press('Enter');
    await expect(markers.nth(2)).toHaveAttribute('aria-expanded', 'true');
    await expect(scope.locator('.bible-verse-footnote[open] .bible-verse-footnote-body')).toHaveText(footnotes[2].text);
  });
}
