import assert from 'node:assert/strict';
import * as cheerio from 'cheerio';
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

test('classic OneNote pages can be recognized by their local hierarchy id without a cached link', () => {
  const treePages = fs.readFileSync(path.resolve(testDirectory, '../ui/tree-pages.js'), 'utf8');
  assert.equal(treePages.includes("/^\\{[0-9A-F-]+\\}/i.test(String(page?.id || ''))"), true);
  assert.equal(treePages.includes('actions.append(revealPageButton);'), true);
  assert.ok(treePages.indexOf('actions.append(revealPageButton);') < treePages.indexOf('actions.append(openInOneNoteButton);'));
  assert.ok(treePages.indexOf('actions.append(openInOneNoteButton);') < treePages.indexOf('actions.append(syncPageButton);'));
});

test('classic OneNote page XML becomes searchable renderable HTML', () => {
  const xml = fs.readFileSync(
    path.resolve(testDirectory, '../../Api/Tests/TestData/OneNote_1.html'),
    'utf8'
  );
  const html = oneNoteComPageXmlToHtml(xml);
  const text = htmlToText(html);

  assert.match(html, /<table\b/);
  assert.match(html, /class="onenote-com-page"/);
  assert.match(text, /Троица/);
  assert.match(text, /Иудейская пасха/);
  assert.match(text, /Уникальные черты Бога/);
});

test('classic OneNote table layout and appearance are preserved', () => {
  const html = oneNoteComPageXmlToHtml(`<?xml version="1.0"?>
    <one:Page xmlns:one="http://schemas.microsoft.com/office/onenote/2013/onenote" ID="{page}">
      <one:Outline><one:OEChildren><one:OE>
        <one:Table bordersVisible="true" hasHeaderRow="true">
          <one:Columns>
            <one:Column index="0" width="40.5"/>
            <one:Column index="1" width="159.5"/>
          </one:Columns>
          <one:Row>
            <one:Cell shadingColor="#B3B3B3"><one:OEChildren><one:OE><one:T><![CDATA[Number]]></one:T></one:OE></one:OEChildren></one:Cell>
            <one:Cell shadingColor="#B3B3B3"><one:OEChildren><one:OE><one:T><![CDATA[Details]]></one:T></one:OE></one:OEChildren></one:Cell>
          </one:Row>
          <one:Row>
            <one:Cell><one:OEChildren><one:OE><one:T><![CDATA[1]]></one:T></one:OE></one:OEChildren></one:Cell>
            <one:Cell><one:OEChildren><one:OE><one:T><![CDATA[Text]]></one:T></one:OE></one:OEChildren></one:Cell>
          </one:Row>
        </one:Table>
      </one:OE></one:OEChildren></one:Outline>
    </one:Page>`);

  const $ = cheerio.load(html);
  const table = $('table').first();
  assert.equal(table.hasClass('onenote-table-fixed'), true);
  assert.equal(table.hasClass('onenote-table-bordered'), true);
  assert.equal(table.attr('style'), 'width:400px');
  assert.deepEqual(table.find('col').map((_, column) => $(column).attr('style')).get(), [
    'width:20.25%',
    'width:79.75%'
  ]);
  assert.equal(table.find('thead th').length, 2);
  assert.equal(table.find('thead th').first().attr('style'), 'background-color:#B3B3B3');
  assert.equal(table.find('tbody td').length, 2);
});

test('classic OneNote tables keep nested bullets and fit their container', () => {
  const html = oneNoteComPageXmlToHtml(`<?xml version="1.0"?>
    <one:Page xmlns:one="http://schemas.microsoft.com/office/onenote/2013/onenote" ID="{page}">
      <one:QuickStyleDef index="1" name="p" fontColor="automatic" highlightColor="automatic" font="Calibri" fontSize="11.0"/>
      <one:QuickStyleDef index="2" name="h2" fontColor="#366092" highlightColor="automatic" font="Calibri" fontSize="13.0" bold="true"/>
      <one:Outline><one:OEChildren><one:OE>
        <one:Table bordersVisible="true">
          <one:Columns>
            <one:Column index="0" width="266.75"/>
            <one:Column index="1" width="280.25"/>
          </one:Columns>
          <one:Row><one:Cell><one:OEChildren><one:OE>
            <one:T><![CDATA[Acts 1]]></one:T>
            <one:OEChildren><one:OE quickStyleIndex="1">
              <one:List><one:Bullet bullet="2" fontSize="11.0"/></one:List>
              <one:T><![CDATA[Acts 1:5 — disciples will be baptized]]></one:T>
            </one:OE></one:OEChildren>
          </one:OE></one:OEChildren></one:Cell></one:Row>
        </one:Table>
      </one:OE><one:OEChildren>
        <one:OE quickStyleIndex="1"><one:List><one:Number text="9."/></one:List><one:T><![CDATA[Девятый]]></one:T></one:OE>
        <one:OE quickStyleIndex="1"><one:List><one:Number text="10."/></one:List><one:T><![CDATA[Десятый]]></one:T></one:OE>
        <one:OE quickStyleIndex="1"><one:List><one:Number text="а)"/></one:List><one:T><![CDATA[Подпункт]]></one:T></one:OE>
      </one:OEChildren><one:OE quickStyleIndex="1"><one:T><![CDATA[]]></one:T></one:OE>
      <one:OE quickStyleIndex="2"><one:T><![CDATA[Вывод]]></one:T></one:OE></one:OEChildren></one:Outline>
    </one:Page>`);

  const $ = cheerio.load(html);
  assert.equal($('.onenote-list-bullet').text(), 'Acts 1:5 — disciples will be baptized');
  assert.match(html, /\.onenote-paragraph>\.onenote-children\{margin-left:1\.5em\}/);
  assert.match(html, /\.onenote-list-bullet:before\{content:"•"/);
  assert.match(html, /\.onenote-table\{border-collapse:collapse;max-width:100%/);
  assert.match(html, /\.onenote-paragraph:empty\{min-height:1em\}/);
  assert.match(html, /\.onenote-list-number:before\{content:attr\(data-onenote-number\);[^}]*white-space:nowrap/);
  assert.deepEqual($('col').map((_, column) => $(column).attr('style')).get(), [
    `width:${266.75 / 547 * 100}%`,
    `width:${280.25 / 547 * 100}%`
  ]);
  assert.equal($('.onenote-paragraph').filter((_, element) => $(element).text() === 'Вывод').attr('style'),
    'color:#366092;background-color:transparent;font-family:Calibri;font-size:13pt;font-weight:bold;font-style:normal;text-decoration:none');
  assert.equal($('.onenote-list-bullet').first().attr('style'),
    'color:initial;background-color:transparent;font-family:Calibri;font-size:11pt;font-weight:normal;font-style:normal;text-decoration:none');
  assert.deepEqual($('.onenote-list-number').map((_, element) => $(element).attr('data-onenote-number')).get(), [
    '9.', '10.', 'а)'
  ]);
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
