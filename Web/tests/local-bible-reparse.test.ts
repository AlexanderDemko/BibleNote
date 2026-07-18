import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { getSyncState, openCacheDb } from '../src/cache.js';
import { syncOneNoteCache } from '../src/sync.js';

test('reparses every cached page through BibleNote without using Microsoft Graph', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'biblenote-local-reparse-'));
  const dbPath = path.join(tempDir, 'cache.sqlite');
  const requests: Array<Record<string, unknown>> = [];
  const server = http.createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>;
    requests.push(body);
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({
      pageId: body.pageId,
      module: body.module,
      paragraphs: [{
        index: 0,
        text: body.text,
        references: [{
          originalText: 'Мф. 1:1',
          normalized: 'Матфея 1:1',
          bookIndex: 40,
          chapter: 1,
          verse: 1,
          topChapter: 1,
          topVerse: 1
        }]
      }],
      relations: [],
      relationsCapped: false
    }));
  });

  try {
    const seedDb = openCacheDb(dbPath);
    seedDb.prepare(`
      INSERT INTO pages(id, title, content_text, content_hash, metadata_synced_at)
      VALUES (?, ?, ?, ?, ?)
    `).run('page-1', 'First', 'Мф. 1:1', 'hash-1', '2026-07-17T00:00:00Z');
    seedDb.prepare(`
      INSERT INTO pages(id, title, content_text, content_hash, metadata_synced_at)
      VALUES (?, ?, ?, ?, ?)
    `).run('page-2', 'Second', 'Ин. 1:1', 'hash-2', '2026-07-17T00:00:00Z');
    seedDb.prepare(`
      INSERT INTO pages(id, title, metadata_synced_at)
      VALUES (?, ?, ?)
    `).run('page-without-content', 'No content', '2026-07-17T00:00:00Z');
    seedDb.close();

    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    assert.ok(address && typeof address === 'object');
    const progressPhases: string[] = [];
    const result = await syncOneNoteCache({
      dbPath,
      localBibleReparse: true,
      bibleNoteApiUrl: `http://127.0.0.1:${address.port}`,
      bibleModule: 'rst',
      concurrency: 2,
      onProgress: event => progressPhases.push(event.phase)
    });

    assert.equal(result.pages, 2);
    assert.equal(result.bibleRefsPagesParsed, 2);
    assert.equal(result.bibleRefsParseErrors, 0);
    assert.equal(result.bibleRefsRecognized, 2);
    assert.equal(requests.length, 2);
    assert.deepEqual(new Set(requests.map(request => request.pageId)), new Set(['page-1', 'page-2']));
    assert.ok(requests.every(request => typeof request.text === 'string' && request.html === undefined));
    assert.ok(progressPhases.every(phase => phase === 'bible-parse-local'));

    const db = openCacheDb(dbPath);
    try {
      assert.equal(getSyncState(db, 'last_sync_status'), 'success');
      assert.equal(getSyncState(db, 'last_sync_bible_refs_pages_parsed'), '2');
      assert.equal(db.prepare('SELECT COUNT(*) AS count FROM page_bible_parse_state WHERE parse_error IS NULL').get().count, 2);
    } finally {
      db.close();
    }
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    fs.rmSync(tempDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  }
});
