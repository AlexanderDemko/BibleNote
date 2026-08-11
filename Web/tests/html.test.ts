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

test('PDF HTML Bible links keep page-local occurrence identity and omit bare numbers', () => {
  const html = `<body>
    <section data-pdf-page="1">
      <p>Еф 4, стих <a href="bnVerse:Ephesians 4:5">:5</a>, число <a href="bnVerse:Ephesians 4:17">17</a>,
      Евр 1, стих <a href="bnVerse:Hebrews 1:5">:5</a>.</p>
    </section>
    <section data-pdf-page="2"><p><a href="bnVerse:Ephesians 1:3">1:3</a></p></section>
  </body>`;

  assert.deepEqual(pdfBibleLinksFromHtml(html), [
    { pageNumber:1, occurrenceIndex:0, text:':5', href:'bnVerse:Ephesians 4:5', title:':5' },
    { pageNumber:1, occurrenceIndex:1, text:':5', href:'bnVerse:Hebrews 1:5', title:':5' },
    { pageNumber:2, occurrenceIndex:0, text:'1:3', href:'bnVerse:Ephesians 1:3', title:'1:3' }
  ]);
});
