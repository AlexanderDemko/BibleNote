import { test, expect } from '../../fixtures/app.fixture.js';
import { openCacheDb, updatePageContent, upsertBibleParseResult } from '../../../src/cache.js';
import { bibleParserVersion } from '../../../src/bible.js';

for (const mode of ['word', 'onenote']) {
  for (const theme of ['b', 'c']) {
    test(`@notes @search common-note links are highlighted in ${mode}, theme ${theme}`, async ({ app, appPage: page }) => {
      const firstText = 'Прочитайте Ин 3:16, Мф 19:3-5 и ещё раз Ин 3:16. Другая ссылка: Ин 3:17.';
      const secondText = 'Повторно: Мф 19:3-5.';
      const texts = [firstText, secondText];
      const paragraphs = texts.map((text, index) => ({
        index, text,
        references:[...text.matchAll(/Ин 3:1[67]|Мф 19:3-5/g)].map(match => {
          const john = match[0].startsWith('Ин');
          const verse = john ? Number(match[0].slice(-2)) : 3;
          return {
            originalText:match[0], normalized:match[0], bookIndex:john ? 43 : 40,
            bookName:john ? 'От Иоанна' : 'От Матфея', bookShortName:john ? 'Ин' : 'Мф',
            chapter:john ? 3 : 19, verse, topChapter:john ? 3 : 19, topVerse:john ? verse : 5,
            startIndex:match.index, endIndex:match.index + match[0].length - 1
          };
        })
      }));
      const html = `<html><body${mode === 'onenote' ? ' class="onenote-com-page"' : ''}><h1>Благодать и надежда</h1>`
        + paragraphs.map(paragraph => '<p>' + paragraph.text.replace(/Ин 3:1[67]|Мф 19:3-5/g, text => {
          const ref = paragraph.references.find(reference => reference.originalText === text)!;
          return `<a href="bnVerse:rst/${ref.bookIndex} ${ref.chapter}:${ref.verse}${ref.topVerse !== ref.verse ? '-' + ref.topVerse : ''};${text}"><span style="color:#0563C1">${text}</span></a>`;
        }) + '</p>').join('') + '</body></html>';
      const db = openCacheDb(app.dbPath);
      try {
        const now = new Date().toISOString();
        updatePageContent(db, 'page-grace', texts.join('\n'), html, now, now, now);
        db.prepare('UPDATE pages SET links_json = ? WHERE id = ?').run(
          JSON.stringify(mode === 'word' ? { folder:{ extension:'.docx', quality:'structured' } } : {}), 'page-grace');
        const row = db.prepare('SELECT content_hash FROM pages WHERE id = ?').get('page-grace') as { content_hash:string };
        upsertBibleParseResult(db, 'page-grace', row.content_hash, {
          module:'rst', paragraphs,
          relations:[
            { paragraphIndex:0, referenceIndex:0, verseId:43003016, relativeParagraphIndex:0, relativeReferenceIndex:1, relativeVerseId:40019003, relationWeight:1 },
            { paragraphIndex:0, referenceIndex:2, verseId:43003016, relativeParagraphIndex:1, relativeReferenceIndex:0, relativeVerseId:40019003, relationWeight:1 }
          ]
        }, bibleParserVersion, now);
      } finally { db.close(); }
      await page.route('**/api/page-html?**', route => route.fulfill({ json:{ html } }));
      await page.evaluate(theme => localStorage.setItem('onenote.theme', theme), theme);
      await page.goto(`${app.baseUrl}/page/page-grace`);
      // Follow the common-notes action and exercise the real paired-reference search route.
      const responsePromise = page.waitForResponse(response => new URL(response.url()).pathname === '/api/search');
      await page.evaluate(async () => {
        await (window as typeof window & {
          showParallelPairNotes:(first:Record<string, unknown>, second:Record<string, unknown>) => Promise<void>;
        }).showParallelPairNotes(
          { normalizedRef:'Ин 3:16', module:'rst', bookIndex:43, chapter:3, verse:16 },
          { normalizedRef:'Мф 19:3-5', module:'rst', bookIndex:40, chapter:19, verse:3, topVerse:5 }
        );
      });
      const results = await (await responsePromise).json();
      const result = results.find((item: { id:string }) => item.id === 'page-grace');
      expect(result.bibleOccurrences).toEqual([
        ...paragraphs[0].references.slice(0, 3).map(ref => ({ paragraphIndex:0, startIndex:ref.startIndex, endIndex:ref.endIndex })),
        { paragraphIndex:1, startIndex:paragraphs[1].references[0].startIndex, endIndex:paragraphs[1].references[0].endIndex }
      ]);
      await page.locator('#tree .search-result-row').filter({ hasText:'Благодать и надежда' }).click();
      await expect(page.locator('.match-count')).toHaveText('1 / 4');
      await expect(page.locator('.page-text .bible-reference-target')).toHaveText(['Ин 3:16', 'Мф 19:3-5', 'Ин 3:16', 'Мф 19:3-5']);
      await page.getByRole('button', { name:'Показать HTML', exact:true }).click();
      const frame = page.frameLocator('#content iframe.html-frame');
      const marked = frame.locator('[data-onenote-target-match="true"]');
      const current = frame.locator('[data-onenote-target-match-current="true"]');
      await expect(marked).toHaveText(['Ин 3:16', 'Мф 19:3-5', 'Ин 3:16', 'Мф 19:3-5']);
      await expect(frame.getByRole('link', { name:'Ин 3:17', exact:true })).not.toHaveAttribute('data-onenote-target-match');
      await expect(current).toHaveText('Ин 3:16');
      await expect(marked.nth(1)).toHaveCSS('outline-width', '1px');
      await page.getByRole('button', { name:'Следующее совпадение', exact:true }).click();
      await expect(current).toHaveText('Мф 19:3-5');
      await expect(current).toHaveCSS('outline-width', '2px');
      await expect.poll(() => current.locator('span').evaluate(element => getComputedStyle(element).color)).not.toBe('rgb(5, 99, 193)');
      await page.screenshot({ path:`.tmp/reference-debug/paired-${mode}-${theme}.png` });
      await page.getByRole('button', { name:'Закрыть навигацию по совпадениям', exact:true }).click();
      await expect(marked).toHaveCount(0);
      await expect(frame.locator('[data-onenote-target-paragraph]')).toHaveCount(0);
    });
  }
}
