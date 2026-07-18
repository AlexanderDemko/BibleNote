import assert from 'node:assert/strict';
import test from 'node:test';
import { openCacheDb, upsertPageMetadata } from '../src/cache.js';
import { assignOneNotePageOrder, loadOneNoteSectionPages } from '../src/sync.js';

test('OneNote page indentation level is stored and preserved', () => {
  const db = openCacheDb(':memory:');
  try {
    upsertPageMetadata(db, {
      id:'page-1',
      title:'Child page',
      order:17,
      level:2
    }, '2026-07-18T00:00:00.000Z');

    assert.deepEqual(
      db.prepare('SELECT order_index, page_level FROM pages WHERE id = ?').get('page-1'),
      { order_index:17, page_level:2 }
    );

    upsertPageMetadata(db, {
      id:'page-1',
      title:'Child page renamed'
    }, '2026-07-18T01:00:00.000Z');

    assert.deepEqual(
      db.prepare('SELECT order_index, page_level FROM pages WHERE id = ?').get('page-1'),
      { order_index:17, page_level:2 }
    );
  } finally {
    db.close();
  }
});

test('OneNote page order uses Graph positions when they are available', () => {
  const pages = [
    { id:'first', order:0 },
    { id:'second', order:1 },
    { id:'third', order:2 }
  ];

  assignOneNotePageOrder(pages);

  assert.deepEqual(pages.map(page => page.orderIndex), [0, 1, 2]);
});

test('OneNote page order falls back to response position when Graph returns only zeroes', () => {
  const pages = [
    { id:'newest', order:0 },
    { id:'middle', order:0 },
    { id:'oldest', order:0 }
  ];

  assignOneNotePageOrder(pages);

  assert.deepEqual(pages.map(page => page.orderIndex), [0, 1, 2]);
});

test('OneNote page hierarchy loads every 100-page batch with skip pagination', async () => {
  const sourcePages = Array.from({ length:205 }, (_, index) => ({
    id:`page-${index}`,
    title:`Page ${index}`,
    order:index,
    level:index % 3
  }));
  const requests: string[] = [];
  const result = await loadOneNoteSectionPages('section-1', {
    fetchPage:async path => {
      requests.push(path);
      const url = new URL(path, 'https://graph.microsoft.com');
      const skip = Number(url.searchParams.get('$skip'));
      const top = Number(url.searchParams.get('$top'));
      return { value:sourcePages.slice(skip, skip + top) };
    }
  });

  assert.equal(result.complete, true);
  assert.equal(result.pages.length, 205);
  assert.deepEqual(requests.map(path => new URL(path, 'https://graph.microsoft.com').searchParams.get('$skip')), ['0', '100', '200']);
  assert.equal(requests.every(path => path.includes('pagelevel=true')), true);
});
