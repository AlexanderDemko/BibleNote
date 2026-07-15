import assert from 'node:assert/strict';
import test from 'node:test';
import { ContentPriorityQueue } from '../src/content-priority.js';

const pages = [
  { id: 'old', lastModifiedDateTime: '2024-01-01T00:00:00Z' },
  { id: 'new', lastModifiedDateTime: '2026-01-01T00:00:00Z' },
  { id: 'middle', lastModifiedDateTime: '2025-01-01T00:00:00Z' }
];

test('loads previously opened pages before newer background pages', () => {
  const opened = new Map([['old', '2026-02-01T00:00:00Z']]);
  const queue = new ContentPriorityQueue(pages, opened);

  assert.equal(queue.take()?.id, 'old');
  assert.equal(queue.take()?.id, 'new');
  assert.equal(queue.take()?.id, 'middle');
});

test('loads remaining pages from newest to oldest', () => {
  const queue = new ContentPriorityQueue(pages);

  assert.deepEqual(
    [queue.take()?.id, queue.take()?.id, queue.take()?.id],
    ['new', 'middle', 'old']
  );
});

test('moves a page opened during synchronization to the front', () => {
  const queue = new ContentPriorityQueue(pages);

  assert.equal(queue.take()?.id, 'new');
  assert.equal(queue.take(['old'])?.id, 'old');
  assert.equal(queue.take()?.id, 'middle');
  assert.equal(queue.size, 0);
});

test('ignores opened page ids that are not pending', () => {
  const queue = new ContentPriorityQueue(pages);

  assert.equal(queue.take(['missing'])?.id, 'new');
  assert.equal(queue.take(['new', 'old'])?.id, 'old');
});
