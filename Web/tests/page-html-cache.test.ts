import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { markPageHtmlParsed, openCacheDb, shouldParsePageHtml, updatePageHtml } from '../src/cache.js';
import { startCacheUi } from '../src/cache-ui.js';

test('page HTML parse state is keyed by HTML, module, and parser version', () => {
  const db = openCacheDb(':memory:');
  try {
    db.prepare(`
      INSERT INTO pages(id, title, content_html, metadata_synced_at)
      VALUES (?, ?, ?, ?)
    `).run('page-1', 'Page', '<html>first</html>', '2026-07-17T00:00:00Z');

    assert.equal(shouldParsePageHtml(db, 'page-1', '<html>first</html>', 'rst', 'parser-v1'), true);
    markPageHtmlParsed(db, 'page-1', '<html>first</html>', 'rst', 'parser-v1');
    assert.equal(shouldParsePageHtml(db, 'page-1', '<html>first</html>', 'rst', 'parser-v1'), false);
    assert.equal(shouldParsePageHtml(db, 'page-1', '<html>changed</html>', 'rst', 'parser-v1'), true);
    assert.equal(shouldParsePageHtml(db, 'page-1', '<html>first</html>', 'kjv', 'parser-v1'), true);
    assert.equal(shouldParsePageHtml(db, 'page-1', '<html>first</html>', 'rst', 'parser-v2'), true);
  } finally {
    db.close();
  }
});

test('local HTML processing does not pretend that Graph content was downloaded again', () => {
  const db = openCacheDb(':memory:');
  try {
    db.prepare(`
      INSERT INTO pages(id, content_html, content_synced_at, metadata_synced_at)
      VALUES (?, ?, ?, ?)
    `).run('page-1', '<html>source</html>', '2026-07-18T10:00:00Z', '2026-07-18T09:00:00Z');

    updatePageHtml(db, 'page-1', '<html>locally processed</html>');
    const row = db.prepare('SELECT content_html, content_synced_at FROM pages WHERE id = ?').get('page-1') as any;
    assert.deepEqual(row, {
      content_html:'<html>locally processed</html>',
      content_synced_at:'2026-07-18T10:00:00Z'
    });
  } finally {
    db.close();
  }
});

test('page HTML route serves cached HTML before refreshing Bible links', () => {
  const sourceDirectory = fileURLToPath(new URL('../src/', import.meta.url));
  const cacheUi = fs.readFileSync(path.join(sourceDirectory, 'cache-ui.ts'), 'utf8');
  const routeStart = cacheUi.indexOf("if (url.pathname === '/api/page-html')");
  const routeEnd = cacheUi.indexOf("return json(response, 404, { error: 'Not found.' });", routeStart);
  assert.ok(routeStart >= 0 && routeEnd > routeStart, 'page HTML route is missing');
  const route = cacheUi.slice(routeStart, routeEnd);
  const cacheCheck = route.indexOf('shouldParsePageHtml(');
  const refreshStart = route.indexOf('startPageHtmlRefresh(pageId, module)');
  const immediateResponse = route.indexOf('html: row.content_html, refreshing:true');
  assert.ok(cacheCheck >= 0, 'page HTML parse cache check is missing');
  assert.ok(refreshStart > cacheCheck, 'page HTML parse cache must be checked before background refresh starts');
  assert.ok(immediateResponse > refreshStart, 'cached HTML must be returned while the refresh runs in background');
  assert.equal(route.includes('await ensureBibleNoteAvailable()'), false, 'page HTML request must not await BibleNote');
});

test('background page HTML refresh completion refreshes an active weighted search', () => {
  const uiDirectory = fileURLToPath(new URL('../ui/', import.meta.url));
  const treePages = fs.readFileSync(path.join(uiDirectory, 'tree-pages.js'), 'utf8');
  assert.match(treePages, /result\.refreshing/);
  assert.match(treePages, /waitForPageHtmlRefresh\(/);
  assert.match(treePages, /result\.bibleReparsed\s*&&\s*activeSearchQuery/);
  assert.match(treePages, /renderSearch\(activeSearchQuery\)/);
});

test('page HTML endpoint returns immediately and deduplicates a slow refresh', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'biblenote-page-html-'));
  const dbPath = path.join(tempDir, 'cache.sqlite');
  const previousApiUrl = process.env.BIBLENOTE_API_URL;
  let parseRequests = 0;
  const bibleApi = http.createServer(async (request, response) => {
    if (request.url?.endsWith('/Health')) {
      response.writeHead(200, { 'Content-Type':'application/json' });
      response.end('{}');
      return;
    }
    if (request.url?.endsWith('/ParsePage')) {
      parseRequests += 1;
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(Buffer.from(chunk));
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>;
      await new Promise(resolve => setTimeout(resolve, 300));
      response.writeHead(200, { 'Content-Type':'application/json' });
      response.end(JSON.stringify({
        pageId:body.pageId,
        module:body.module,
        html:'<html><body><a href="bnVerse:rst/40 1:1">Matthew 1:1</a></body></html>',
        paragraphs:[],
        relations:[],
        relationsCapped:false
      }));
      return;
    }
    response.writeHead(404).end();
  });
  let uiServer: http.Server | undefined;

  try {
    const seedDb = openCacheDb(dbPath);
    seedDb.prepare(`
      INSERT INTO pages(id, title, content_text, content_html, content_hash, metadata_synced_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run('page-1', 'Slow page', 'Matthew 1:1', '<html><body>Matthew 1:1</body></html>', 'hash-1', '2026-07-17T00:00:00Z');
    seedDb.close();

    bibleApi.listen(0, '127.0.0.1');
    await once(bibleApi, 'listening');
    const bibleAddress = bibleApi.address();
    assert.ok(bibleAddress && typeof bibleAddress === 'object');
    process.env.BIBLENOTE_API_URL = `http://127.0.0.1:${bibleAddress.port}`;

    uiServer = startCacheUi({ dbPath, port:0 });
    await once(uiServer, 'listening');
    const uiAddress = uiServer.address();
    assert.ok(uiAddress && typeof uiAddress === 'object');
    const baseUrl = `http://127.0.0.1:${uiAddress.port}`;
    const readyDeadline = Date.now() + 5000;
    while (Date.now() < readyDeadline) {
      const startup = await fetch(`${baseUrl}/api/startup`).then(response => response.json()) as { ready?: boolean };
      if (startup.ready) break;
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    const target = `${baseUrl}/api/page-html?id=page-1&module=rst`;
    const startedAt = Date.now();
    const [first, duplicate] = await Promise.all([
      fetch(target).then(response => response.json()),
      fetch(target).then(response => response.json())
    ]) as Array<{ refreshing?: boolean; html?: string }>;
    assert.ok(Date.now() - startedAt < 250, 'cached HTML response waited for the slow parser');
    assert.equal(first.refreshing, true);
    assert.equal(duplicate.refreshing, true);
    assert.equal(first.html, '<html><body>Matthew 1:1</body></html>');

    await new Promise(resolve => setTimeout(resolve, 450));
    const refreshed = await fetch(target).then(response => response.json()) as { refreshing?: boolean; html?: string };
    assert.equal(refreshed.refreshing, undefined);
    assert.match(refreshed.html || '', /bnVerse:/);
    assert.equal(parseRequests, 1);
  } finally {
    if (uiServer) await new Promise<void>(resolve => uiServer!.close(() => resolve()));
    await new Promise<void>(resolve => bibleApi.close(() => resolve()));
    if (previousApiUrl == null) delete process.env.BIBLENOTE_API_URL;
    else process.env.BIBLENOTE_API_URL = previousApiUrl;
    fs.rmSync(tempDir, { recursive:true, force:true, maxRetries:5, retryDelay:50 });
  }
});
