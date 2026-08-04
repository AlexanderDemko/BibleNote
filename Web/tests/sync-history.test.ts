import assert from 'node:assert/strict';
import test from 'node:test';
import { listSyncHistory, openCacheDb, recordSyncHistory, resetCacheDb } from '../src/cache.js';

test('stores synchronization runs newest first and keeps them across a cache rebuild', () => {
  const db = openCacheDb(':memory:');
  try {
    recordSyncHistory(db, {
      startedAt:'2026-08-01T10:00:00Z',
      finishedAt:'2026-08-01T10:02:00Z',
      status:'success',
      mode:'quick',
      scope:'Все источники',
      request:{ incrementalMetadata:true },
      result:{ pages:20, contentDownloaded:2, contentSkipped:18 },
      error:null
    });
    recordSyncHistory(db, {
      startedAt:'2026-08-01T11:00:00Z',
      finishedAt:'2026-08-01T11:03:00Z',
      status:'completed_with_errors',
      mode:'full',
      scope:'Изучение Библии',
      request:{ notebookIds:['notebook-1'] },
      result:{ pages:10, contentDownloaded:9, contentErrors:1 },
      error:null
    });

    const beforeReset = listSyncHistory(db, { limit:1 });
    assert.equal(beforeReset.total, 2);
    assert.equal(beforeReset.rows[0].mode, 'full');
    assert.equal(beforeReset.rows[0].status, 'completed_with_errors');
    assert.deepEqual(beforeReset.rows[0].result, { pages:10, contentDownloaded:9, contentErrors:1 });

    resetCacheDb(db);

    const afterReset = listSyncHistory(db);
    assert.equal(afterReset.total, 2);
    assert.deepEqual(afterReset.rows.map(row => row.mode), ['full', 'quick']);
  } finally {
    db.close();
  }
});

