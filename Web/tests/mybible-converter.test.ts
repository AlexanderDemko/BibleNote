import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { type TestContext } from 'node:test';
import Database from 'better-sqlite3';
import JSZip from 'jszip';
import { convertMyBibleModule } from '../src/mybible-converter.js';
import { parseMyBibleConverterArgs } from '../src/mybible-converter-cli.js';

function temporaryDirectory(t: TestContext): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'biblenote-mybible-converter-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}

function createBible(filePath: string): void {
  const db = new Database(filePath);
  try {
    db.exec(`
      CREATE TABLE info(name TEXT, value TEXT);
      CREATE TABLE books(book_number NUMERIC, short_name TEXT, long_name TEXT, book_color TEXT);
      CREATE TABLE verses(book_number NUMERIC, chapter NUMERIC, verse NUMERIC, text TEXT);
      INSERT INTO info VALUES ('description', 'Converted fixture');
      INSERT INTO info VALUES ('language', 'en');
      INSERT INTO info VALUES ('detailed_info', '<b>Fixture rights</b>');
      INSERT INTO books VALUES (10, 'Gn', 'Genesis fixture', '#ffffff');
      INSERT INTO verses VALUES (10, 1, 1, 'Before <i>italic</i> <S>123</S><f>[a]</f><pb/>after');
      INSERT INTO verses VALUES (10, 1, 2, '<i>broken <J>nested</i> words</J>');
    `);
  } finally {
    db.close();
  }
}

function createFootnotes(filePath: string): void {
  const db = new Database(filePath);
  try {
    db.exec(`
      CREATE TABLE info(name TEXT, value TEXT);
      CREATE TABLE commentaries(
        book_number NUMERIC, chapter_number_from NUMERIC, verse_number_from NUMERIC,
        chapter_number_to NUMERIC, verse_number_to NUMERIC, marker TEXT, text TEXT
      );
      INSERT INTO info VALUES ('is_footnotes', 'true');
      INSERT INTO commentaries VALUES (10, 1, 1, 0, 0, '[a]', '<b>Footnote body</b>');
    `);
  } finally {
    db.close();
  }
}

test('converts MyBible text, formatting, footnotes, aliases, and direct mappings to BNM', async t => {
  const directory = temporaryDirectory(t);
  const biblePath = path.join(directory, 'Fixture.SQLite3');
  const footnotesPath = path.join(directory, 'Fixture.commentaries.SQLite3');
  const directMappingsPath = path.join(directory, 'direct.xml');
  const outputPath = path.join(directory, 'fixture.bnm');
  createBible(biblePath);
  createFootnotes(footnotesPath);
  fs.writeFileSync(directMappingsPath, `<BibleDirectVerseMappings ReferenceModule="kjv" SchemaVersion="1" VerseIdRegistry="bnverse:v1">
  <BookMappings BookIndex="1"><Mapping ReferenceChapter="1" ReferenceVerse="1" ModuleChapter="1" ModuleVerse="1" /></BookMappings>
</BibleDirectVerseMappings>\n`);

  const summary = await convertMyBibleModule({
    biblePath,
    footnotesPath,
    directMappingsPath,
    referenceManifestPath: path.resolve('..', 'Api', 'Modules', 'rst', 'manifest.xml'),
    outputPath,
    shortName: 'fixture'
  });

  assert.equal(summary.books, 1);
  assert.equal(summary.verses, 2);
  assert.equal(summary.footnotesEmbedded, 1);
  assert.equal(summary.footnoteMarkersUnresolved, 0);
  assert.equal(summary.strongMarkerOccurrences, 1);
  assert.equal(summary.malformedMarkupRowsRecovered, 1);
  assert.equal(summary.directMappingsEmbedded, true);
  assert.equal(summary.mappingStatus, 'verse-id-mapped');

  const zip = await JSZip.loadAsync(fs.readFileSync(outputPath));
  const manifest = await zip.file('manifest.xml')?.async('string');
  const bible = await zip.file('bible.xml')?.async('string');
  const report = JSON.parse(await zip.file('conversion-report.json')!.async('string')) as { source: { fileName: string } };
  assert.match(manifest ?? '', /ShortName="fixture"/);
  assert.match(manifest ?? '', /Name="Genesis fixture"/);
  assert.match(manifest ?? '', /<Abbreviation>Gn<\/Abbreviation>/);
  assert.equal((manifest?.match(/<BibleBook\b/g) ?? []).length, 1);
  assert.match(manifest ?? '', /<BibleDirectVerseMappings ReferenceModule="kjv"/);
  assert.match(manifest ?? '', /VerseIdRegistry="bnverse:v1"/);
  assert.match(manifest ?? '', /<BibleTranslationDifferences \/>/);
  assert.doesNotMatch(manifest ?? '', /BaseVerses=/);
  assert.match(bible ?? '', /<STYLE fs="italic">italic<\/STYLE>/);
  assert.match(bible ?? '', /<NOTE type="x-studynote" ex="\[a\]">/);
  assert.match(bible ?? '', /<NOTE[^>]*>Footnote body<\/NOTE>/);
  assert.match(bible ?? '', /<BR art="x-p" \/>/);
  assert.doesNotMatch(bible ?? '', />123</);
  assert.equal(report.source.fileName, 'Fixture.SQLite3');
});

test('resolves range footnotes with repeated markers and preserves exact-coordinate precedence', async t => {
  const directory = temporaryDirectory(t);
  const biblePath = path.join(directory, 'Fixture.SQLite3');
  const footnotesPath = path.join(directory, 'Fixture.commentaries.SQLite3');
  const outputPath = path.join(directory, 'fixture.bnm');
  createBible(biblePath);
  createFootnotes(footnotesPath);
  const bibleDb = new Database(biblePath);
  bibleDb.exec(`DELETE FROM verses;
    INSERT INTO verses VALUES (10, 1, 16, 'Range end<f>[a]</f>');
    INSERT INTO verses VALUES (10, 2, 1, 'Cross chapter range end<f>[a]</f>');
    INSERT INTO verses VALUES (10, 2, 2, 'Exact override<f>[a]</f>');`);
  bibleDb.close();
  const notesDb = new Database(footnotesPath);
  notesDb.exec(`DELETE FROM commentaries;
    INSERT INTO commentaries VALUES (10, 1, 15, 1, 16, '[a]', 'First range body');
    INSERT INTO commentaries VALUES (10, 1, 17, 2, 2, '[a]', 'Cross chapter body');
    INSERT INTO commentaries VALUES (10, 2, 2, 0, 0, '[a]', 'Exact body');`);
  notesDb.close();

  const summary = await convertMyBibleModule({
    biblePath, footnotesPath, outputPath, shortName: 'fixture',
    referenceManifestPath: path.resolve('..', 'Api', 'Modules', 'rst', 'manifest.xml'),
    allowUnmappedPreview: true, requireResolvedFootnotes: true
  });
  assert.equal(summary.footnotesEmbedded, 3);
  assert.equal(summary.footnoteMarkersUnresolved, 0);
  const zip = await JSZip.loadAsync(fs.readFileSync(outputPath));
  const bible = await zip.file('bible.xml')!.async('string');
  assert.match(bible, /Range end<NOTE[^>]*>First range body<\/NOTE>/);
  assert.match(bible, /Cross chapter range end<NOTE[^>]*>Cross chapter body<\/NOTE>/);
  assert.match(bible, /Exact override<NOTE[^>]*>Exact body<\/NOTE>/);

  const ambiguousDb = new Database(footnotesPath);
  ambiguousDb.exec(`INSERT INTO commentaries VALUES (10, 1, 14, 1, 16, '[a]', 'Conflicting body');`);
  ambiguousDb.close();
  await assert.rejects(convertMyBibleModule({
    biblePath, footnotesPath, outputPath: path.join(directory, 'ambiguous.bnm'), shortName: 'fixture',
    referenceManifestPath: path.resolve('..', 'Api', 'Modules', 'rst', 'manifest.xml'),
    allowUnmappedPreview: true, requireResolvedFootnotes: true
  }), /Не найдены тексты для 1 из 3 маркеров сносок/);
});

test('preserves unmarked, duplicate-marker and zero-start range notes without moving inline notes', async t => {
  const directory = temporaryDirectory(t);
  const biblePath = path.join(directory, 'Fixture.SQLite3');
  const footnotesPath = path.join(directory, 'Fixture.commentaries.SQLite3');
  createBible(biblePath);
  createFootnotes(footnotesPath);
  const db = new Database(footnotesPath);
  db.exec(`INSERT INTO commentaries VALUES (10, 1, 1, 0, 0, '[#]', 'First cross reference');
    INSERT INTO commentaries VALUES (10, 1, 1, 0, 0, '[#]', 'Second cross reference');
    INSERT INTO commentaries VALUES (10, 1, 0, 1, 2, '[intro]', 'Greek ἐνέργεια; Hebrew אֱלֹהִים');`);
  db.close();
  const summary = await convertMyBibleModule({
    biblePath, footnotesPath, outputPath: path.join(directory, 'all.bnm'), shortName: 'fixture',
    referenceManifestPath: path.resolve('..', 'Api', 'Modules', 'rst', 'manifest.xml'),
    allowUnmappedPreview: true, requireResolvedFootnotes: true, preserveAllFootnotes: true
  });
  assert.equal(summary.footnotesEmbedded, 4);
  assert.equal(summary.footnoteRecordsSource, 4);
  assert.equal(summary.footnoteRecordsPreserved, 4);
  assert.equal(summary.unmarkedFootnotesEmbedded, 3);
  const zip = await JSZip.loadAsync(fs.readFileSync(summary.outputPath));
  const bible = await zip.file('bible.xml')!.async('string');
  assert.match(bible, /italic<\/STYLE><!\[CDATA\[ \]\]><NOTE[^>]*ex="\[a\]"/);
  assert.match(bible, /after<NOTE[^>]*>First cross reference<\/NOTE><NOTE[^>]*>Second cross reference<\/NOTE>/);
  assert.match(bible, /vnumber="2"[^\n]*<NOTE[^>]*>Greek ἐνέργεια; Hebrew אֱלֹהִים<\/NOTE>/);
  assert.equal(JSON.parse(await zip.file('footnotes-source.json')!.async('string')).notes.length, 4);
});

test('keeps notes and breaks outside style elements and preserves mixed note text order', async t => {
  const directory = temporaryDirectory(t);
  const biblePath = path.join(directory, 'Fixture.SQLite3');
  const footnotesPath = path.join(directory, 'Fixture.commentaries.SQLite3');
  createBible(biblePath);
  createFootnotes(footnotesPath);
  const db = new Database(biblePath);
  db.prepare('UPDATE verses SET text=? WHERE verse=1').run('<t>Before <i>word<f>[a]</f><br/> after</i> end</t>');
  db.close();
  const notes = new Database(footnotesPath);
  notes.prepare('UPDATE commentaries SET text=?').run('Start <i>אֱלֹהִים</i> middle <b>ἐνέργεια</b> end');
  notes.close();
  const summary = await convertMyBibleModule({
    biblePath, footnotesPath, outputPath: path.join(directory, 'styled.bnm'), shortName: 'fixture',
    referenceManifestPath: path.resolve('..', 'Api', 'Modules', 'rst', 'manifest.xml'), allowUnmappedPreview: true
  });
  const zip = await JSZip.loadAsync(fs.readFileSync(summary.outputPath));
  const bible = await zip.file('bible.xml')!.async('string');
  assert.match(bible, /word<\/STYLE><\/STYLE><NOTE[^>]*>Start אֱלֹהִים middle ἐνέργεια end<\/NOTE><STYLE/);
  assert.match(bible, /<\/STYLE><\/STYLE><BR art="x-nl" \/><STYLE/);
});

test('recovers truncated MyBible paragraph tags instead of displaying them as text', async t => {
  const directory = temporaryDirectory(t);
  const biblePath = path.join(directory, 'Fixture.SQLite3');
  createBible(biblePath);
  const db = new Database(biblePath);
  db.prepare('UPDATE verses SET text=? WHERE verse=1').run('Verse text. <p');
  db.close();
  const summary = await convertMyBibleModule({
    biblePath, footnotesPath: false, outputPath: path.join(directory, 'recovered.bnm'), shortName: 'fixture',
    referenceManifestPath: path.resolve('..', 'Api', 'Modules', 'rst', 'manifest.xml'), allowUnmappedPreview: true
  });
  const zip = await JSZip.loadAsync(fs.readFileSync(summary.outputPath));
  const bible = await zip.file('bible.xml')!.async('string');
  assert.match(bible, /<VERS vnumber="1">Verse text\.<\/VERS>/);
  assert.doesNotMatch(bible, /&lt;p/);
});

test('preserves an existing BNM before forced replacement', async t => {
  const directory = temporaryDirectory(t);
  const biblePath = path.join(directory, 'Fixture.SQLite3');
  const outputPath = path.join(directory, 'fixture.bnm');
  createBible(biblePath);
  const options = {
    biblePath,
    footnotesPath: false as const,
    referenceManifestPath: path.resolve('..', 'Api', 'Modules', 'rst', 'manifest.xml'),
    outputPath,
    shortName: 'fixture',
    allowUnmappedPreview:true
  };
  await assert.rejects(
    convertMyBibleModule({ ...options, allowUnmappedPreview:false }),
    /neutral VerseId direct-mappings file is required/
  );
  await convertMyBibleModule(options);
  await assert.rejects(convertMyBibleModule(options), /already exists/);
  const replaced = await convertMyBibleModule({ ...options, force: true });
  assert.ok(replaced.backupPath);
  assert.equal(fs.existsSync(replaced.backupPath), true);
});

test('strict conversion refuses to create a BNM when footnote texts are unresolved', async t => {
  const directory = temporaryDirectory(t);
  const biblePath = path.join(directory, 'Fixture.SQLite3');
  const outputPath = path.join(directory, 'fixture.bnm');
  createBible(biblePath);

  await assert.rejects(
    convertMyBibleModule({
      biblePath,
      footnotesPath: false,
      requireResolvedFootnotes: true,
      referenceManifestPath: path.resolve('..', 'Api', 'Modules', 'rst', 'manifest.xml'),
      outputPath,
      shortName: 'fixture',
      allowUnmappedPreview: true
    }),
    /Не найдены тексты для 1 из 1 маркеров сносок/
  );
  assert.equal(fs.existsSync(outputPath), false);
});

test('parses converter arguments', () => {
  assert.deepEqual(parseMyBibleConverterArgs([
    '--bible', 'NRT.SQLite3', '--short-name', 'nrt', '--reference-manifest', 'rst-manifest.xml',
    '--direct-mappings', 'direct.xml', '--coordinate-reference-module', 'kjv',
    '--verse-id-registry', 'bnverse:v1',
    '--no-footnotes', '-o', 'nrt.bnm', '--force'
  ]), {
    biblePath: 'NRT.SQLite3',
    shortName: 'nrt',
    referenceManifestPath: 'rst-manifest.xml',
    directMappingsPath: 'direct.xml',
    coordinateReferenceModule: 'kjv',
    verseIdRegistry: 'bnverse:v1',
    allowUnmappedPreview: false,
    footnotesPath: false,
    outputPath: 'nrt.bnm',
    force: true,
    help: false
  });
});
