import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getCachedPageContent,
  getCachedPageMetadata,
  getCachedPageStatus,
  getCachedPageSyncState,
  listCachedPagesNeedingBibleParse,
  listOldestCachedPagesForContentRefresh,
  markPageDeleted,
  openCacheDb,
  updatePageContent,
  upsertPageMetadata
} from '../src/cache.js';

const page = {
  id:'page-1',
  title:'Page title',
  parentNotebook:{ id:'notebook-1', displayName:'Notebook' },
  parentSection:{ id:'section-1', displayName:'Section' }
};

function totalChanges(db: ReturnType<typeof openCacheDb>): number {
  return (db.prepare('SELECT total_changes() AS value').get() as { value: number }).value;
}

test('page metadata and content can be read without loading both cached bodies', () => {
  const db = openCacheDb(':memory:');
  try {
    upsertPageMetadata(db, page, '2026-08-01T10:00:00Z');
    updatePageContent(db, page.id, 'Indexed text', '<p>Indexed text</p>');

    const metadata = getCachedPageMetadata(db, page.id);
    assert.equal(metadata?.title, 'Page title');
    assert.equal(Object.hasOwn(metadata ?? {}, 'content_text'), false);
    assert.equal(Object.hasOwn(metadata ?? {}, 'content_html'), false);

    const html = getCachedPageContent(db, page.id, 'html');
    assert.equal(html?.content_html, '<p>Indexed text</p>');
    assert.equal(html?.content_text, null);

    const syncState = getCachedPageSyncState(db, page.id);
    assert.equal(syncState?.has_content_text, 1);
    assert.equal(syncState?.has_nonempty_content_text, 1);
    assert.equal(syncState?.has_content_html, 1);

    const pendingParse = listCachedPagesNeedingBibleParse(db, {
      module:'rst',
      parserVersion:'test-v1'
    })[0];
    assert.equal(pendingParse?.id, page.id);
    assert.equal(pendingParse?.has_nonempty_content_text, 1);
    assert.equal(Object.hasOwn(pendingParse ?? {}, 'content_text'), false);
    assert.equal(Object.hasOwn(pendingParse ?? {}, 'content_html'), false);

    const refreshCandidate = listOldestCachedPagesForContentRefresh(db, { limit:1 })[0];
    assert.equal(refreshCandidate?.id, page.id);
    assert.equal(Object.hasOwn(refreshCandidate ?? {}, 'content_text'), false);
    assert.equal(Object.hasOwn(refreshCandidate ?? {}, 'content_html'), false);

    const status = getCachedPageStatus(db, page.id);
    assert.equal(status?.deleted_at, null);
    assert.equal(typeof status?.content_synced_at, 'string');
    assert.equal(status?.fetch_error, null);
    assert.equal(status?.has_content, 1);

    updatePageContent(db, page.id, '', null);
    const emptyContentState = getCachedPageSyncState(db, page.id);
    assert.equal(emptyContentState?.has_content_text, 1);
    assert.equal(emptyContentState?.has_nonempty_content_text, 0);
    assert.equal(emptyContentState?.has_content_html, 0);
  } finally {
    db.close();
  }
});

test('unchanged page metadata does not rewrite the full-text index', () => {
  const db = openCacheDb(':memory:');
  try {
    upsertPageMetadata(db, page, '2026-08-01T10:00:00Z');
    updatePageContent(db, page.id, 'Indexed text', '<p>Indexed text</p>');

    const before = totalChanges(db);
    upsertPageMetadata(db, page, '2026-08-01T11:00:00Z');
    const changes = totalChanges(db) - before;

    assert.equal(changes, 1);
    assert.deepEqual(
      db.prepare('SELECT title, content, notebook, section FROM pages_fts WHERE page_id = ?').get(page.id),
      { title:'Page title', content:'Indexed text', notebook:'Notebook', section:'Section' }
    );
  } finally {
    db.close();
  }
});

test('changed and restored page metadata keeps the full-text index current', () => {
  const db = openCacheDb(':memory:');
  try {
    upsertPageMetadata(db, page, '2026-08-01T10:00:00Z');
    updatePageContent(db, page.id, 'Indexed text', '<p>Indexed text</p>');

    const renamed = {
      ...page,
      title:'Renamed page',
      parentSection:{ id:'section-2', displayName:'New section' }
    };
    upsertPageMetadata(db, renamed, '2026-08-01T11:00:00Z');
    assert.deepEqual(
      db.prepare('SELECT title, content, notebook, section FROM pages_fts WHERE page_id = ?').get(page.id),
      { title:'Renamed page', content:'Indexed text', notebook:'Notebook', section:'New section' }
    );

    assert.equal(markPageDeleted(db, page.id, '2026-08-01T12:00:00Z'), 1);
    assert.equal(db.prepare('SELECT COUNT(*) AS value FROM pages_fts').get().value, 0);

    upsertPageMetadata(db, renamed, '2026-08-01T13:00:00Z');
    assert.deepEqual(
      db.prepare('SELECT title, content, notebook, section FROM pages_fts WHERE page_id = ?').get(page.id),
      { title:'Renamed page', content:'Indexed text', notebook:'Notebook', section:'New section' }
    );
  } finally {
    db.close();
  }
});
