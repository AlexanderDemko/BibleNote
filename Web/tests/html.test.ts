import assert from 'node:assert/strict';
import test from 'node:test';
import { hasRenderableHtmlBody, htmlToText } from '../src/html.js';

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
