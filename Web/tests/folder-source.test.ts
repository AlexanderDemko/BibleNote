import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import JSZip from 'jszip';
import { extractFolderFile, repairPdfTextEncoding, WordComUnavailableError } from '../src/folder-extract.js';
import { loadFolderSnapshot } from '../src/folder-source.js';
import { openCacheDb, readCachedPage } from '../src/cache.js';
import { configureRuntimeLogging } from '../src/runtime-logging.js';
import { syncOneNoteCache } from '../src/sync.js';

function minimalPdf(lines: string[]): Buffer {
  const escapedLines = lines.map(line => line.replace(/([\\()])/g, '\\$1'));
  const commands = escapedLines.length > 0
    ? `BT /F1 12 Tf 72 720 Td ${escapedLines.map((line, index) => `${index ? '0 -20 Td ' : ''}(${line}) Tj`).join(' ')} ET`
    : '';
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(commands, 'ascii')} >>\nstream\n${commands}\nendstream`
  ];
  let output = '%PDF-1.4\n';
  const offsets = [0];
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(output, 'ascii'));
    output += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const xrefOffset = Buffer.byteLength(output, 'ascii');
  output += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) output += `${String(offset).padStart(10, '0')} 00000 n \n`;
  output += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(output, 'ascii');
}

function twoColumnPdf(): Buffer {
  const commands = [
    'BT /F1 12 Tf',
    '72 720 Td (Full width heading) Tj',
    '0 -40 Td (Left first) Tj',
    '250 0 Td (Right first) Tj',
    '-250 -20 Td (Left second) Tj',
    '250 0 Td (Right second) Tj',
    'ET'
  ].join(' ');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(commands, 'ascii')} >>\nstream\n${commands}\nendstream`
  ];
  let output = '%PDF-1.4\n';
  const offsets = [0];
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(output, 'ascii'));
    output += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const xrefOffset = Buffer.byteLength(output, 'ascii');
  output += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) output += `${String(offset).padStart(10, '0')} 00000 n \n`;
  output += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(output, 'ascii');
}

async function writeMinimalDocx(filePath: string): Promise<void> {
  const zip = new JSZip();
  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
      <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
      <Default Extension="xml" ContentType="application/xml"/>
      <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
    </Types>`);
  zip.folder('_rels')?.file('.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
      <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
    </Relationships>`);
  zip.folder('word')?.file('document.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
      <w:body><w:p><w:r><w:t>Ссылка Ин 3:16 в DOCX</w:t></w:r></w:p><w:sectPr/></w:body>
    </w:document>`);
  fs.writeFileSync(filePath, await zip.generateAsync({ type:'nodebuffer' }));
}

test('folder snapshot ignores temporary Microsoft Office lock files', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'biblenote-folder-lock-file-'));
  try {
    fs.writeFileSync(path.join(directory, 'real.txt'), 'John 1:1', 'utf8');
    fs.writeFileSync(path.join(directory, '~$document.docx'), 'temporary lock', 'utf8');
    const snapshot = await loadFolderSnapshot([directory]);
    assert.deepEqual(snapshot.pages.map(page => page.title), ['real']);
    assert.equal(snapshot.scanErrors.length, 0);
  } finally {
    fs.rmSync(directory, { recursive:true, force:true });
  }
});

test('folder snapshot can keep one preferred format for equal file names in the same directory', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'biblenote-folder-preferred-format-'));
  const child = path.join(directory, 'child');
  fs.mkdirSync(child);
  try {
    for (const extension of ['.pdf', '.txt', '.html', '.doc', '.docx']) {
      fs.writeFileSync(path.join(directory, `lesson${extension}`), extension);
    }
    fs.writeFileSync(path.join(directory, 'web.htm'), 'htm');
    fs.writeFileSync(path.join(directory, 'web.html'), 'html');
    fs.writeFileSync(path.join(directory, 'only.pdf'), 'pdf');
    fs.writeFileSync(path.join(child, 'lesson.pdf'), 'child pdf');

    const complete = await loadFolderSnapshot([directory]);
    assert.equal(complete.pages.length, 9);

    const preferred = await loadFolderSnapshot([directory], { deduplicateFilesByName:true });
    assert.deepEqual(
      preferred.pages.map(page => page.links.folder.relativePath).sort(),
      ['child\\lesson.pdf', 'lesson.docx', 'only.pdf', 'web.html'].sort()
    );
  } finally {
    fs.rmSync(directory, { recursive:true, force:true });
  }
});

test('named folder source synchronizes only the preferred duplicate format when enabled', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'biblenote-folder-preferred-sync-'));
  const dbPath = path.join(directory, 'cache.sqlite');
  const notesPath = path.join(directory, 'notes');
  fs.mkdirSync(notesPath);
  await writeMinimalDocx(path.join(notesPath, 'lesson.docx'));
  fs.writeFileSync(path.join(notesPath, 'lesson.pdf'), minimalPdf(['John 3:16']));
  const previousSources = process.env.BIBLENOTE_DATA_SOURCES;
  const configureSource = (deduplicateFilesByName: boolean) => {
    process.env.BIBLENOTE_DATA_SOURCES = Buffer.from(JSON.stringify([{
      id:'source:folder:preferred-test',
      type:'folder',
      displayName:'Preferred files',
      folderPaths:[notesPath],
      deduplicateFilesByName
    }]), 'utf8').toString('base64url');
  };
  try {
    configureSource(false);
    const initial = await syncOneNoteCache({ dbPath, parseBibleRefs:false });
    assert.equal(initial.pages, 2);

    configureSource(true);
    const result = await syncOneNoteCache({ dbPath, parseBibleRefs:false });
    assert.equal(result.pages, 1);
    assert.equal(result.deletedPagesMarked, 1);
    const db = openCacheDb(dbPath);
    const row = db.prepare('SELECT title, links_json AS linksJson FROM pages WHERE deleted_at IS NULL').get() as { title: string; linksJson: string };
    assert.equal(row.title, 'lesson');
    assert.equal(JSON.parse(row.linksJson).folder.extension, '.docx');
    db.close();

    fs.rmSync(path.join(notesPath, 'lesson.docx'));
    const fallback = await syncOneNoteCache({ dbPath, parseBibleRefs:false });
    assert.equal(fallback.pages, 1);
    const fallbackDb = openCacheDb(dbPath);
    const fallbackRow = fallbackDb.prepare('SELECT links_json AS linksJson FROM pages WHERE deleted_at IS NULL').get() as { linksJson: string };
    assert.equal(JSON.parse(fallbackRow.linksJson).folder.extension, '.pdf');
    fallbackDb.close();
  } finally {
    if (previousSources == null) delete process.env.BIBLENOTE_DATA_SOURCES;
    else process.env.BIBLENOTE_DATA_SOURCES = previousSources;
    fs.rmSync(directory, { recursive:true, force:true });
  }
});

test('PDF text extraction repairs Windows-1251 glyphs without changing normal text', () => {
  assert.equal(
    repairPdfTextEncoding('Ñ äðóãîé ñòîðîíû, Ãîñïîäü æäåò îò íàñ.'),
    'С другой стороны, Господь ждет от нас.'
  );
  assert.equal(repairPdfTextEncoding('John 3:16 and Romans 5:8'), 'John 3:16 and Romans 5:8');
  assert.equal(repairPdfTextEncoding('Café déjà vu'), 'Café déjà vu');
});

test('folder quick sync refreshes a cached PDF after the extraction algorithm changes', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'biblenote-folder-pdf-version-'));
  const dbPath = path.join(directory, 'cache.sqlite');
  const notesPath = path.join(directory, 'notes');
  fs.mkdirSync(notesPath, { recursive:true });
  fs.writeFileSync(path.join(notesPath, 'document.pdf'), minimalPdf(['John 3:16']));
  const previousSource = process.env.ONENOTE_DATA_SOURCE;
  const previousFolders = process.env.ONENOTE_FOLDER_PATHS;
  const previousSources = process.env.BIBLENOTE_DATA_SOURCES;
  process.env.ONENOTE_DATA_SOURCE = 'folder';
  process.env.ONENOTE_FOLDER_PATHS = Buffer.from(JSON.stringify([notesPath]), 'utf8').toString('base64url');
  process.env.BIBLENOTE_DATA_SOURCES = Buffer.from(JSON.stringify([
    { id:'pdf-test', type:'folder', displayName:'PDF test', folderPaths:[notesPath] }
  ]), 'utf8').toString('base64url');
  try {
    const first = await syncOneNoteCache({ dbPath, parseBibleRefs:false });
    assert.equal(first.contentDownloaded, 1);

    const db = openCacheDb(dbPath);
    const row = db.prepare("SELECT id, links_json AS linksJson FROM pages WHERE title = 'document'").get() as { id: string; linksJson: string };
    const links = JSON.parse(row.linksJson);
    delete links.folder.extractionVersion;
    db.prepare('UPDATE pages SET links_json = ? WHERE id = ?').run(JSON.stringify(links), row.id);
    db.close();

    const refreshed = await syncOneNoteCache({ dbPath, parseBibleRefs:false });
    assert.equal(refreshed.contentDownloaded, 1);
    const unchanged = await syncOneNoteCache({ dbPath, parseBibleRefs:false });
    assert.equal(unchanged.contentDownloaded, 0);
    assert.equal(unchanged.contentSkipped, 1);
  } finally {
    if (previousSource == null) delete process.env.ONENOTE_DATA_SOURCE;
    else process.env.ONENOTE_DATA_SOURCE = previousSource;
    if (previousFolders == null) delete process.env.ONENOTE_FOLDER_PATHS;
    else process.env.ONENOTE_FOLDER_PATHS = previousFolders;
    if (previousSources == null) delete process.env.BIBLENOTE_DATA_SOURCES;
    else process.env.BIBLENOTE_DATA_SOURCES = previousSources;
    fs.rmSync(directory, { recursive:true, force:true });
  }
});

test('folder extractors preserve useful structure and report PDF quality without OCR', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'biblenote-folder-extract-'));
  try {
    const textPath = path.join(directory, 'outline.txt');
    fs.writeFileSync(textPath, 'Ин 1:1\n  пояснение Ин 1:2\nИн 1:3', 'utf8');
    const text = await extractFolderFile(textPath);
    assert.equal(text.format, 'text');
    assert.equal(text.quality, 'textual');
    assert.match(text.html, /<li><p>Ин 1:1<\/p><ul><li><p>пояснение Ин 1:2/);

    const htmlPath = path.join(directory, 'page.html');
    fs.writeFileSync(htmlPath, '<html><body><script>alert(1)</script><p onclick="bad()">Ин 2:1</p></body></html>');
    const html = await extractFolderFile(htmlPath);
    assert.doesNotMatch(html.html, /script|onclick|alert\(1\)/i);
    assert.match(html.text, /Ин 2:1/);

    const docxPath = path.join(directory, 'page.docx');
    await writeMinimalDocx(docxPath);
    const docx = await extractFolderFile(docxPath);
    assert.equal(docx.format, 'docx');
    assert.equal(docx.quality, 'textual');
    assert.match(docx.text, /Ин 3:16/);

    const legacyDocPath = path.join(directory, 'legacy.doc');
    fs.writeFileSync(legacyDocPath, 'legacy placeholder');
    const legacyDoc = await extractFolderFile(legacyDocPath, {
      legacyDocConverter:async (sourcePath, targetDocxPath) => {
        assert.equal(sourcePath, legacyDocPath);
        await writeMinimalDocx(targetDocxPath);
      }
    });
    assert.equal(legacyDoc.format, 'doc');
    assert.equal(legacyDoc.quality, 'textual');
    assert.match(legacyDoc.text, /Ин 3:16/);
    assert.match(legacyDoc.qualityMessage, /Word COM/);

    const textPdfPath = path.join(directory, 'text.pdf');
    fs.writeFileSync(textPdfPath, minimalPdf(['John 3:16 points to Romans 5:8.', 'Second textual paragraph for reliable extraction.']));
    const textPdf = await extractFolderFile(textPdfPath);
    assert.equal(textPdf.format, 'pdf');
    assert.equal(textPdf.quality, 'textual');
    assert.match(textPdf.text, /John 3:16/);

    const scanPdfPath = path.join(directory, 'scan.pdf');
    fs.writeFileSync(scanPdfPath, minimalPdf([]));
    const scanPdf = await extractFolderFile(scanPdfPath);
    assert.equal(scanPdf.quality, 'requires_ocr');
    assert.match(scanPdf.qualityMessage, /OCR/);
  } finally {
    fs.rmSync(directory, { recursive:true, force:true });
  }
});

test('PDF extraction reads a two-column block one column at a time', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'biblenote-pdf-columns-'));
  try {
    const pdfPath = path.join(directory, 'columns.pdf');
    fs.writeFileSync(pdfPath, twoColumnPdf());
    const result = await extractFolderFile(pdfPath);
    const heading = result.text.indexOf('Full width heading');
    const leftFirst = result.text.indexOf('Left first');
    const leftSecond = result.text.indexOf('Left second');
    const rightFirst = result.text.indexOf('Right first');
    const rightSecond = result.text.indexOf('Right second');

    assert.ok(heading >= 0);
    assert.ok(heading < leftFirst);
    assert.ok(leftFirst < leftSecond);
    assert.ok(leftSecond < rightFirst);
    assert.ok(rightFirst < rightSecond);
  } finally {
    fs.rmSync(directory, { recursive:true, force:true });
  }
});

test('folder sync stores supported files in the shared cache and marks removed files deleted', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'biblenote-folder-sync-'));
  const dbPath = path.join(directory, 'cache.sqlite');
  const notesPath = path.join(directory, 'notes');
  const childPath = path.join(notesPath, 'child');
  fs.mkdirSync(childPath, { recursive:true });
  const textPath = path.join(notesPath, 'first.txt');
  fs.writeFileSync(textPath, 'Ин 1:1\n  Ин 1:2', 'utf8');
  fs.writeFileSync(path.join(childPath, 'second.html'), '<p>Рим 1:1</p>', 'utf8');
  fs.writeFileSync(path.join(notesPath, '~$first.docx'), 'temporary Microsoft Office lock file', 'utf8');

  const previousSource = process.env.ONENOTE_DATA_SOURCE;
  const previousFolders = process.env.ONENOTE_FOLDER_PATHS;
  process.env.ONENOTE_DATA_SOURCE = 'folder';
  process.env.ONENOTE_FOLDER_PATHS = Buffer.from(JSON.stringify([notesPath]), 'utf8').toString('base64url');
  try {
    const first = await syncOneNoteCache({ dbPath, parseBibleRefs:false });
    assert.equal(first.notebooks, 1);
    assert.equal(first.pages, 2);
    assert.equal(first.contentDownloaded, 2);

    let db = openCacheDb(dbPath);
    const pages = db.prepare('SELECT id, title, content_html FROM pages WHERE deleted_at IS NULL ORDER BY title').all() as any[];
    assert.deepEqual(pages.map(page => page.title), ['first', 'second']);
    assert.ok(pages.every(page => typeof page.content_html === 'string' && page.content_html.length > 0));
    const firstPage = readCachedPage(db, pages[0].id, true, 10_000);
    assert.equal((firstPage.links as any)?.folder?.extension, '.txt');
    db.close();

    fs.rmSync(textPath);
    const second = await syncOneNoteCache({ dbPath, parseBibleRefs:false });
    assert.equal(second.deletedPagesMarked, 1);
    db = openCacheDb(dbPath);
    assert.equal((db.prepare('SELECT COUNT(*) value FROM pages WHERE deleted_at IS NULL').get() as any).value, 1);
    db.close();
  } finally {
    if (previousSource == null) delete process.env.ONENOTE_DATA_SOURCE;
    else process.env.ONENOTE_DATA_SOURCE = previousSource;
    if (previousFolders == null) delete process.env.ONENOTE_FOLDER_PATHS;
    else process.env.ONENOTE_FOLDER_PATHS = previousFolders;
    fs.rmSync(directory, { recursive:true, force:true });
  }
});

test('one named folder source synchronizes multiple roots into one cache', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'biblenote-folder-multiple-'));
  const dbPath = path.join(directory, 'cache.sqlite');
  const firstFolder = path.join(directory, 'first-source');
  const secondFolder = path.join(directory, 'second-source');
  fs.mkdirSync(firstFolder, { recursive:true });
  fs.mkdirSync(secondFolder, { recursive:true });
  const firstFile = path.join(firstFolder, 'first.txt');
  fs.writeFileSync(firstFile, 'John 1:1', 'utf8');
  fs.writeFileSync(path.join(secondFolder, 'second.txt'), 'John 1:2', 'utf8');

  const previousSources = process.env.BIBLENOTE_DATA_SOURCES;
  process.env.BIBLENOTE_DATA_SOURCES = Buffer.from(JSON.stringify([
    { type:'folder', displayName:'Combined notes', folderPaths:[firstFolder, secondFolder] }
  ]), 'utf8').toString('base64url');
  try {
    const first = await syncOneNoteCache({ dbPath, parseBibleRefs:false });
    assert.equal(first.notebooks, 2);
    assert.equal(first.pages, 2);

    let db = openCacheDb(dbPath);
    assert.deepEqual(
      (db.prepare('SELECT title FROM pages WHERE deleted_at IS NULL ORDER BY title').all() as Array<{ title: string }>).map(page => page.title),
      ['first', 'second']
    );
    assert.equal((db.prepare('SELECT COUNT(*) value FROM notebooks').get() as { value: number }).value, 2);
    db.close();

    fs.rmSync(firstFile);
    const second = await syncOneNoteCache({ dbPath, parseBibleRefs:false });
    assert.equal(second.deletedPagesMarked, 1);
    db = openCacheDb(dbPath);
    assert.deepEqual(
      (db.prepare('SELECT title FROM pages WHERE deleted_at IS NULL ORDER BY title').all() as Array<{ title: string }>).map(page => page.title),
      ['second']
    );
    assert.equal((db.prepare('SELECT COUNT(*) value FROM notebooks').get() as { value: number }).value, 2);
    db.close();
  } finally {
    if (previousSources == null) delete process.env.BIBLENOTE_DATA_SOURCES;
    else process.env.BIBLENOTE_DATA_SOURCES = previousSources;
    fs.rmSync(directory, { recursive:true, force:true });
  }
});

test('folder sync logs every .doc file when Word COM is unavailable and continues', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'biblenote-folder-doc-log-'));
  const dbPath = path.join(directory, 'cache.sqlite');
  const notesPath = path.join(directory, 'notes');
  fs.mkdirSync(notesPath, { recursive:true });
  const firstDocPath = path.join(notesPath, 'first.doc');
  const secondDocPath = path.join(notesPath, 'second.doc');
  fs.writeFileSync(firstDocPath, 'legacy placeholder', 'utf8');
  fs.writeFileSync(secondDocPath, 'legacy placeholder', 'utf8');

  const previousSource = process.env.ONENOTE_DATA_SOURCE;
  const previousFolders = process.env.ONENOTE_FOLDER_PATHS;
  process.env.ONENOTE_DATA_SOURCE = 'folder';
  process.env.ONENOTE_FOLDER_PATHS = Buffer.from(JSON.stringify([notesPath]), 'utf8').toString('base64url');
  configureRuntimeLogging(directory);
  try {
    let conversionAttempts = 0;
    const result = await syncOneNoteCache({
      dbPath,
      parseBibleRefs:false,
      legacyDocConverter:async () => {
        conversionAttempts += 1;
        throw new WordComUnavailableError('Microsoft Word COM is unavailable for this test.');
      }
    });

    assert.equal(result.pages, 2);
    assert.equal(result.contentDownloaded, 0);
    assert.equal(result.contentErrors, 2);
    assert.equal(conversionAttempts, 1);

    const entries = fs.readFileSync(path.join(directory, 'extended.log'), 'utf8')
      .trim()
      .split('\n')
      .map(line => JSON.parse(line));
    const warnings = entries.filter(entry => entry.message === 'Legacy .doc file found, but Microsoft Word COM is unavailable');
    assert.equal(warnings.length, 2);
    assert.deepEqual(new Set(warnings.map(entry => entry.details.path)), new Set([firstDocPath, secondDocPath]));
    assert.ok(warnings.every(entry => entry.level === 'warning'));
  } finally {
    if (previousSource == null) delete process.env.ONENOTE_DATA_SOURCE;
    else process.env.ONENOTE_DATA_SOURCE = previousSource;
    if (previousFolders == null) delete process.env.ONENOTE_FOLDER_PATHS;
    else process.env.ONENOTE_FOLDER_PATHS = previousFolders;
    fs.rmSync(directory, { recursive:true, force:true, maxRetries:5, retryDelay:50 });
  }
});

test('folder sync sends extracted structural HTML to BibleNote parser', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'biblenote-folder-parse-'));
  const dbPath = path.join(directory, 'cache.sqlite');
  const notesPath = path.join(directory, 'notes');
  fs.mkdirSync(notesPath, { recursive:true });
  fs.writeFileSync(path.join(notesPath, 'outline.txt'), 'Ин 1:1\n  пояснение Ин 1:2\nИн 1:3', 'utf8');

  const requests: Array<Record<string, unknown>> = [];
  const server = http.createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>;
    requests.push(body);
    response.writeHead(200, { 'Content-Type':'application/json' });
    response.end(JSON.stringify({
      pageId:body.pageId,
      module:body.module,
      html:body.html,
      paragraphs:[{
        index:0,
        text:'Ин 1:1',
        references:[{
          originalText:'Ин 1:1', normalized:'Иоанна 1:1', bookIndex:43,
          chapter:1, verse:1, topChapter:1, topVerse:1
        }]
      }],
      relations:[],
      relationsCapped:false
    }));
  });

  const previousSource = process.env.ONENOTE_DATA_SOURCE;
  const previousFolders = process.env.ONENOTE_FOLDER_PATHS;
  process.env.ONENOTE_DATA_SOURCE = 'folder';
  process.env.ONENOTE_FOLDER_PATHS = Buffer.from(JSON.stringify([notesPath]), 'utf8').toString('base64url');
  try {
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    assert.ok(address && typeof address === 'object');
    const result = await syncOneNoteCache({
      dbPath,
      parseBibleRefs:true,
      bibleNoteApiUrl:`http://127.0.0.1:${address.port}`
    });

    assert.equal(result.bibleRefsPagesParsed, 1);
    assert.equal(result.bibleRefsRecognized, 1);
    assert.equal(requests.length, 1);
    assert.equal(requests[0].text, undefined);
    assert.equal(requests[0].updateHtml, true);
    assert.match(String(requests[0].html), /<li><p>Ин 1:1<\/p><ul><li><p>пояснение Ин 1:2/);
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    if (previousSource == null) delete process.env.ONENOTE_DATA_SOURCE;
    else process.env.ONENOTE_DATA_SOURCE = previousSource;
    if (previousFolders == null) delete process.env.ONENOTE_FOLDER_PATHS;
    else process.env.ONENOTE_FOLDER_PATHS = previousFolders;
    fs.rmSync(directory, { recursive:true, force:true, maxRetries:5, retryDelay:50 });
  }
});
