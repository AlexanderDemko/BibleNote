import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { openCacheDb, readCachedPage } from '../src/cache.js';
import { htmlToText } from '../src/html.js';
import { oneNoteComPageXmlToHtml, parseOneNoteComHierarchy } from '../src/onenote-com.js';
import { syncOneNoteCache } from '../src/sync.js';

const testDirectory = path.dirname(fileURLToPath(import.meta.url));

test('classic OneNote hierarchy is normalized for the shared cache', () => {
  const snapshot = parseOneNoteComHierarchy(`<?xml version="1.0"?>
    <one:Notebooks xmlns:one="http://schemas.microsoft.com/office/onenote/2013/onenote">
      <one:Notebook ID="{notebook}" name="Study" lastModifiedTime="2026-07-30T10:00:00Z">
        <one:SectionGroup ID="{group}" name="Topics">
          <one:Section ID="{section}" name="Grace">
            <one:Page ID="{page-1}" name="Romans 5" pageLevel="1" lastModifiedTime="2026-07-30T11:00:00Z"/>
            <one:Page ID="{page-2}" name="Child" pageLevel="2" lastModifiedTime="2026-07-30T12:00:00Z"/>
          </one:Section>
        </one:SectionGroup>
      </one:Notebook>
    </one:Notebooks>`);

  assert.deepEqual(snapshot.notebooks.map(item => item.id), ['{notebook}']);
  assert.deepEqual(snapshot.sectionGroups.map(item => item.id), ['{group}']);
  assert.equal(snapshot.sections[0].sectionGroupPath, 'Topics');
  assert.equal(snapshot.pages[0].parentNotebook?.id, '{notebook}');
  assert.equal(snapshot.pages[1].level, 2);
  assert.equal(snapshot.pages[1].orderIndex, 1);
});

test('classic OneNote page XML becomes searchable renderable HTML', () => {
  const xml = fs.readFileSync(
    path.resolve(testDirectory, '../../Api/Tests/TestData/OneNote_1.html'),
    'utf8'
  );
  const html = oneNoteComPageXmlToHtml(xml);
  const text = htmlToText(html);

  assert.match(html, /<table>/);
  assert.match(html, /class="onenote-com-page"/);
  assert.match(text, /Троица/);
  assert.match(text, /Иудейская пасха/);
  assert.match(text, /Уникальные черты Бога/);
});

test('unsafe inline markup from OneNote is removed before cached rendering', () => {
  const html = oneNoteComPageXmlToHtml(`<?xml version="1.0"?>
    <one:Page xmlns:one="http://schemas.microsoft.com/office/onenote/2013/onenote" ID="{page}">
      <one:Outline><one:OEChildren><one:OE><one:T><![CDATA[
        <span onclick="alert(1)">Safe</span><script>alert(2)</script><a href="javascript:alert(3)">link</a>
      ]]></one:T></one:OE></one:OEChildren></one:Outline>
    </one:Page>`);

  assert.match(html, />Safe</);
  assert.doesNotMatch(html, /onclick|<script|javascript:/i);
});

test('COM source synchronizes hierarchy and page content into the shared cache', async () => {
  const hierarchyXml = `<?xml version="1.0"?>
    <one:Notebooks xmlns:one="http://schemas.microsoft.com/office/onenote/2013/onenote">
      <one:Notebook ID="{notebook}" name="Local notes">
        <one:Section ID="{section}" name="Sermons">
          <one:Page ID="{page}" name="Grace" lastModifiedTime="2026-07-30T12:00:00Z"/>
        </one:Section>
      </one:Notebook>
    </one:Notebooks>`;
  const pageXml = `<?xml version="1.0"?>
    <one:Page xmlns:one="http://schemas.microsoft.com/office/onenote/2013/onenote" ID="{page}">
      <one:Title><one:OE><one:T><![CDATA[Grace]]></one:T></one:OE></one:Title>
      <one:Outline><one:OEChildren><one:OE><one:T><![CDATA[Saved through COM]]></one:T></one:OE></one:OEChildren></one:Outline>
    </one:Page>`;
  const server = http.createServer((request, response) => {
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    if (request.url === '/api/VerseParsing/Health') {
      response.end('{}');
    } else if (request.url === '/api/OneNoteIntegration/Hierarchy') {
      response.end(JSON.stringify({ xml:hierarchyXml }));
    } else if (request.url?.startsWith('/api/OneNoteIntegration/PageContent?')) {
      response.end(JSON.stringify({ xml:pageXml }));
    } else {
      response.statusCode = 404;
      response.end(JSON.stringify({ error:'not found' }));
    }
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'biblenote-com-sync-'));
  const dbPath = path.join(temporaryDirectory, 'cache.sqlite');
  const previousSource = process.env.ONENOTE_DATA_SOURCE;
  const previousApiUrl = process.env.BIBLENOTE_API_URL;
  process.env.ONENOTE_DATA_SOURCE = 'com';
  process.env.BIBLENOTE_API_URL = `http://127.0.0.1:${address.port}`;

  try {
    const result = await syncOneNoteCache({
      dbPath,
      includeHtml:true,
      parseBibleRefs:false
    });
    assert.equal(result.notebooks, 1);
    assert.equal(result.pages, 1);
    assert.equal(result.contentDownloaded, 1);

    const db = openCacheDb(dbPath);
    try {
      const page = readCachedPage(db, '{page}', true, 100_000);
      assert.match(String(page.text ?? ''), /Saved through COM/);
      assert.match(String(page.html ?? ''), /onenote-com-page/);
    } finally {
      db.close();
    }
  } finally {
    if (previousSource == null) delete process.env.ONENOTE_DATA_SOURCE;
    else process.env.ONENOTE_DATA_SOURCE = previousSource;
    if (previousApiUrl == null) delete process.env.BIBLENOTE_API_URL;
    else process.env.BIBLENOTE_API_URL = previousApiUrl;
    await new Promise<void>(resolve => server.close(() => resolve()));
    fs.rmSync(temporaryDirectory, { recursive:true, force:true });
  }
});
