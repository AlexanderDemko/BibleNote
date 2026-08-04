import assert from 'node:assert/strict';
import test from 'node:test';
import {
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
