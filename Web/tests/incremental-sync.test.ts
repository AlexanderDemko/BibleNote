import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  listCachedPagesNeedingBibleParse,
  listCachedPagesWithStaleSectionContent,
  listOldestCachedPagesForContentRefresh,
  markMissingSectionPagesDeleted,
  openCacheDb,
  setPageFetchError,
  updatePageContent
} from '../src/cache.js';
import {
  isTerminalPageFetchError,
  shouldRefreshRecentlyOpenedContent,
  shouldRefreshContent,
  shouldScanSectionPages,
  type Page,
  type Section
} from '../src/sync.js';

test('incremental metadata scans only new, changed, or incomplete sections', () => {
  const section: Section = { id: 'section-1', lastModifiedDateTime: '2026-07-17T10:00:00Z' };
  const cached = {
    id: 'section-1',
    last_modified_date_time: '2026-07-17T10:00:00Z',
    pages_scanned_at: '2026-07-17T10:01:00Z',
    pages_scan_complete: 1,
    pages_scan_error: null
  } as any;

  assert.equal(shouldScanSectionPages(cached, section, true), false);
  assert.equal(shouldScanSectionPages(cached, { ...section, lastModifiedDateTime: '2026-07-17T11:00:00Z' }, true), true);
  assert.equal(shouldScanSectionPages({ ...cached, pages_scan_complete: 0 }, section, true), true);
  assert.equal(shouldScanSectionPages({ ...cached, pages_scan_error: 'failed' }, section, true), true);
  assert.equal(shouldScanSectionPages(undefined, section, true), true);
  assert.equal(shouldScanSectionPages(cached, section, false), true);
});

test('empty page text is a valid cached result and is not downloaded forever', () => {
  const page: Page = { id: 'page-1', lastModifiedDateTime: '2026-07-17T10:00:00Z' };
  const cached = {
    content_text: '',
    content_synced_at: '2026-07-17T10:01:00Z',
    content_source_modified_date_time: '2026-07-17T10:00:00Z',
    content_html: null,
    fetch_error: null
  } as any;
  assert.equal(shouldRefreshContent(cached, page, { includeHtml: false }), false);
});

test('recently opened pages are refreshed independently of OneNote page timestamps', () => {
  const now = Date.parse('2026-07-20T12:00:00Z');
  const cached = {
    content_synced_at: '2026-07-18T10:00:00Z',
    deleted_at: null,
    fetch_error: null
  } as any;

  assert.equal(shouldRefreshRecentlyOpenedContent(cached, '2026-07-20T11:00:00Z', 24, now), true);
  assert.equal(shouldRefreshRecentlyOpenedContent(
    { ...cached, content_synced_at:'2026-07-20T10:00:00Z' },
    '2026-07-20T11:00:00Z',
    24,
    now
  ), false);
  assert.equal(shouldRefreshRecentlyOpenedContent(cached, '2026-05-01T11:00:00Z', 24, now), false);
  assert.equal(shouldRefreshRecentlyOpenedContent({ ...cached, fetch_error:'cooldown' }, '2026-07-20T11:00:00Z', 24, now), false);
});

test('section versions create a durable content refresh queue', () => {
  const db = openCacheDb(':memory:');
  try {
    db.prepare(`
      INSERT INTO sections(id, display_name, last_modified_date_time, synced_at)
      VALUES (?, ?, ?, ?)
    `).run('section-1', 'Section', '2026-07-20T10:00:00Z', '2026-07-20T10:01:00Z');
    db.prepare(`
      INSERT INTO pages(
        id, title, parent_section_id, parent_notebook_id, content_text,
        content_source_section_modified_date_time, content_synced_at, metadata_synced_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'page-1', 'Page', 'section-1', 'notebook-1', 'Old text',
      '2026-07-19T10:00:00Z', '2026-07-19T10:01:00Z', '2026-07-20T10:01:00Z'
    );

    assert.deepEqual(
      listCachedPagesWithStaleSectionContent(db, ['notebook-1']).map(page => page.id),
      ['page-1']
    );

    updatePageContent(
      db,
      'page-1',
      'Current text',
      null,
      '2026-06-01T00:00:00Z',
      '2026-07-20T11:00:00Z',
      '2026-07-20T10:00:00Z'
    );
    assert.deepEqual(listCachedPagesWithStaleSectionContent(db, ['notebook-1']), []);
  } finally {
    db.close();
  }
});

test('rolling refresh selects the oldest successful content fetches', () => {
  const db = openCacheDb(':memory:');
  try {
    const insert = db.prepare(`
      INSERT INTO pages(id, parent_notebook_id, content_synced_at, metadata_synced_at, fetch_error)
      VALUES (?, ?, ?, ?, ?)
    `);
    insert.run('never', 'notebook-1', null, '2026-07-18T00:00:00Z', null);
    insert.run('old', 'notebook-1', '2026-07-01T00:00:00Z', '2026-07-18T00:00:00Z', null);
    insert.run('new', 'notebook-1', '2026-07-19T00:00:00Z', '2026-07-19T00:00:00Z', null);
    insert.run('failed', 'notebook-1', null, '2026-07-01T00:00:00Z', 'Graph failed');
    insert.run('other', 'notebook-2', null, '2026-07-01T00:00:00Z', null);

    assert.deepEqual(
      listOldestCachedPagesForContentRefresh(db, { notebookIds:['notebook-1'], limit:2 }).map(page => page.id),
      ['never', 'old']
    );
  } finally {
    db.close();
  }
});

test('terminal errors and cooldowns suppress retries until page metadata changes', () => {
  const page: Page = { id: 'page-1', lastModifiedDateTime: '2026-07-17T10:00:00Z' };
  const base = {
    content_synced_at: null,
    content_source_modified_date_time: null,
    content_html: null,
    fetch_error: 'failed',
    fetch_error_source_modified_date_time: '2026-07-17T10:00:00Z',
    fetch_error_terminal: 0,
    fetch_retry_after: '2026-07-17T12:00:00Z'
  } as any;

  assert.equal(shouldRefreshContent(base, page, {}, Date.parse('2026-07-17T11:00:00Z')), false);
  assert.equal(shouldRefreshContent(base, page, {}, Date.parse('2026-07-17T13:00:00Z')), true);
  assert.equal(shouldRefreshContent({ ...base, fetch_error_terminal: 1 }, page, {}), false);
  assert.equal(shouldRefreshContent(
    { ...base, fetch_error_terminal: 1 },
    { ...page, lastModifiedDateTime: '2026-07-17T14:00:00Z' },
    {}
  ), true);
  assert.equal(isTerminalPageFetchError(new Error('Graph returned 404 Not Found')), true);
  assert.equal(isTerminalPageFetchError(new Error('Graph returned 504')), false);
});

test('fetch error policy is persisted and cleared after a successful download', () => {
  const db = openCacheDb(':memory:');
  try {
    db.prepare(`
      INSERT INTO pages(id, title, last_modified_date_time, metadata_synced_at)
      VALUES (?, ?, ?, ?)
    `).run('page-1', 'Page', '2026-07-17T10:00:00Z', '2026-07-17T10:00:00Z');

    setPageFetchError(db, 'page-1', 'Graph returned 404 Not Found', {
      failedAt: '2026-07-17T11:00:00Z',
      terminal: true,
      sourceModifiedDateTime: '2026-07-17T10:00:00Z'
    });
    const failed = db.prepare(`
      SELECT fetch_error_count, fetch_error_terminal, fetch_error_at,
             fetch_retry_after, fetch_error_source_modified_date_time
      FROM pages WHERE id = ?
    `).get('page-1') as any;
    assert.deepEqual(failed, {
      fetch_error_count: 1,
      fetch_error_terminal: 1,
      fetch_error_at: '2026-07-17T11:00:00Z',
      fetch_retry_after: null,
      fetch_error_source_modified_date_time: '2026-07-17T10:00:00Z'
    });

    updatePageContent(db, 'page-1', '', null, '2026-07-17T10:00:00Z', '2026-07-17T12:00:00Z');
    const recovered = db.prepare(`
      SELECT content_text, content_synced_at, fetch_error, fetch_error_count, fetch_error_terminal
      FROM pages WHERE id = ?
    `).get('page-1') as any;
    assert.deepEqual(recovered, {
      content_text: '',
      content_synced_at: '2026-07-17T12:00:00Z',
      fetch_error: null,
      fetch_error_count: 0,
      fetch_error_terminal: 0
    });
  } finally {
    db.close();
  }
});

test('incremental section reconciliation deletes only missing pages in that section', () => {
  const db = openCacheDb(':memory:');
  try {
    db.prepare('INSERT INTO pages(id, parent_section_id, metadata_synced_at) VALUES (?, ?, ?)')
      .run('keep', 'section-1', '2026-07-17T10:00:00Z');
    db.prepare('INSERT INTO pages(id, parent_section_id, metadata_synced_at) VALUES (?, ?, ?)')
      .run('remove', 'section-1', '2026-07-17T10:00:00Z');
    db.prepare('INSERT INTO pages(id, parent_section_id, metadata_synced_at) VALUES (?, ?, ?)')
      .run('other', 'section-2', '2026-07-17T10:00:00Z');

    assert.equal(markMissingSectionPagesDeleted(db, 'section-1', new Set(['keep'])), 1);
    assert.equal(db.prepare('SELECT deleted_at FROM pages WHERE id = ?').get('keep').deleted_at, null);
    assert.ok(db.prepare('SELECT deleted_at FROM pages WHERE id = ?').get('remove').deleted_at);
    assert.equal(db.prepare('SELECT deleted_at FROM pages WHERE id = ?').get('other').deleted_at, null);
  } finally {
    db.close();
  }
});

test('successful sections are reconciled even when another section scan fails', () => {
  const syncSource = fs.readFileSync(fileURLToPath(new URL('../src/sync.ts', import.meta.url)), 'utf8');

  assert.equal(syncSource.includes('if (sectionScanComplete && !maxPages)'), true);
  assert.equal(syncSource.includes('Skipping cross-section missing page deletion because section scans failed'), true);
});

test('quick sync UI requests incremental metadata mode', () => {
  const uiDirectory = fileURLToPath(new URL('../ui/', import.meta.url));
  const source = fs.readFileSync(path.join(uiDirectory, 'sync.js'), 'utf8');
  const listenerStart = source.indexOf("quickSyncButton.addEventListener('click'");
  const listenerEnd = source.indexOf('reparseBibleCacheButton.addEventListener', listenerStart);
  assert.ok(listenerStart >= 0 && listenerEnd > listenerStart);
  assert.match(source.slice(listenerStart, listenerEnd), /incrementalMetadata:\s*true/);
});

test('incremental sync can select cached pages that need Bible reparse', () => {
  const db = openCacheDb(':memory:');
  try {
    const insertPage = db.prepare(`
      INSERT INTO pages(id, title, parent_notebook_id, content_text, content_hash, metadata_synced_at, deleted_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    insertPage.run('missing', 'Missing state', 'notebook-1', 'Text', 'hash-1', '2026-07-17T10:00:00Z', null);
    insertPage.run('error', 'Parse error', 'notebook-1', 'Text', 'hash-2', '2026-07-17T10:00:00Z', null);
    insertPage.run('stale', 'Stale parser', 'notebook-1', 'Text', 'hash-3', '2026-07-17T10:00:00Z', null);
    insertPage.run('current', 'Current', 'notebook-1', 'Text', 'hash-4', '2026-07-17T10:00:00Z', null);
    insertPage.run('other-notebook', 'Other notebook', 'notebook-2', 'Text', 'hash-5', '2026-07-17T10:00:00Z', null);
    insertPage.run('deleted', 'Deleted', 'notebook-1', 'Text', 'hash-6', '2026-07-17T10:00:00Z', '2026-07-18T10:00:00Z');
    insertPage.run('without-content', 'Without content', 'notebook-1', null, null, '2026-07-17T10:00:00Z', null);
    insertPage.run('empty', 'Empty', 'notebook-1', '', 'empty-hash', '2026-07-17T10:00:00Z', null);

    const insertState = db.prepare(`
      INSERT INTO page_bible_parse_state(page_id, content_hash, module, parser_version, parsed_at, parse_error)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    insertState.run('error', 'hash-2', 'rst', 'biblenote-http-v4', null, 'Timed out');
    insertState.run('stale', 'hash-3', 'rst', 'biblenote-http-v3', '2026-07-17T11:00:00Z', null);
    insertState.run('current', 'hash-4', 'rst', 'biblenote-http-v4', '2026-07-17T11:00:00Z', null);
    insertState.run('other-notebook', 'hash-5', 'rst', 'biblenote-http-v4', null, 'Timed out');
    insertState.run('deleted', 'hash-6', 'rst', 'biblenote-http-v3', '2026-07-17T11:00:00Z', null);

    const pages = listCachedPagesNeedingBibleParse(db, {
      module: 'rst',
      parserVersion: 'biblenote-http-v4',
      notebookIds: ['notebook-1']
    });

    assert.deepEqual(pages.map(page => page.id), ['missing', 'error', 'stale']);
  } finally {
    db.close();
  }
});
