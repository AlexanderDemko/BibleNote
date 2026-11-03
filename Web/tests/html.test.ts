import assert from 'node:assert/strict';
import test from 'node:test';
import { hasRenderableHtmlBody, htmlToText, pdfBibleLinksFromHtml } from '../src/html.js';

test('does not treat a title-only OneNote divider page as renderable HTML', () => {
  const html = '<html><head><title>Part 1</title></head><body><div><br></div></body></html>';

  assert.equal(htmlToText(html), 'Part 1');
  assert.equal(hasRenderableHtmlBody(html), false);
});

test('treats body text as renderable HTML', () => {
  assert.equal(hasRenderableHtmlBody('<html><body><div>Page body</div></body></html>'), true);
});

test('treats body images as renderable HTML even without text', () => {
  assert.equal(hasRenderableHtmlBody('<html><body><img src="page.png"></body></html>'), true);
});

test('text extraction separates nested blocks from preceding inline text', () => {
  const html = '<body><div>Конец абзаца.<div><div><b>Божий замысел об интимной близости</b></div></div></div>'
    + '<div>В Библии говорится о многом.</div></body>';
  assert.equal(htmlToText(html), 'Конец абзаца.\n\nБожий замысел об интимной близости\n\nВ Библии говорится о многом.');
});

test('text extraction preserves inline spaces, line breaks and semantic block boundaries', () => {
  assert.equal(htmlToText('<body><section><p>Слово <b>и</b> слово.<br>Новая строка.</p>'
    + '<blockquote>Цитата</blockquote></section><article>Следующий раздел</article></body>'),
  'Слово и слово.\nНовая строка.\n\nЦитата\n\nСледующий раздел');
});

test('PDF HTML Bible links keep page-local occurrence identity and use explicit list context for bare verses', () => {
  const html = `<body>
    <section data-pdf-page="1">
      <p>Еф 4, стих <a href="bnVerse:Ephesians 4:5">:5</a>, число <a href="bnVerse:Ephesians 4:17">17</a>,
      Евр 1, стих <a href="bnVerse:Hebrews 1:5">:5</a>.</p>
      <p>См. <a href="bnVerse:3Царств 8:51">3 Цар. 8:51</a>, <a href="bnVerse:3Царств 8:53">53</a>.</p>
    </section>
    <section data-pdf-page="2"><p><a href="bnVerse:Ephesians 1:3">1:3</a></p></section>
  </body>`;

  assert.deepEqual(pdfBibleLinksFromHtml(html), [
    { pageNumber:1, occurrenceIndex:0, text:':5', href:'bnVerse:Ephesians 4:5', title:':5' },
    { pageNumber:1, occurrenceIndex:1, text:':5', href:'bnVerse:Hebrews 1:5', title:':5' },
    { pageNumber:1, occurrenceIndex:0, text:'3 Цар. 8:51', href:'bnVerse:3Царств 8:51', title:'3 Цар. 8:51' },
    {
      pageNumber:1,
      occurrenceIndex:0,
      text:'53',
      matchText:'3 Цар. 8:51, 53',
      href:'bnVerse:3Царств 8:53',
      title:'53'
    },
    { pageNumber:2, occurrenceIndex:0, text:'1:3', href:'bnVerse:Ephesians 1:3', title:'1:3' }
  ]);
});
