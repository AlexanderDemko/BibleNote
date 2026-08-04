import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { once } from 'node:events';
import { openCacheDb } from '../src/cache.js';
import { startCacheUi } from '../src/cache-ui.js';

test('PDF route serves only a cached PDF inside a configured folder root and supports byte ranges', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'biblenote-page-pdf-'));
  const dbPath = path.join(directory, 'cache.sqlite');
  const folderPath = path.join(directory, 'source');
  const pdfPath = path.join(folderPath, 'document.pdf');
  fs.mkdirSync(folderPath);
  const pdfBytes = Buffer.from('%PDF-1.4\nBibleNote visual PDF test\n%%EOF', 'ascii');
  fs.writeFileSync(pdfPath, pdfBytes);
  const previousSources = process.env.BIBLENOTE_DATA_SOURCES;
  process.env.BIBLENOTE_DATA_SOURCES = Buffer.from(JSON.stringify([{
    id:'source:folder:pdf-route', type:'folder', displayName:'PDF route', folderPaths:[folderPath]
  }]), 'utf8').toString('base64url');
  let server: http.Server | undefined;
  try {
    const db = openCacheDb(dbPath);
    db.prepare(`
      INSERT INTO pages(id, title, links_json, metadata_synced_at)
      VALUES (?, ?, ?, ?)
    `).run('pdf-page', 'Document', JSON.stringify({ folder:{ path:pdfPath, extension:'.pdf' } }), new Date().toISOString());
    db.close();

    server = startCacheUi({ dbPath, port:0 });
    await once(server, 'listening');
    const address = server.address();
    assert.ok(address && typeof address === 'object');
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      const startup = await fetch(`${baseUrl}/api/startup`).then(response => response.json()) as { ready?: boolean };
      if (startup.ready) break;
      await new Promise(resolve => setTimeout(resolve, 50));
    }

    const full = await fetch(`${baseUrl}/api/page-pdf?id=pdf-page`);
    assert.equal(full.status, 200);
    assert.equal(full.headers.get('content-type'), 'application/pdf');
    assert.deepEqual(Buffer.from(await full.arrayBuffer()), pdfBytes);

    const partial = await fetch(`${baseUrl}/api/page-pdf?id=pdf-page`, { headers:{ Range:'bytes=5-11' } });
    assert.equal(partial.status, 206);
    assert.equal(partial.headers.get('content-range'), `bytes 5-11/${pdfBytes.length}`);
    assert.deepEqual(Buffer.from(await partial.arrayBuffer()), pdfBytes.subarray(5, 12));

    assert.equal((await fetch(`${baseUrl}/api/page-pdf?id=missing`)).status, 404);
  } finally {
    if (server) await new Promise<void>(resolve => server!.close(() => resolve()));
    if (previousSources == null) delete process.env.BIBLENOTE_DATA_SOURCES;
    else process.env.BIBLENOTE_DATA_SOURCES = previousSources;
    fs.rmSync(directory, { recursive:true, force:true, maxRetries:5, retryDelay:50 });
  }
});
