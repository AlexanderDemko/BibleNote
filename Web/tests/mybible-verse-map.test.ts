import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { type TestContext } from 'node:test';
import Database from 'better-sqlite3';
import JSZip from 'jszip';
import {
  createVerseMapDraft,
  validateVerseMapDocument,
  type VerseMapDocument
} from '../src/mybible-verse-map.js';
import { parseVerseMapArgs } from '../src/mybible-verse-map-cli.js';

type FixtureVerse = { chapter: number; verse: number; text: string };

function temporaryDirectory(t: TestContext): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'biblenote-verse-map-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}

function zefaniaXml(verses: FixtureVerse[]): string {
  const chapters = new Map<number, FixtureVerse[]>();
  for (const verse of verses) chapters.set(verse.chapter, [...(chapters.get(verse.chapter) ?? []), verse]);
  return `<?xml version="1.0"?>
<XMLBIBLE>
  <INFORMATION><title>Reference fixture</title></INFORMATION>
  <BIBLEBOOK bnumber="1">
    ${[...chapters.entries()].map(([chapter, chapterVerses]) => `
    <CHAPTER cnumber="${chapter}">
      ${chapterVerses.map(verse => `<VERS vnumber="${verse.verse}">${verse.text}</VERS>`).join('\n      ')}
    </CHAPTER>`).join('')}
  </BIBLEBOOK>
</XMLBIBLE>`;
}

function createMyBibleModule(filePath: string, verses: FixtureVerse[]): void {
  const db = new Database(filePath);
  try {
    db.exec(`
      CREATE TABLE info(name TEXT, value TEXT);
      CREATE TABLE books(book_number NUMERIC, short_name TEXT, long_name TEXT, sorting_order NUMERIC);
      CREATE TABLE verses(book_number NUMERIC, chapter NUMERIC, verse NUMERIC, text TEXT);
      INSERT INTO info(name, value) VALUES ('description', 'Mapped fixture');
      INSERT INTO books(book_number, short_name, long_name, sorting_order) VALUES (10, 'Gen', 'Genesis', 1);
    `);
    const insert = db.prepare(`
      INSERT INTO verses(book_number, chapter, verse, text)
      VALUES (10, @chapter, @verse, @text)
    `);
    for (const verse of verses) insert.run(verse);
  } finally {
    db.close();
  }
}

async function createBnm(filePath: string, xml: string): Promise<void> {
  const zip = new JSZip();
  zip.file('bible.xml', xml);
  zip.file('manifest.xml', '<BibleNoteModule ShortName="fixture" />');
  fs.writeFileSync(filePath, await zip.generateAsync({ type: 'nodebuffer' }));
}

function confirmAll(document: VerseMapDocument): void {
  for (const group of document.reviewGroups) group.status = 'confirmed';
}

test('creates an explicit complete map with exact merged and renumbered verses', async t => {
  const directory = temporaryDirectory(t);
  const referencePath = path.join(directory, 'reference.bnm');
  const modulePath = path.join(directory, 'module.SQLite3');
  await createBnm(referencePath, zefaniaXml([
    { chapter: 1, verse: 1, text: 'Alpha has enough unique text for matching.' },
    { chapter: 1, verse: 2, text: 'Beta has enough unique text for matching.' },
    { chapter: 1, verse: 3, text: 'Gamma has enough unique text for matching.' },
    { chapter: 1, verse: 4, text: 'Delta has enough unique text for matching.' }
  ]));
  createMyBibleModule(modulePath, [
    { chapter: 1, verse: 1, text: 'Alpha has enough unique text for matching.' },
    {
      chapter: 1,
      verse: 2,
      text: '<pb/>Beta has enough unique text for matching. Gamma has enough unique text for matching.'
    },
    { chapter: 1, verse: 3, text: 'Delta has enough unique text for matching.<S>123</S>' }
  ]);

  const document = await createVerseMapDraft({ referencePath, modulePath });

  assert.equal(document.reference.kind, 'biblenote-bnm');
  assert.equal(document.module.kind, 'mybible-sqlite');
  assert.equal(document.entries.length, 3);
  assert.equal(document.reviewGroups.length, 3);
  assert.equal(document.reviewGroups.filter(group => group.status === 'confirmed').length, 1);
  assert.equal(document.reviewGroups.filter(group => group.status === 'candidate').length, 2);
  assert.equal(document.reviewGroups.find(group => group.status === 'confirmed')?.autoConfirmed, true);
  assert.equal(document.validation.candidateAndConfirmed.isCompleteAndConsistent, true);
  assert.equal(document.validation.candidateAndConfirmed.referenceCoverage.percent, 100);
  assert.equal(document.validation.candidateAndConfirmed.moduleCoverage.percent, 100);
  assert.equal(document.validation.candidateAndConfirmed.manyToOneEntries, 1);
  assert.equal(document.validation.confirmedOnly.referenceCoverage.percent, 25);

  const merged = document.entries.find(entry => entry.kind === 'merged-in-module');
  assert.deepEqual(merged?.reference.map(location => location.verse), [2, 3]);
  assert.deepEqual(merged?.module.map(location => location.verse), [2]);
  assert.deepEqual(merged?.evidence, ['exact-concatenated-text']);
  const renumbered = document.entries.find(entry => entry.kind === 'renumbered');
  assert.equal(renumbered?.reference[0].verse, 4);
  assert.equal(renumbered?.module[0].verse, 3);
  assert.equal(renumbered?.confidence, 'high');

  confirmAll(document);
  const confirmed = await validateVerseMapDocument(document);
  assert.equal(confirmed.confirmedOnly.isCompleteAndConsistent, true);
  assert.equal(confirmed.confirmedOnly.roundTripFailures, 0);
  assert.equal(confirmed.confirmedOnly.reverseOrderTransitions, 0);
});

test('groups an empty MyBible placeholder with the preceding correspondence', async t => {
  const directory = temporaryDirectory(t);
  const referencePath = path.join(directory, 'reference.xml');
  const modulePath = path.join(directory, 'module.SQLite3');
  fs.writeFileSync(referencePath, zefaniaXml([
    { chapter: 1, verse: 1, text: 'First sufficiently long verse text.' },
    { chapter: 1, verse: 2, text: 'Second sufficiently long verse text.' }
  ]));
  createMyBibleModule(modulePath, [
    { chapter: 1, verse: 1, text: 'First sufficiently long verse text.' },
    { chapter: 1, verse: 2, text: '' }
  ]);

  const document = await createVerseMapDraft({ referencePath, modulePath });

  assert.equal(document.entries.length, 1);
  assert.equal(document.entries[0].kind, 'empty-placeholder-group');
    assert.deepEqual(document.entries[0].reference.map(location => location.verse), [1, 2]);
    assert.deepEqual(document.entries[0].module.map(location => location.verse), [1, 2]);
    assert.equal(document.reviewGroups[0].status, 'confirmed');
    assert.equal(document.reviewGroups[0].autoConfirmed, true);
    assert.equal(document.validation.candidateAndConfirmed.emptyPlaceholderEntries, 1);
    assert.equal(document.validation.candidateAndConfirmed.isCompleteAndConsistent, true);
    assert.equal(document.validation.confirmedOnly.isCompleteAndConsistent, true);
  });

test('automatically maps a MyBible row that declares a merged verse range', async t => {
  const directory = temporaryDirectory(t);
  const referencePath = path.join(directory, 'reference.xml');
  const modulePath = path.join(directory, 'module.SQLite3');
  fs.writeFileSync(referencePath, zefaniaXml([
    { chapter: 3, verse: 9, text: 'Reference translation verse nine.' },
    { chapter: 3, verse: 10, text: 'Reference translation verse ten.' }
  ]));
  createMyBibleModule(modulePath, [
    { chapter: 3, verse: 9, text: '<n>[9-10]</n> Different translation combines both verses.' }
  ]);

  const document = await createVerseMapDraft({ referencePath, modulePath });

  assert.equal(document.entries.length, 1);
  assert.equal(document.entries[0].kind, 'merged-in-module');
  assert.deepEqual(document.entries[0].reference.map(location => location.verse), [9, 10]);
  assert.deepEqual(document.entries[0].module.map(location => location.verse), [9]);
  assert.deepEqual(document.entries[0].evidence, ['declared-verse-range']);
  assert.equal(document.reviewGroups[0].status, 'confirmed');
  assert.equal(document.reviewGroups[0].autoConfirmed, true);
  assert.equal(document.validation.confirmedOnly.isCompleteAndConsistent, true);
});

test('automatically confirms direct coordinates around a local hole', async t => {
  const directory = temporaryDirectory(t);
  const referencePath = path.join(directory, 'reference.xml');
  const modulePath = path.join(directory, 'module.SQLite3');
  fs.writeFileSync(referencePath, zefaniaXml([
    { chapter: 1, verse: 1, text: 'Reference translation one.' },
    { chapter: 1, verse: 2, text: 'Reference translation two.' },
    { chapter: 2, verse: 1, text: 'Reference translation three.' },
    { chapter: 2, verse: 2, text: 'Reference translation four.' }
  ]));
  createMyBibleModule(modulePath, [
    { chapter: 1, verse: 1, text: 'Completely different language A.' },
    { chapter: 1, verse: 2, text: 'Completely different language B.' },
    { chapter: 2, verse: 1, text: 'Completely different language C.' }
  ]);

  const document = await createVerseMapDraft({ referencePath, modulePath });
  const automatic = document.reviewGroups.filter(group => group.autoConfirmed);
  const candidates = document.reviewGroups.filter(group => group.status === 'candidate');

    assert.equal(automatic.length, 1);
    assert.equal(automatic[0].referenceStart, '1 1:1');
    assert.equal(automatic[0].referenceEnd, '1 2:1');
    assert.equal(candidates.every(group => group.bookIndex === 1), true);
    assert.deepEqual(candidates.map(group => group.referenceStart), ['1 2:2']);
    assert.equal(document.validation.confirmedOnly.referenceCoverage.percent, 75);
    assert.equal(document.validation.confirmedOnly.moduleCoverage.percent, 100);
});

test('uses a proven legacy versification run instead of pairing shifted chapter leftovers', async t => {
  const directory = temporaryDirectory(t);
  const referencePath = path.join(directory, 'reference.xml');
  const modulePath = path.join(directory, 'module.SQLite3');
  const manifestPath = path.join(directory, 'manifest.xml');
  fs.writeFileSync(referencePath, zefaniaXml([
    { chapter: 12, verse: 15, text: 'Reference text before the chapter boundary.' },
    { chapter: 13, verse: 1, text: 'Reference shifted verse one.' },
    { chapter: 13, verse: 2, text: 'Reference shifted verse two.' },
    { chapter: 13, verse: 3, text: 'Reference shifted verse three.' }
  ]));
  createMyBibleModule(modulePath, [
    { chapter: 12, verse: 15, text: 'Different translation before the boundary.' },
    { chapter: 12, verse: 16, text: 'Different translation shifted verse one.' },
    { chapter: 13, verse: 1, text: 'Different translation shifted verse two.' },
    { chapter: 13, verse: 2, text: 'Different translation shifted verse three.' }
  ]);
  fs.writeFileSync(manifestPath, `<?xml version="1.0"?>
<BibleNoteModule ShortName="reference">
  <BibleTranslationDifferences>
    <BookDifferences BookIndex="1">
      <Difference BaseVerses="12:16" ParallelVerses="13:1" />
      <Difference BaseVerses="13:1-2" ParallelVerses="13:X+1" />
    </BookDifferences>
  </BibleTranslationDifferences>
</BibleNoteModule>`);

  const document = await createVerseMapDraft({
    referencePath,
    modulePath,
    referenceDifferencesManifestPath: manifestPath
  });

  assert.deepEqual(document.entries.map(entry => ({
    reference: entry.reference.map(location => `${location.chapter}:${location.verse}`),
    module: entry.module.map(location => `${location.chapter}:${location.verse}`),
    evidence: entry.evidence
  })), [
    { reference: ['12:15'], module: ['12:15'], evidence: ['same-coordinate'] },
    { reference: ['13:1'], module: ['12:16'], evidence: ['known-versification'] },
    { reference: ['13:2'], module: ['13:1'], evidence: ['known-versification'] },
    { reference: ['13:3'], module: ['13:2'], evidence: ['known-versification'] }
  ]);
  assert.equal(document.reviewGroups.every(group => group.status === 'confirmed'), true);
  assert.equal(document.validation.confirmedOnly.isCompleteAndConsistent, true);
});

test('leaves unrelated leftovers unmatched instead of zipping them by row order', async t => {
  const directory = temporaryDirectory(t);
  const referencePath = path.join(directory, 'reference.xml');
  const modulePath = path.join(directory, 'module.SQLite3');
  fs.writeFileSync(referencePath, zefaniaXml([
    { chapter: 1, verse: 1, text: 'Reference translation first verse.' },
    { chapter: 1, verse: 2, text: 'Reference translation second verse.' }
  ]));
  createMyBibleModule(modulePath, [
    { chapter: 1, verse: 1, text: 'Different translation first verse.' },
    { chapter: 1, verse: 3, text: 'Different translation unrelated third verse.' }
  ]);

  const document = await createVerseMapDraft({ referencePath, modulePath });

  assert.equal(document.entries.some(entry => entry.evidence.includes('ordinal-alignment')), false);
  assert.equal(document.entries.some(entry => entry.kind === 'renumbered'), false);
  assert.equal(document.entries.some(entry => entry.kind === 'unmatched-reference' && entry.reference[0]?.verse === 2), true);
  assert.equal(document.entries.some(entry => entry.kind === 'unmatched-module' && entry.module[0]?.verse === 3), true);
});

test('two-way validator rejects duplicate assignments and incomplete confirmation', async t => {
  const directory = temporaryDirectory(t);
  const referencePath = path.join(directory, 'reference.xml');
  const modulePath = path.join(directory, 'module.SQLite3');
  fs.writeFileSync(referencePath, zefaniaXml([
    { chapter: 1, verse: 1, text: 'One sufficiently long verse text.' },
    { chapter: 1, verse: 2, text: 'Two sufficiently long verse text.' }
  ]));
  createMyBibleModule(modulePath, [
    { chapter: 1, verse: 1, text: 'One sufficiently long verse text.' },
    { chapter: 1, verse: 2, text: 'Two sufficiently long verse text.' }
  ]);
  const document = await createVerseMapDraft({ referencePath, modulePath });
  document.reviewGroups[0].status = 'confirmed';
  if (document.reviewGroups.length > 1) document.reviewGroups[1].status = 'rejected';
  document.entries.push({ ...document.entries[0], id: 'duplicate-entry' });

  const validation = await validateVerseMapDocument(document);

  assert.ok(validation.confirmedOnly.duplicateReferenceAssignments > 0);
  assert.ok(validation.confirmedOnly.duplicateModuleAssignments > 0);
  assert.equal(validation.confirmedOnly.isCompleteAndConsistent, false);
});

test('requires an explicit review exception for a confirmed non-monotonic passage move', async t => {
  const directory = temporaryDirectory(t);
  const referencePath = path.join(directory, 'reference.xml');
  const modulePath = path.join(directory, 'module.SQLite3');
  fs.writeFileSync(referencePath, zefaniaXml([
    { chapter: 1, verse: 1, text: 'First passage with a long unique body.' },
    { chapter: 1, verse: 2, text: 'Second passage with a long unique body.' },
    { chapter: 2, verse: 1, text: 'Third passage with a long unique body.' }
  ]));
  createMyBibleModule(modulePath, [
    { chapter: 1, verse: 1, text: 'First passage with a long unique body.' },
    { chapter: 1, verse: 2, text: 'Third passage with a long unique body.' },
    { chapter: 2, verse: 1, text: 'Second passage with a long unique body.' }
  ]);
  const document = await createVerseMapDraft({ referencePath, modulePath });
  confirmAll(document);

  const rejected = await validateVerseMapDocument(document);
  assert.equal(rejected.confirmedOnly.reverseOrderTransitions, 1);
  assert.equal(rejected.confirmedOnly.isCompleteAndConsistent, false);

  const movedGroupId = document.entries.find(entry => entry.reference[0]?.verse === 2)?.reviewGroupId;
  const movedGroup = document.reviewGroups.find(group => group.id === movedGroupId);
  assert.ok(movedGroup);
  movedGroup.allowNonMonotonic = true;
  const accepted = await validateVerseMapDocument(document);
  assert.equal(accepted.confirmedOnly.reverseOrderTransitions, 0);
  assert.equal(accepted.confirmedOnly.allowedNonMonotonicTransitions, 1);
  assert.equal(accepted.confirmedOnly.isCompleteAndConsistent, true);
});

test('parses verse-map create and validation arguments', () => {
  assert.deepEqual(parseVerseMapArgs([
    '--validate', 'map.json',
    '--reference', 'rst.bnm',
    '--module', 'RST+.SQLite3',
    '--reference-differences-manifest', 'manifest.xml',
    '--output', 'validation.json'
  ]), {
    validatePath: 'map.json',
    referencePath: 'rst.bnm',
    modulePath: 'RST+.SQLite3',
    referenceDifferencesManifestPath: 'manifest.xml',
    outputPath: 'validation.json',
    help: false
  });
});
