import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import Database from 'better-sqlite3';
import {
  analyzeMyBibleModule,
  compareMyBibleModules,
  createMyBibleAnalysisReport
} from '../src/mybible-analyzer.js';
import { parseMyBibleAnalyzerArgs } from '../src/mybible-analyzer-cli.js';

type BibleVerse = {
  book: number;
  chapter: number;
  verse: number;
  text: string;
};

function makeTemporaryDirectory(t: test.TestContext): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'biblenote-mybible-analyzer-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}

function createBibleModule(filePath: string, verses: BibleVerse[]): void {
  const db = new Database(filePath);
  try {
    db.exec(`
      CREATE TABLE info(name TEXT, value TEXT);
      CREATE TABLE books(
        book_number NUMERIC,
        book_color TEXT,
        short_name TEXT,
        long_name TEXT,
        sorting_order NUMERIC
      );
      CREATE TABLE verses(
        book_number NUMERIC,
        chapter NUMERIC,
        verse NUMERIC,
        text TEXT
      );
    `);
    const insertInfo = db.prepare('INSERT INTO info(name, value) VALUES (?, ?)');
    insertInfo.run('description', 'Analyzer fixture');
    insertInfo.run('language', 'en');
    insertInfo.run('russian_numbering', 'false');
    insertInfo.run('strong_numbers', 'true');
    db.prepare(`
      INSERT INTO books(book_number, book_color, short_name, long_name, sorting_order)
      VALUES (10, '#cccccc', 'Gen', 'Genesis', 1)
    `).run();
    const insertVerse = db.prepare(`
      INSERT INTO verses(book_number, chapter, verse, text)
      VALUES (@book, @chapter, @verse, @text)
    `);
    for (const verse of verses) insertVerse.run(verse);
  } finally {
    db.close();
  }
}

function createFootnotesModule(filePath: string): void {
  const db = new Database(filePath);
  try {
    db.exec(`
      CREATE TABLE info(name TEXT, value TEXT);
      CREATE TABLE commentaries(
        book_number NUMERIC,
        chapter_number_from NUMERIC,
        verse_number_from NUMERIC,
        chapter_number_to NUMERIC,
        verse_number_to NUMERIC,
        marker TEXT,
        text TEXT
      );
      INSERT INTO info(name, value) VALUES ('description', 'Fixture footnotes');
      INSERT INTO info(name, value) VALUES ('is_footnotes', 'true');
      INSERT INTO commentaries VALUES (10, 1, 1, 0, 0, '[1]', '<em>Matched</em>');
      INSERT INTO commentaries VALUES (10, 1, 2, 0, 0, '[3]', 'Coordinate mismatch');
      INSERT INTO commentaries VALUES (10, 1, 4, 0, 0, '[9]', '<a href="B:10 1:1">Orphan</a>');
    `);
  } finally {
    db.close();
  }
}

function createCrossReferencesModule(filePath: string): void {
  const db = new Database(filePath);
  try {
    db.exec(`
      CREATE TABLE info(name TEXT, value TEXT);
      CREATE TABLE cross_references(
        book NUMERIC,
        chapter NUMERIC,
        verse NUMERIC,
        verse_end NUMERIC,
        book_to NUMERIC,
        chapter_to NUMERIC,
        verse_to_start NUMERIC,
        verse_to_end NUMERIC,
        votes NUMERIC
      );
      INSERT INTO info(name, value) VALUES ('requires_reverse_processing', 'true');
      INSERT INTO cross_references VALUES (10, 1, 1, 0, 10, 1, 4, 0, 1);
      INSERT INTO cross_references VALUES (10, 1, 1, 0, 10, 1, 99, 0, 0);
    `);
  } finally {
    db.close();
  }
}

test('analyzes MyBible structure and companions without returning copyrighted bodies', t => {
  const directory = makeTemporaryDirectory(t);
  const biblePath = path.join(directory, 'Sample.SQLite3');
  const footnotesPath = path.join(directory, 'Sample.commentaries.SQLite3');
  const crossReferencesPath = path.join(directory, 'Sample.crossreferences.SQLite3');
  createBibleModule(biblePath, [
    {
      book: 10,
      chapter: 1,
      verse: 1,
      text: '<pb/>In the beginning<S>7225</S><f>[1]</f><f>[2]</f><f>[3]</f>'
    },
    { book: 10, chapter: 1, verse: 2, text: '' },
    { book: 10, chapter: 1, verse: 4, text: '<x>Unknown extension</x>' }
  ]);
  createFootnotesModule(footnotesPath);
  createCrossReferencesModule(crossReferencesPath);

  const before = fs.statSync(biblePath);
  const analysis = analyzeMyBibleModule({ biblePath, crossReferencesPath });
  const after = fs.statSync(biblePath);

  assert.equal(analysis.structure.books, 1);
  assert.equal(analysis.structure.chapters, 1);
  assert.equal(analysis.structure.verseRows, 3);
  assert.equal(analysis.structure.emptyVerseRows, 1);
  assert.deepEqual(analysis.structure.bookDetails[0].chapters[0].missingVerses, [3]);
  assert.deepEqual(analysis.structure.unknownBookNumbers, []);
  assert.deepEqual(
    Object.fromEntries(analysis.markup.knownTags.map(tag => [tag.tag, tag.occurrences])),
    { f: 3, pb: 1, S: 1 }
  );
  assert.deepEqual(analysis.markup.unknownTags, [{ tag: 'x', occurrences: 1, verseRows: 1 }]);
  assert.equal(analysis.companions.footnotes?.records, 3);
  assert.equal(analysis.companions.footnotes?.matchedExactly, 1);
  assert.equal(analysis.companions.footnotes?.matchedByMarkerAtDifferentCoordinate, 1);
  assert.deepEqual(analysis.companions.footnotes?.coordinateMismatchExamples, [{
    marker: '[3]',
    verseLocation: '10 1:1',
    footnoteLocation: '10 1:2'
  }]);
  assert.equal(analysis.companions.footnotes?.verseMarkersWithoutFootnote, 1);
  assert.equal(analysis.companions.footnotes?.footnotesWithoutVerseMarker, 1);
  assert.equal(analysis.companions.footnotes?.bibleLinks, 1);
  assert.equal(analysis.companions.crossReferences?.records, 2);
  assert.equal(analysis.companions.crossReferences?.requiresReverseProcessing, true);
  assert.equal(analysis.companions.crossReferences?.sourceLocationsMissingFromBible, 0);
  assert.equal(analysis.companions.crossReferences?.targetLocationsMissingFromBible, 1);
  assert.equal(after.size, before.size);
  assert.equal(after.mtimeMs, before.mtimeMs);

  const serialized = JSON.stringify(analysis);
  assert.equal(serialized.includes('In the beginning'), false);
  assert.equal(serialized.includes('Matched'), false);
  assert.equal(serialized.includes('Unknown extension'), false);
});

test('reports cross-nested MyBible markup as a review location', t => {
  const directory = makeTemporaryDirectory(t);
  const biblePath = path.join(directory, 'CrossNested.SQLite3');
  createBibleModule(biblePath, [
    { book: 10, chapter: 1, verse: 1, text: '<J><t>Text</J></t>' }
  ]);

  const analysis = analyzeMyBibleModule({ biblePath, commentariesPath: null });

  assert.equal(analysis.markup.malformedVerseRows, 1);
  assert.deepEqual(analysis.markup.malformedExamples, ['10 1:1']);
  assert.equal(analysis.issues.some(issue => issue.code === 'malformed-verse-markup'), true);
});

test('compresses ordinal coordinate shifts into structural mapping candidates', t => {
  const directory = makeTemporaryDirectory(t);
  const referencePath = path.join(directory, 'Reference.SQLite3');
  const modulePath = path.join(directory, 'Shifted.SQLite3');
  createBibleModule(referencePath, [
    { book: 10, chapter: 1, verse: 1, text: 'One' },
    { book: 10, chapter: 1, verse: 2, text: 'Two' },
    { book: 10, chapter: 1, verse: 3, text: 'Three' }
  ]);
  createBibleModule(modulePath, [
    { book: 10, chapter: 1, verse: 1, text: 'One' },
    { book: 10, chapter: 2, verse: 1, text: 'Two' },
    { book: 10, chapter: 2, verse: 2, text: 'Three' }
  ]);

  const comparison = compareMyBibleModules(referencePath, modulePath);

  assert.equal(comparison.booksWithStructuralDifferences, 1);
  assert.equal(comparison.mappingCandidateRuns, 1);
  assert.deepEqual(comparison.bookDifferences[0].alignmentHints, [{
    referenceStart: '10 1:2',
    referenceEnd: '10 1:3',
    moduleStart: '10 2:1',
    moduleEnd: '10 2:2',
    rows: 2,
    chapterDelta: 1,
    verseDelta: -1
  }]);

  const report = createMyBibleAnalysisReport({ biblePath: modulePath, compareBiblePath: referencePath });
  assert.equal(report.reportVersion, 1);
  assert.equal(report.comparison?.reference.fileName, 'Reference.SQLite3');
  assert.equal(report.comparison?.module.fileName, 'Shifted.SQLite3');
});

test('parses analyzer CLI arguments including explicit companion opt-out', () => {
  assert.deepEqual(parseMyBibleAnalyzerArgs([
    '--bible', 'Bible.SQLite3',
    '--no-commentaries',
    '--cross-references', 'Bible.crossreferences.SQLite3',
    '--compare', 'KJV.SQLite3',
    '--output', 'report.json'
  ]), {
    biblePath: 'Bible.SQLite3',
    commentariesPath: null,
    crossReferencesPath: 'Bible.crossreferences.SQLite3',
    compareBiblePath: 'KJV.SQLite3',
    outputPath: 'report.json',
    autoDiscoverCommentaries: false,
    help: false
  });
});
