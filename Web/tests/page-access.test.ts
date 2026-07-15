import assert from 'node:assert/strict';
import test from 'node:test';
import { listPageAccess, markPageOpened, openCacheDb, resetCacheDb } from '../src/cache.js';

test('keeps page-open history across a full cache reset', () => {
  const db = openCacheDb(':memory:');
  try {
    markPageOpened(db, 'page-1', '2026-07-15T08:00:00Z');
    markPageOpened(db, 'page-2', '2026-07-15T09:00:00Z');
    markPageOpened(db, 'page-2', '2026-07-15T07:00:00Z');

    assert.deepEqual(listPageAccess(db), [
      { page_id: 'page-2', last_opened_at: '2026-07-15T09:00:00Z' },
      { page_id: 'page-1', last_opened_at: '2026-07-15T08:00:00Z' }
    ]);

    resetCacheDb(db);

    assert.deepEqual(listPageAccess(db), [
      { page_id: 'page-2', last_opened_at: '2026-07-15T09:00:00Z' },
      { page_id: 'page-1', last_opened_at: '2026-07-15T08:00:00Z' }
    ]);
  } finally {
    db.close();
  }
});
