import Database from 'better-sqlite3';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const REPORT_VERSION = 1;
const MAX_EXAMPLES = 100;
const MAX_ALIGNMENT_RUNS = 250;

const knownVerseTags = new Set(['S', 'm', 'i', 'J', 'n', 'e', 't', 'br', 'pb', 'f', 'h']);
const selfClosingVerseTags = new Set(['br', 'pb']);

const myBibleToBibleNoteBookIndex = new Map<number, number>([
  [10, 1], [20, 2], [30, 3], [40, 4], [50, 5], [60, 6], [70, 7], [80, 8],
  [90, 9], [100, 10], [110, 11], [120, 12], [130, 13], [140, 14], [150, 15], [160, 16],
  [190, 17], [220, 18], [230, 19], [240, 20], [250, 21], [260, 22], [290, 23],
  [300, 24], [310, 25], [330, 26], [340, 27], [350, 28], [360, 29], [370, 30],
  [380, 31], [390, 32], [400, 33], [410, 34], [420, 35], [430, 36], [440, 37],
  [450, 38], [460, 39], [470, 40], [480, 41], [490, 42], [500, 43], [510, 44],
  [520, 45], [530, 46], [540, 47], [550, 48], [560, 49], [570, 50], [580, 51],
  [590, 52], [600, 53], [610, 54], [620, 55], [630, 56], [640, 57], [650, 58],
  [660, 59], [670, 60], [680, 61], [690, 62], [700, 63], [710, 64], [720, 65],
  [730, 66]
]);

export function bibleNoteBookIndexFromMyBible(bookNumber: number): number | null {
  return myBibleToBibleNoteBookIndex.get(bookNumber) ?? null;
}

export type MyBibleIssueSeverity = 'info' | 'warning' | 'error';

export type MyBibleIssue = {
  severity: MyBibleIssueSeverity;
  code: string;
  message: string;
  location?: string;
};

export type MyBibleSourceInfo = {
  path: string;
  fileName: string;
  sizeBytes: number;
  sha256: string;
};

export type MyBibleMetadata = {
  abbreviation: string;
  description?: string;
  language?: string;
  russianNumbering?: boolean;
  strongNumbers?: boolean;
  isFootnotes?: boolean;
  origin?: string;
  copyright?: string;
  license?: string;
  detailedInfo?: string;
  htmlStyleDeclared: boolean;
  infoNames: string[];
};

export type MyBibleTableSchema = {
  name: string;
  columns: Array<{
    name: string;
    type: string;
    notNull: boolean;
    primaryKeyPosition: number;
  }>;
};

export type MyBibleChapterAnalysis = {
  chapter: number;
  verseRows: number;
  maxVerse: number;
  emptyVerseRows: number;
  metadataOnlyVerseRows: number;
  missingVerses: number[];
  missingVersesOmitted: number;
};

export type MyBibleBookAnalysis = {
  myBibleBookNumber: number;
  bibleNoteBookIndex: number | null;
  shortName?: string;
  longName?: string;
  sortingOrder?: number;
  chapters: MyBibleChapterAnalysis[];
  chapterCount: number;
  verseRows: number;
  emptyVerseRows: number;
  missingChapters: number[];
  missingChaptersOmitted: number;
};

export type MyBibleMarkupTagAnalysis = {
  tag: string;
  occurrences: number;
  verseRows: number;
};

export type MyBibleMarkupAnalysis = {
  knownTags: MyBibleMarkupTagAnalysis[];
  unknownTags: MyBibleMarkupTagAnalysis[];
  malformedVerseRows: number;
  malformedExamples: string[];
  footnoteMarkerOccurrences: number;
  versesWithFootnoteMarkers: number;
};

export type MyBibleFootnotesAnalysis = {
  source: MyBibleSourceInfo;
  metadata: MyBibleMetadata;
  tables: MyBibleTableSchema[];
  records: number;
  matchedExactly: number;
  matchedAfterWhitespaceNormalization: number;
  matchedByMarkerAtDifferentCoordinate: number;
  verseMarkersWithoutFootnote: number;
  footnotesWithoutVerseMarker: number;
  duplicateFootnoteKeys: number;
  bibleLinks: number;
  htmlTags: Array<{ tag: string; occurrences: number }>;
  coordinateMismatchExamples: Array<{
    marker: string;
    verseLocation: string;
    footnoteLocation: string;
  }>;
  missingFootnoteExamples: string[];
  orphanFootnoteExamples: string[];
};

export type MyBibleCrossReferencesAnalysis = {
  source: MyBibleSourceInfo;
  metadata: MyBibleMetadata;
  tables: MyBibleTableSchema[];
  records: number;
  requiresReverseProcessing: boolean;
  sourceLocationsMissingFromBible: number;
  targetLocationsMissingFromBible: number;
  invalidRanges: number;
  missingSourceExamples: string[];
  missingTargetExamples: string[];
};

export type MyBibleModuleAnalysis = {
  source: MyBibleSourceInfo;
  metadata: MyBibleMetadata;
  tables: MyBibleTableSchema[];
  structure: {
    books: number;
    chapters: number;
    verseRows: number;
    emptyVerseRows: number;
    metadataOnlyVerseRows: number;
    duplicateVerseCoordinates: number;
    nonPositiveCoordinates: number;
    unknownBookNumbers: number[];
    structureFingerprint: string;
    bookDetails: MyBibleBookAnalysis[];
  };
  markup: MyBibleMarkupAnalysis;
  companions: {
    footnotes?: MyBibleFootnotesAnalysis;
    crossReferences?: MyBibleCrossReferencesAnalysis;
  };
  issues: MyBibleIssue[];
};

export type MyBibleAlignmentRun = {
  referenceStart: string;
  referenceEnd: string;
  moduleStart: string;
  moduleEnd: string;
  rows: number;
  chapterDelta: number;
  verseDelta: number;
};

export type MyBibleBookComparison = {
  myBibleBookNumber: number;
  bibleNoteBookIndex: number | null;
  referenceVerseRows: number;
  moduleVerseRows: number;
  verseRowDelta: number;
  referenceChapters: number;
  moduleChapters: number;
  emptyStatusMismatches: number;
  coordinateMismatchRows: number;
  unmatchedOrdinalRows: number;
  chapterDifferences: Array<{
    chapter: number;
    referenceVerseRows: number;
    moduleVerseRows: number;
    referenceMaxVerse: number;
    moduleMaxVerse: number;
  }>;
  alignmentHints: MyBibleAlignmentRun[];
  alignmentHintsOmitted: number;
};

export type MyBibleStructureComparison = {
  reference: Pick<MyBibleSourceInfo, 'fileName' | 'sha256'> & { description?: string };
  module: Pick<MyBibleSourceInfo, 'fileName' | 'sha256'> & { description?: string };
  commonBooks: number;
  booksOnlyInReference: number[];
  booksOnlyInModule: number[];
  booksWithStructuralDifferences: number;
  mappingCandidateRuns: number;
  bookDifferences: MyBibleBookComparison[];
  caveat: string;
};

export type MyBibleAnalysisReport = {
  reportVersion: number;
  generatedAt: string;
  module: MyBibleModuleAnalysis;
  comparison?: MyBibleStructureComparison;
};

export type AnalyzeMyBibleOptions = {
  biblePath: string;
  commentariesPath?: string | null;
  crossReferencesPath?: string | null;
  autoDiscoverCommentaries?: boolean;
  compareBiblePath?: string | null;
};

type VerseCoordinate = {
  book: number;
  chapter: number;
  verse: number;
  empty: boolean;
  metadataOnly: boolean;
};

type VerseMarker = {
  book: number;
  chapter: number;
  verse: number;
  marker: string;
};

type InspectedModule = {
  analysis: MyBibleModuleAnalysis;
  coordinatesByBook: Map<number, VerseCoordinate[]>;
  coordinateKeys: Set<string>;
  verseMarkers: VerseMarker[];
};

type UnknownRow = Record<string, unknown>;

function toNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function optionalNumber(value: unknown): number | undefined {
  if (value == null || value === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function optionalString(value: unknown): string | undefined {
  if (value == null) return undefined;
  const parsed = String(value).trim();
  return parsed || undefined;
}

function optionalBoolean(value: unknown): boolean | undefined {
  const normalized = optionalString(value)?.toLowerCase();
  if (normalized == null) return undefined;
  if (['true', '1', 'yes'].includes(normalized)) return true;
  if (['false', '0', 'no'].includes(normalized)) return false;
  return undefined;
}

function coordinateKey(book: number, chapter: number, verse: number): string {
  return `${book}:${chapter}:${verse}`;
}

function formatCoordinate(book: number, chapter: number, verse: number): string {
  return `${book} ${chapter}:${verse}`;
}

function sourceInfo(filePath: string): MyBibleSourceInfo {
  const resolved = path.resolve(filePath);
  const stat = fs.statSync(resolved);
  if (!stat.isFile()) throw new Error(`MyBible module is not a file: ${resolved}`);
  return {
    path: resolved,
    fileName: path.basename(resolved),
    sizeBytes: stat.size,
    sha256: createHash('sha256').update(fs.readFileSync(resolved)).digest('hex')
  };
}

function moduleAbbreviation(filePath: string): string {
  return path.basename(filePath).replace(/\.SQLite3$/i, '');
}

function openReadOnly(filePath: string): Database.Database {
  const db = new Database(path.resolve(filePath), { readonly: true, fileMustExist: true });
  db.pragma('query_only = ON');
  return db;
}

function tableNames(db: Database.Database): string[] {
  return (db.prepare(`
    SELECT name
    FROM sqlite_master
    WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
    ORDER BY name
  `).all() as Array<{ name: string }>).map(row => row.name);
}

function quoteIdentifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

function inspectTables(db: Database.Database): MyBibleTableSchema[] {
  return tableNames(db).map(name => ({
    name,
    columns: (db.prepare(`PRAGMA table_info(${quoteIdentifier(name)})`).all() as Array<{
      name: string;
      type: string;
      notnull: number;
      pk: number;
    }>).map(column => ({
      name: column.name,
      type: column.type || '',
      notNull: Boolean(column.notnull),
      primaryKeyPosition: Number(column.pk) || 0
    }))
  }));
}

function requireTableColumns(tables: MyBibleTableSchema[], tableName: string, required: string[]): void {
  const table = tables.find(candidate => candidate.name.toLowerCase() === tableName.toLowerCase());
  if (!table) throw new Error(`MyBible module does not contain the required '${tableName}' table.`);
  const columns = new Set(table.columns.map(column => column.name.toLowerCase()));
  const missing = required.filter(column => !columns.has(column.toLowerCase()));
  if (missing.length > 0) {
    throw new Error(`MyBible table '${table.name}' is missing required columns: ${missing.join(', ')}.`);
  }
}

function readInfo(db: Database.Database, tables: MyBibleTableSchema[]): Record<string, string> {
  const infoTable = tables.find(table => table.name.toLowerCase() === 'info');
  if (!infoTable) return {};
  const columns = new Set(infoTable.columns.map(column => column.name.toLowerCase()));
  if (!columns.has('name') || !columns.has('value')) return {};
  const result: Record<string, string> = {};
  for (const row of db.prepare(`SELECT name, value FROM ${quoteIdentifier(infoTable.name)}`).iterate() as Iterable<UnknownRow>) {
    if (row.name != null) result[String(row.name)] = row.value == null ? '' : String(row.value);
  }
  return result;
}

function readMetadata(filePath: string, info: Record<string, string>): MyBibleMetadata {
  return {
    abbreviation: moduleAbbreviation(filePath),
    description: optionalString(info.description),
    language: optionalString(info.language),
    russianNumbering: optionalBoolean(info.russian_numbering),
    strongNumbers: optionalBoolean(info.strong_numbers),
    isFootnotes: optionalBoolean(info.is_footnotes),
    origin: optionalString(info.origin),
    copyright: optionalString(info.copyright),
    license: optionalString(info.license ?? info.licence),
    detailedInfo: optionalString(info.detailed_info),
    htmlStyleDeclared: Boolean(optionalString(info.html_style)),
    infoNames: Object.keys(info).sort((left, right) => left.localeCompare(right))
  };
}

function decodeEntities(value: string): string {
  return value
    .replace(/&#(\d+);/g, (_match, decimal: string) => String.fromCodePoint(Number(decimal)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, hexadecimal: string) => String.fromCodePoint(Number.parseInt(hexadecimal, 16)))
    .replaceAll('&nbsp;', ' ')
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'");
}

function normalizeMarker(value: string): string {
  return decodeEntities(value).replace(/[\s\u00a0\u2000-\u200b\u202f\u205f\u3000]+/g, ' ').trim();
}

function scriptureTextOnly(value: string): string {
  return decodeEntities(value)
    .replace(/<(?:S|m|f)\b[^>]*>[\s\S]*?<\/(?:S|m|f)\s*>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/[\s\u00a0\u2000-\u200b\u202f\u205f\u3000]+/g, ' ')
    .trim();
}

function limited(values: number[]): { values: number[]; omitted: number } {
  return { values: values.slice(0, MAX_EXAMPLES), omitted: Math.max(0, values.length - MAX_EXAMPLES) };
}

function increment(map: Map<string, number>, key: string, amount = 1): void {
  map.set(key, (map.get(key) ?? 0) + amount);
}

function inspectMarkup(
  text: string,
  coordinate: string,
  tagOccurrences: Map<string, number>,
  tagRows: Map<string, number>,
  malformedExamples: string[]
): { malformed: boolean; markers: string[] } {
  const rowTags = new Set<string>();
  const stack: string[] = [];
  let malformed = false;
  const tokenPattern = /<(\/?)\s*([A-Za-z][A-Za-z0-9]*)(?:\s[^<>]*?)?(\/?)>/g;
  for (const match of text.matchAll(tokenPattern)) {
    const closing = match[1] === '/';
    const tag = match[2];
    const selfClosing = match[3] === '/' || selfClosingVerseTags.has(tag);
    if (!closing) {
      increment(tagOccurrences, tag);
      rowTags.add(tag);
      if (!selfClosing) stack.push(tag);
      continue;
    }
    if (stack.at(-1) === tag) stack.pop();
    else malformed = true;
  }
  if (stack.length > 0) malformed = true;
  for (const tag of rowTags) increment(tagRows, tag);
  if (malformed && malformedExamples.length < MAX_EXAMPLES) malformedExamples.push(coordinate);
  const markers = [...text.matchAll(/<f\b[^>]*>([\s\S]*?)<\/f\s*>/gi)].map(match => match[1]);
  return { malformed, markers };
}

function inspectBibleModule(filePath: string): InspectedModule {
  const source = sourceInfo(filePath);
  const db = openReadOnly(source.path);
  try {
    const tables = inspectTables(db);
    requireTableColumns(tables, 'books', ['book_number']);
    requireTableColumns(tables, 'verses', ['book_number', 'chapter', 'verse', 'text']);
    const info = readInfo(db, tables);
    const metadata = readMetadata(source.path, info);
    const issues: MyBibleIssue[] = [];
    const booksTable = tables.find(table => table.name.toLowerCase() === 'books')!;
    const versesTable = tables.find(table => table.name.toLowerCase() === 'verses')!;
    const bookRows = db.prepare(`SELECT * FROM ${quoteIdentifier(booksTable.name)}`).all() as UnknownRow[];
    const booksByNumber = new Map<number, UnknownRow>();
    for (const row of bookRows) booksByNumber.set(toNumber(row.book_number), row);

    const coordinatesByBook = new Map<number, VerseCoordinate[]>();
    const coordinateKeys = new Set<string>();
    const verseMarkers: VerseMarker[] = [];
    const tagOccurrences = new Map<string, number>();
    const tagRows = new Map<string, number>();
    const malformedExamples: string[] = [];
    let malformedVerseRows = 0;
    let footnoteMarkerOccurrences = 0;
    let versesWithFootnoteMarkers = 0;
    let verseRows = 0;
    let emptyVerseRows = 0;
    let metadataOnlyVerseRows = 0;
    let nonPositiveCoordinates = 0;
    const structureHash = createHash('sha256');

    const verseStatement = db.prepare(`
      SELECT book_number, chapter, verse, text
      FROM ${quoteIdentifier(versesTable.name)}
      ORDER BY book_number, chapter, verse
    `);
    for (const row of verseStatement.iterate() as Iterable<UnknownRow>) {
      const book = toNumber(row.book_number);
      const chapter = toNumber(row.chapter);
      const verse = toNumber(row.verse);
      const text = row.text == null ? '' : String(row.text);
      const empty = text.trim().length === 0;
      const metadataOnly = !empty && scriptureTextOnly(text).length === 0;
      verseRows++;
      if (empty) emptyVerseRows++;
      if (metadataOnly) metadataOnlyVerseRows++;
      if (book <= 0 || chapter <= 0 || verse <= 0) nonPositiveCoordinates++;
      const coordinate: VerseCoordinate = { book, chapter, verse, empty, metadataOnly };
      const list = coordinatesByBook.get(book) ?? [];
      list.push(coordinate);
      coordinatesByBook.set(book, list);
      coordinateKeys.add(coordinateKey(book, chapter, verse));
      structureHash.update(`${book}:${chapter}:${verse}:${empty ? 1 : 0}:${metadataOnly ? 1 : 0}\n`);

      const markup = inspectMarkup(text, formatCoordinate(book, chapter, verse), tagOccurrences, tagRows, malformedExamples);
      if (markup.malformed) malformedVerseRows++;
      if (markup.markers.length > 0) versesWithFootnoteMarkers++;
      footnoteMarkerOccurrences += markup.markers.length;
      for (const marker of markup.markers) verseMarkers.push({ book, chapter, verse, marker });
    }

    const duplicateVerseCoordinates = toNumber((db.prepare(`
      SELECT COALESCE(SUM(row_count - 1), 0) AS count
      FROM (
        SELECT COUNT(*) AS row_count
        FROM ${quoteIdentifier(versesTable.name)}
        GROUP BY book_number, chapter, verse
        HAVING COUNT(*) > 1
      )
    `).get() as UnknownRow).count);

    const allBookNumbers = [...new Set([...booksByNumber.keys(), ...coordinatesByBook.keys()])].sort((a, b) => a - b);
    const unknownBookNumbers = allBookNumbers.filter(book => !myBibleToBibleNoteBookIndex.has(book));
    const bookDetails: MyBibleBookAnalysis[] = [];
    let chapterCount = 0;
    for (const book of allBookNumbers) {
      const row = booksByNumber.get(book) ?? {};
      const coordinates = coordinatesByBook.get(book) ?? [];
      const chapters = new Map<number, VerseCoordinate[]>();
      for (const coordinate of coordinates) {
        const chapter = chapters.get(coordinate.chapter) ?? [];
        chapter.push(coordinate);
        chapters.set(coordinate.chapter, chapter);
      }
      const chapterNumbers = [...chapters.keys()].sort((a, b) => a - b);
      chapterCount += chapterNumbers.length;
      const maxChapter = chapterNumbers.at(-1) ?? 0;
      const missingChapterNumbers: number[] = [];
      for (let chapter = 1; chapter <= maxChapter; chapter++) {
        if (!chapters.has(chapter)) missingChapterNumbers.push(chapter);
      }
      const missingChapters = limited(missingChapterNumbers);
      const chapterDetails: MyBibleChapterAnalysis[] = chapterNumbers.map(chapterNumber => {
        const verses = chapters.get(chapterNumber)!;
        const verseNumbers = new Set(verses.map(item => item.verse));
        const maxVerse = Math.max(0, ...verseNumbers);
        const missingVerseNumbers: number[] = [];
        for (let verse = 1; verse <= maxVerse; verse++) {
          if (!verseNumbers.has(verse)) missingVerseNumbers.push(verse);
        }
        const missingVerses = limited(missingVerseNumbers);
        return {
          chapter: chapterNumber,
          verseRows: verses.length,
          maxVerse,
          emptyVerseRows: verses.filter(item => item.empty).length,
          metadataOnlyVerseRows: verses.filter(item => item.metadataOnly).length,
          missingVerses: missingVerses.values,
          missingVersesOmitted: missingVerses.omitted
        };
      });
      bookDetails.push({
        myBibleBookNumber: book,
        bibleNoteBookIndex: myBibleToBibleNoteBookIndex.get(book) ?? null,
        shortName: optionalString(row.short_name),
        longName: optionalString(row.long_name),
        sortingOrder: optionalNumber(row.sorting_order),
        chapters: chapterDetails,
        chapterCount: chapterDetails.length,
        verseRows: coordinates.length,
        emptyVerseRows: coordinates.filter(item => item.empty).length,
        missingChapters: missingChapters.values,
        missingChaptersOmitted: missingChapters.omitted
      });
    }

    if (metadata.russianNumbering != null) {
      issues.push({
        severity: 'info',
        code: 'versification-hint-only',
        message: `russian_numbering=${metadata.russianNumbering}; this is a coarse hint, not a complete verse mapping.`
      });
    }
    if (unknownBookNumbers.length > 0) {
      issues.push({
        severity: 'warning',
        code: 'unknown-book-numbers',
        message: `${unknownBookNumbers.length} MyBible book number(s) do not have a canonical BibleNote mapping yet.`
      });
    }
    if (duplicateVerseCoordinates > 0) {
      issues.push({
        severity: 'error',
        code: 'duplicate-verse-coordinates',
        message: `${duplicateVerseCoordinates} duplicate verse coordinate row(s) were found.`
      });
    }
    if (nonPositiveCoordinates > 0) {
      issues.push({
        severity: 'error',
        code: 'non-positive-verse-coordinates',
        message: `${nonPositiveCoordinates} verse row(s) use a non-positive book, chapter, or verse number.`
      });
    }
    const gapChapters = bookDetails.reduce((sum, book) => sum + book.missingChapters.length + book.missingChaptersOmitted, 0);
    const gapVerses = bookDetails.reduce((sum, book) => sum + book.chapters.reduce(
      (chapterSum, chapter) => chapterSum + chapter.missingVerses.length + chapter.missingVersesOmitted,
      0
    ), 0);
    if (gapChapters > 0 || gapVerses > 0) {
      issues.push({
        severity: 'warning',
        code: 'numbering-gaps',
        message: `Found ${gapChapters} missing chapter number(s) and ${gapVerses} missing verse number(s). MyBible expects continuous numbering.`
      });
    }
    if (malformedVerseRows > 0) {
      issues.push({
        severity: 'warning',
        code: 'malformed-verse-markup',
        message: `${malformedVerseRows} verse row(s) contain unbalanced markup.`
      });
    }
    const unknownTags = [...tagOccurrences.keys()].filter(tag => !knownVerseTags.has(tag));
    if (unknownTags.length > 0) {
      issues.push({
        severity: 'warning',
        code: 'unknown-verse-tags',
        message: `Unsupported verse tag(s) were found: ${unknownTags.sort().join(', ')}.`
      });
    }

    const tagAnalysis = (tags: string[]): MyBibleMarkupTagAnalysis[] => tags
      .sort((left, right) => left.localeCompare(right))
      .map(tag => ({ tag, occurrences: tagOccurrences.get(tag) ?? 0, verseRows: tagRows.get(tag) ?? 0 }));
    const analysis: MyBibleModuleAnalysis = {
      source,
      metadata,
      tables,
      structure: {
        books: allBookNumbers.length,
        chapters: chapterCount,
        verseRows,
        emptyVerseRows,
        metadataOnlyVerseRows,
        duplicateVerseCoordinates,
        nonPositiveCoordinates,
        unknownBookNumbers,
        structureFingerprint: structureHash.digest('hex'),
        bookDetails
      },
      markup: {
        knownTags: tagAnalysis([...tagOccurrences.keys()].filter(tag => knownVerseTags.has(tag))),
        unknownTags: tagAnalysis(unknownTags),
        malformedVerseRows,
        malformedExamples,
        footnoteMarkerOccurrences,
        versesWithFootnoteMarkers
      },
      companions: {},
      issues
    };
    return { analysis, coordinatesByBook, coordinateKeys, verseMarkers };
  } finally {
    db.close();
  }
}

function footnoteKey(book: number, chapter: number, verse: number, marker: string): string {
  return `${coordinateKey(book, chapter, verse)}\u001f${marker}`;
}

function inspectFootnotes(filePath: string, module: InspectedModule): MyBibleFootnotesAnalysis {
  const source = sourceInfo(filePath);
  const db = openReadOnly(source.path);
  try {
    const tables = inspectTables(db);
    requireTableColumns(tables, 'commentaries', [
      'book_number', 'chapter_number_from', 'verse_number_from', 'marker', 'text'
    ]);
    const metadata = readMetadata(source.path, readInfo(db, tables));
    const table = tables.find(candidate => candidate.name.toLowerCase() === 'commentaries')!;
    const records: Array<{
      book: number;
      chapter: number;
      verse: number;
      marker: string;
      matched: boolean;
    }> = [];
    const exact = new Map<string, number[]>();
    const normalized = new Map<string, number[]>();
    const duplicateCounts = new Map<string, number>();
    const htmlTags = new Map<string, number>();
    let bibleLinks = 0;
    for (const row of db.prepare(`SELECT * FROM ${quoteIdentifier(table.name)}`).iterate() as Iterable<UnknownRow>) {
      const record = {
        book: toNumber(row.book_number),
        chapter: toNumber(row.chapter_number_from),
        verse: toNumber(row.verse_number_from),
        marker: row.marker == null ? '' : String(row.marker),
        matched: false
      };
      const index = records.push(record) - 1;
      const exactKey = footnoteKey(record.book, record.chapter, record.verse, record.marker);
      const normalizedKey = footnoteKey(record.book, record.chapter, record.verse, normalizeMarker(record.marker));
      exact.set(exactKey, [...(exact.get(exactKey) ?? []), index]);
      normalized.set(normalizedKey, [...(normalized.get(normalizedKey) ?? []), index]);
      increment(duplicateCounts, exactKey);
      const text = row.text == null ? '' : String(row.text);
      bibleLinks += (text.match(/href\s*=\s*(['"])B:/gi) ?? []).length;
      for (const tag of text.matchAll(/<\/?\s*([A-Za-z][A-Za-z0-9]*)\b[^>]*>/g)) {
        if (!tag[0].startsWith('</')) increment(htmlTags, tag[1].toLowerCase());
      }
    }

    function firstUnmatched(indexes: number[] | undefined): number | undefined {
      return indexes?.find(index => !records[index].matched);
    }

    let matchedExactly = 0;
    let matchedAfterWhitespaceNormalization = 0;
    const unmatchedMarkers: VerseMarker[] = [];
    for (const marker of module.verseMarkers) {
      const exactIndex = firstUnmatched(exact.get(footnoteKey(marker.book, marker.chapter, marker.verse, marker.marker)));
      if (exactIndex != null) {
        records[exactIndex].matched = true;
        matchedExactly++;
        continue;
      }
      const normalizedIndex = firstUnmatched(normalized.get(
        footnoteKey(marker.book, marker.chapter, marker.verse, normalizeMarker(marker.marker))
      ));
      if (normalizedIndex != null) {
        records[normalizedIndex].matched = true;
        matchedAfterWhitespaceNormalization++;
        continue;
      }
      unmatchedMarkers.push(marker);
    }
    const unmatchedRecordsByMarker = new Map<string, number[]>();
    for (let index = 0; index < records.length; index++) {
      const record = records[index];
      if (record.matched) continue;
      const key = `${record.book}\u001f${normalizeMarker(record.marker)}`;
      unmatchedRecordsByMarker.set(key, [...(unmatchedRecordsByMarker.get(key) ?? []), index]);
    }
    let matchedByMarkerAtDifferentCoordinate = 0;
    const coordinateMismatchExamples: MyBibleFootnotesAnalysis['coordinateMismatchExamples'] = [];
    const stillUnmatchedMarkers: VerseMarker[] = [];
    for (const marker of unmatchedMarkers) {
      const candidates = (unmatchedRecordsByMarker.get(`${marker.book}\u001f${normalizeMarker(marker.marker)}`) ?? [])
        .filter(index => !records[index].matched);
      if (candidates.length !== 1) {
        stillUnmatchedMarkers.push(marker);
        continue;
      }
      const record = records[candidates[0]];
      record.matched = true;
      matchedByMarkerAtDifferentCoordinate++;
      if (coordinateMismatchExamples.length < MAX_EXAMPLES) {
        coordinateMismatchExamples.push({
          marker: normalizeMarker(marker.marker),
          verseLocation: formatCoordinate(marker.book, marker.chapter, marker.verse),
          footnoteLocation: formatCoordinate(record.book, record.chapter, record.verse)
        });
      }
    }
    const missingFootnoteExamples = stillUnmatchedMarkers.slice(0, MAX_EXAMPLES).map(marker =>
      `${formatCoordinate(marker.book, marker.chapter, marker.verse)} ${normalizeMarker(marker.marker)}`
    );
    const verseMarkersWithoutFootnote = stillUnmatchedMarkers.length;
    const orphanRecords = records.filter(record => !record.matched);
    const orphanFootnoteExamples = orphanRecords.slice(0, MAX_EXAMPLES).map(record =>
      `${formatCoordinate(record.book, record.chapter, record.verse)} ${normalizeMarker(record.marker)}`
    );
    const duplicateFootnoteKeys = [...duplicateCounts.values()].reduce((sum, count) => sum + Math.max(0, count - 1), 0);
    if (metadata.isFootnotes !== true) {
      module.analysis.issues.push({
        severity: 'warning',
        code: 'companion-not-marked-as-footnotes',
        message: `Companion ${source.fileName} does not declare is_footnotes=true.`
      });
    }
    if (matchedByMarkerAtDifferentCoordinate > 0) {
      module.analysis.issues.push({
        severity: 'warning',
        code: 'footnote-coordinate-mismatches',
        message: `${matchedByMarkerAtDifferentCoordinate} footnote marker(s) match a unique record in the same book but use a different verse coordinate.`
      });
    }
    if (verseMarkersWithoutFootnote > 0) {
      module.analysis.issues.push({
        severity: 'warning',
        code: 'missing-footnote-records',
        message: `${verseMarkersWithoutFootnote} verse footnote marker(s) have no matching commentary record.`
      });
    }
    if (orphanRecords.length > 0) {
      module.analysis.issues.push({
        severity: 'warning',
        code: 'orphan-footnote-records',
        message: `${orphanRecords.length} footnote record(s) have no matching marker in the Bible module.`
      });
    }
    return {
      source,
      metadata,
      tables,
      records: records.length,
      matchedExactly,
      matchedAfterWhitespaceNormalization,
      matchedByMarkerAtDifferentCoordinate,
      verseMarkersWithoutFootnote,
      footnotesWithoutVerseMarker: orphanRecords.length,
      duplicateFootnoteKeys,
      bibleLinks,
      htmlTags: [...htmlTags.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([tag, occurrences]) => ({ tag, occurrences })),
      coordinateMismatchExamples,
      missingFootnoteExamples,
      orphanFootnoteExamples
    };
  } finally {
    db.close();
  }
}

function inspectCrossReferences(filePath: string, module: InspectedModule): MyBibleCrossReferencesAnalysis {
  const source = sourceInfo(filePath);
  const db = openReadOnly(source.path);
  try {
    const tables = inspectTables(db);
    requireTableColumns(tables, 'cross_references', [
      'book', 'chapter', 'verse', 'verse_end', 'book_to', 'chapter_to', 'verse_to_start', 'verse_to_end'
    ]);
    const info = readInfo(db, tables);
    const metadata = readMetadata(source.path, info);
    const table = tables.find(candidate => candidate.name.toLowerCase() === 'cross_references')!;
    let records = 0;
    let sourceLocationsMissingFromBible = 0;
    let targetLocationsMissingFromBible = 0;
    let invalidRanges = 0;
    const missingSourceExamples: string[] = [];
    const missingTargetExamples: string[] = [];
    for (const row of db.prepare(`SELECT * FROM ${quoteIdentifier(table.name)}`).iterate() as Iterable<UnknownRow>) {
      records++;
      const book = toNumber(row.book);
      const chapter = toNumber(row.chapter);
      const verse = toNumber(row.verse);
      const verseEnd = toNumber(row.verse_end);
      const targetBook = toNumber(row.book_to);
      const targetChapter = toNumber(row.chapter_to);
      const targetVerse = toNumber(row.verse_to_start);
      const targetVerseEnd = toNumber(row.verse_to_end);
      if (!module.coordinateKeys.has(coordinateKey(book, chapter, verse))) {
        sourceLocationsMissingFromBible++;
        if (missingSourceExamples.length < MAX_EXAMPLES) missingSourceExamples.push(formatCoordinate(book, chapter, verse));
      }
      if (!module.coordinateKeys.has(coordinateKey(targetBook, targetChapter, targetVerse))) {
        targetLocationsMissingFromBible++;
        if (missingTargetExamples.length < MAX_EXAMPLES) {
          missingTargetExamples.push(formatCoordinate(targetBook, targetChapter, targetVerse));
        }
      }
      if ((verseEnd > 0 && verseEnd < verse) || (targetVerseEnd > 0 && targetVerseEnd < targetVerse)) invalidRanges++;
    }
    if (sourceLocationsMissingFromBible > 0 || targetLocationsMissingFromBible > 0) {
      module.analysis.issues.push({
        severity: 'warning',
        code: 'cross-reference-locations-missing',
        message: `${sourceLocationsMissingFromBible} source and ${targetLocationsMissingFromBible} target cross-reference location(s) are absent from the Bible module.`
      });
    }
    if (invalidRanges > 0) {
      module.analysis.issues.push({
        severity: 'warning',
        code: 'invalid-cross-reference-ranges',
        message: `${invalidRanges} cross-reference range(s) end before they start.`
      });
    }
    return {
      source,
      metadata,
      tables,
      records,
      requiresReverseProcessing: optionalBoolean(info.requires_reverse_processing) === true,
      sourceLocationsMissingFromBible,
      targetLocationsMissingFromBible,
      invalidRanges,
      missingSourceExamples,
      missingTargetExamples
    };
  } finally {
    db.close();
  }
}

function discoverCommentariesPath(biblePath: string): string | undefined {
  const resolved = path.resolve(biblePath);
  const withoutExtension = resolved.replace(/\.SQLite3$/i, '');
  const candidate = `${withoutExtension}.commentaries.SQLite3`;
  return fs.existsSync(candidate) ? candidate : undefined;
}

function comparisonChapterMap(book: MyBibleBookAnalysis): Map<number, MyBibleChapterAnalysis> {
  return new Map(book.chapters.map(chapter => [chapter.chapter, chapter]));
}

function compareInspectedModules(reference: InspectedModule, module: InspectedModule): MyBibleStructureComparison {
  const referenceBooks = new Set(reference.coordinatesByBook.keys());
  const moduleBooks = new Set(module.coordinatesByBook.keys());
  const commonBooks = [...referenceBooks].filter(book => moduleBooks.has(book)).sort((a, b) => a - b);
  const booksOnlyInReference = [...referenceBooks].filter(book => !moduleBooks.has(book)).sort((a, b) => a - b);
  const booksOnlyInModule = [...moduleBooks].filter(book => !referenceBooks.has(book)).sort((a, b) => a - b);
  const referenceDetails = new Map(reference.analysis.structure.bookDetails.map(book => [book.myBibleBookNumber, book]));
  const moduleDetails = new Map(module.analysis.structure.bookDetails.map(book => [book.myBibleBookNumber, book]));
  const bookDifferences: MyBibleBookComparison[] = [];
  let mappingCandidateRuns = 0;

  for (const bookNumber of commonBooks) {
    const referenceCoordinates = reference.coordinatesByBook.get(bookNumber)!;
    const moduleCoordinates = module.coordinatesByBook.get(bookNumber)!;
    const referenceBook = referenceDetails.get(bookNumber)!;
    const moduleBook = moduleDetails.get(bookNumber)!;
    const pairedRows = Math.min(referenceCoordinates.length, moduleCoordinates.length);
    let coordinateMismatchRows = 0;
    let emptyStatusMismatches = 0;
    const allRuns: MyBibleAlignmentRun[] = [];
    let currentRun: MyBibleAlignmentRun | undefined;

    for (let index = 0; index < pairedRows; index++) {
      const left = referenceCoordinates[index];
      const right = moduleCoordinates[index];
      if (left.empty !== right.empty || left.metadataOnly !== right.metadataOnly) emptyStatusMismatches++;
      const chapterDelta = right.chapter - left.chapter;
      const verseDelta = right.verse - left.verse;
      if (chapterDelta === 0 && verseDelta === 0) {
        if (currentRun) allRuns.push(currentRun);
        currentRun = undefined;
        continue;
      }
      coordinateMismatchRows++;
      if (currentRun && currentRun.chapterDelta === chapterDelta && currentRun.verseDelta === verseDelta) {
        currentRun.referenceEnd = formatCoordinate(left.book, left.chapter, left.verse);
        currentRun.moduleEnd = formatCoordinate(right.book, right.chapter, right.verse);
        currentRun.rows++;
      } else {
        if (currentRun) allRuns.push(currentRun);
        currentRun = {
          referenceStart: formatCoordinate(left.book, left.chapter, left.verse),
          referenceEnd: formatCoordinate(left.book, left.chapter, left.verse),
          moduleStart: formatCoordinate(right.book, right.chapter, right.verse),
          moduleEnd: formatCoordinate(right.book, right.chapter, right.verse),
          rows: 1,
          chapterDelta,
          verseDelta
        };
      }
    }
    if (currentRun) allRuns.push(currentRun);
    mappingCandidateRuns += allRuns.length;

    const referenceChapters = comparisonChapterMap(referenceBook);
    const moduleChapters = comparisonChapterMap(moduleBook);
    const chapterNumbers = [...new Set([...referenceChapters.keys(), ...moduleChapters.keys()])].sort((a, b) => a - b);
    const chapterDifferences = chapterNumbers.flatMap(chapter => {
      const left = referenceChapters.get(chapter);
      const right = moduleChapters.get(chapter);
      if (left?.verseRows === right?.verseRows && left?.maxVerse === right?.maxVerse) return [];
      return [{
        chapter,
        referenceVerseRows: left?.verseRows ?? 0,
        moduleVerseRows: right?.verseRows ?? 0,
        referenceMaxVerse: left?.maxVerse ?? 0,
        moduleMaxVerse: right?.maxVerse ?? 0
      }];
    });
    const structurallyDifferent = referenceCoordinates.length !== moduleCoordinates.length
      || referenceBook.chapterCount !== moduleBook.chapterCount
      || coordinateMismatchRows > 0
      || emptyStatusMismatches > 0
      || chapterDifferences.length > 0;
    if (!structurallyDifferent) continue;
    bookDifferences.push({
      myBibleBookNumber: bookNumber,
      bibleNoteBookIndex: myBibleToBibleNoteBookIndex.get(bookNumber) ?? null,
      referenceVerseRows: referenceCoordinates.length,
      moduleVerseRows: moduleCoordinates.length,
      verseRowDelta: moduleCoordinates.length - referenceCoordinates.length,
      referenceChapters: referenceBook.chapterCount,
      moduleChapters: moduleBook.chapterCount,
      emptyStatusMismatches,
      coordinateMismatchRows,
      unmatchedOrdinalRows: Math.abs(referenceCoordinates.length - moduleCoordinates.length),
      chapterDifferences,
      alignmentHints: allRuns.slice(0, MAX_ALIGNMENT_RUNS),
      alignmentHintsOmitted: Math.max(0, allRuns.length - MAX_ALIGNMENT_RUNS)
    });
  }

  return {
    reference: {
      fileName: reference.analysis.source.fileName,
      sha256: reference.analysis.source.sha256,
      description: reference.analysis.metadata.description
    },
    module: {
      fileName: module.analysis.source.fileName,
      sha256: module.analysis.source.sha256,
      description: module.analysis.metadata.description
    },
    commonBooks: commonBooks.length,
    booksOnlyInReference,
    booksOnlyInModule,
    booksWithStructuralDifferences: bookDifferences.length,
    mappingCandidateRuns,
    bookDifferences,
    caveat: 'Ordinal alignment hints are structural candidates only. They must be reviewed and validated in both directions before becoming neutral VerseId mappings.'
  };
}

export function analyzeMyBibleModule(options: AnalyzeMyBibleOptions): MyBibleModuleAnalysis {
  const inspected = inspectBibleModule(options.biblePath);
  const commentariesPath = options.commentariesPath === null
    ? undefined
    : options.commentariesPath ?? (options.autoDiscoverCommentaries === false
      ? undefined
      : discoverCommentariesPath(options.biblePath));
  if (commentariesPath) inspected.analysis.companions.footnotes = inspectFootnotes(commentariesPath, inspected);
  if (options.crossReferencesPath) {
    inspected.analysis.companions.crossReferences = inspectCrossReferences(options.crossReferencesPath, inspected);
  }
  return inspected.analysis;
}

export function compareMyBibleModules(referenceBiblePath: string, moduleBiblePath: string): MyBibleStructureComparison {
  return compareInspectedModules(inspectBibleModule(referenceBiblePath), inspectBibleModule(moduleBiblePath));
}

export function createMyBibleAnalysisReport(options: AnalyzeMyBibleOptions): MyBibleAnalysisReport {
  const module = inspectBibleModule(options.biblePath);
  const commentariesPath = options.commentariesPath === null
    ? undefined
    : options.commentariesPath ?? (options.autoDiscoverCommentaries === false
      ? undefined
      : discoverCommentariesPath(options.biblePath));
  if (commentariesPath) module.analysis.companions.footnotes = inspectFootnotes(commentariesPath, module);
  if (options.crossReferencesPath) {
    module.analysis.companions.crossReferences = inspectCrossReferences(options.crossReferencesPath, module);
  }
  const comparisonReference = options.compareBiblePath ? inspectBibleModule(options.compareBiblePath) : undefined;
  return {
    reportVersion: REPORT_VERSION,
    generatedAt: new Date().toISOString(),
    module: module.analysis,
    comparison: comparisonReference ? compareInspectedModules(comparisonReference, module) : undefined
  };
}
