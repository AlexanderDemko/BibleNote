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
  const nestedFolderPath = path.join(folderPath, 'Nested');
  const pdfPath = path.join(folderPath, 'document.pdf');
  const outsidePath = path.join(directory, 'outside.pdf');
  fs.mkdirSync(folderPath);
  fs.mkdirSync(nestedFolderPath);
  const pdfBytes = Buffer.from('%PDF-1.4\nBibleNote visual PDF test\n%%EOF', 'ascii');
  fs.writeFileSync(pdfPath, pdfBytes);
  fs.writeFileSync(outsidePath, pdfBytes);
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
    db.prepare(`
      INSERT INTO pages(id, title, links_json, metadata_synced_at)
      VALUES (?, ?, ?, ?)
    `).run('outside-page', 'Outside', JSON.stringify({ folder:{ path:outsidePath, extension:'.pdf' } }), new Date().toISOString());
    const syncedAt = new Date().toISOString();
    db.prepare(`
      INSERT INTO notebooks(id, display_name, links_json, synced_at)
      VALUES (?, ?, ?, ?)
    `).run('folder:notebook:test', 'Folder source', JSON.stringify({ folderPath }), syncedAt);
    db.prepare(`
      INSERT INTO section_groups(
        id, display_name, parent_notebook_id, parent_notebook_name,
        section_group_path, order_index, synced_at
      ) VALUES (?, ?, ?, ?, ?, 0, ?)
    `).run('folder:group:nested', 'Nested', 'folder:notebook:test', 'Folder source', 'Nested', syncedAt);
    db.prepare(`
      INSERT INTO sections(
        id, display_name, parent_notebook_id, parent_notebook_name,
        parent_section_group_id, section_group_path, links_json, synced_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'folder:section:nested', 'Файлы', 'folder:notebook:test', 'Folder source',
      'folder:group:nested', 'Nested', JSON.stringify({ folderPath:nestedFolderPath }), syncedAt
    );
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

    const infoResponse = await fetch(`${baseUrl}/api/page-info?id=pdf-page`);
    assert.equal(infoResponse.status, 200);
    const info = await infoResponse.json() as { id?: string; title?: string; links?: { folder?: { path?: string } } };
    assert.equal(info.id, 'pdf-page');
    assert.equal(info.title, 'Document');
    assert.equal(info.links?.folder?.path, pdfPath);

    const openOriginal = await fetch(`${baseUrl}/api/system/open-folder-page`, {
      method:'POST',
      headers:{ 'Content-Type':'application/json' },
      body:JSON.stringify({ pageId:'pdf-page' })
    });
    assert.equal(openOriginal.status, 200);
    assert.deepEqual(await openOriginal.json(), { available:false });

    const groupInfoResponse = await fetch(`${baseUrl}/api/section-group-info?id=folder%3Agroup%3Anested`);
    assert.equal(groupInfoResponse.status, 200);
    const groupInfo = await groupInfoResponse.json() as {
      type?: string; links?: { folderPath?: string }; sectionIds?: string[]; groupIds?: string[];
    };
    assert.equal(groupInfo.type, 'group');
    assert.equal(groupInfo.links?.folderPath, nestedFolderPath);
    assert.deepEqual(groupInfo.sectionIds, ['folder:section:nested']);
    assert.deepEqual(groupInfo.groupIds, ['folder:group:nested']);

    const sectionInfoResponse = await fetch(`${baseUrl}/api/section-info?id=folder%3Asection%3Anested`);
    assert.equal(sectionInfoResponse.status, 200);
    const sectionInfo = await sectionInfoResponse.json() as { type?: string; links?: { folderPath?: string } };
    assert.equal(sectionInfo.type, 'section');
    assert.equal(sectionInfo.links?.folderPath, nestedFolderPath);

    for (const item of [
      { kind:'group', id:'folder:group:nested' },
      { kind:'section', id:'folder:section:nested' }
    ]) {
      const openFolder = await fetch(`${baseUrl}/api/system/open-folder-hierarchy`, {
        method:'POST',
        headers:{ 'Content-Type':'application/json' },
        body:JSON.stringify(item)
      });
      assert.equal(openFolder.status, 200);
      assert.deepEqual(await openFolder.json(), { available:false });
    }

    const rejectedOutside = await fetch(`${baseUrl}/api/system/open-folder-page`, {
      method:'POST',
      headers:{ 'Content-Type':'application/json' },
      body:JSON.stringify({ pageId:'outside-page', reveal:true })
    });
    assert.equal(rejectedOutside.status, 404);

    assert.equal((await fetch(`${baseUrl}/api/page-pdf?id=missing`)).status, 404);
  } finally {
    if (server) await new Promise<void>(resolve => server!.close(() => resolve()));
    if (previousSources == null) delete process.env.BIBLENOTE_DATA_SOURCES;
    else process.env.BIBLENOTE_DATA_SOURCES = previousSources;
    fs.rmSync(directory, { recursive:true, force:true, maxRetries:5, retryDelay:50 });
  }
});
