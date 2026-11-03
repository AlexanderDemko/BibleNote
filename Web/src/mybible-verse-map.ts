import Database from 'better-sqlite3';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import JSZip from 'jszip';
import { bibleNoteBookIndexFromMyBible } from './mybible-analyzer.js';
import {
  readLegacyVerseMappings,
  type LegacyVerseRelation,
  type VerseCoordinate
} from './legacy-verse-mapping.js';

const MAP_SCHEMA_VERSION = 1;
const MIN_EXACT_TEXT_LENGTH = 12;
const MAX_VALIDATION_EXAMPLES = 100;

export type VerseSourceKind = 'mybible-sqlite' | 'biblenote-zefania-xml' | 'biblenote-bnm';
export type VerseMapReviewStatus = 'candidate' | 'confirmed' | 'rejected';
export type VerseMapConfidence = 'high' | 'medium' | 'low';
export type VerseMapEntryKind =
  | 'identity'
  | 'renumbered'
  | 'merged-in-module'
  | 'split-in-module'
  | 'many-to-many'
  | 'empty-placeholder-group'
  | 'unmatched-reference'
  | 'unmatched-module';

export type VerseMapLocation = {
  bookIndex: number;
  chapter: number;
  verse: number;
  sourceBookNumber: number;
  empty: boolean;
};

export type VerseMapSource = {
  kind: VerseSourceKind;
  path: string;
  fileName: string;
  moduleId: string;
  description?: string;
  sha256: string;
  verseRows: number;
  mappedVerseRows: number;
  unmappedVerseRows: number;
  unmappedBookNumbers: number[];
};

export type VerseMapEntry = {
  id: string;
  reviewGroupId: string;
  kind: VerseMapEntryKind;
  confidence: VerseMapConfidence;
  evidence: string[];
  reference: VerseMapLocation[];
  module: VerseMapLocation[];
};

export type VerseMapReviewGroup = {
  id: string;
  status: VerseMapReviewStatus;
  autoConfirmed?: boolean;
  allowNonMonotonic: boolean;
  kind: VerseMapEntryKind;
  confidence: VerseMapConfidence;
  evidence: string[];
  bookIndex: number;
  entryCount: number;
  firstEntryId: string;
  lastEntryId: string;
  referenceStart?: string;
  referenceEnd?: string;
  moduleStart?: string;
  moduleEnd?: string;
};

export type VerseMapCoverage = {
  totalRows: number;
  mappedRows: number;
  missingRows: number;
  percent: number;
  missingExamples: string[];
};

export type VerseMapScopeValidation = {
  groups: number;
  entries: number;
  referenceCoverage: VerseMapCoverage;
  moduleCoverage: VerseMapCoverage;
  invalidReferenceLocations: number;
  invalidModuleLocations: number;
  duplicateReferenceAssignments: number;
  duplicateModuleAssignments: number;
  crossBookEntries: number;
  reverseOrderTransitions: number;
  allowedNonMonotonicTransitions: number;
  roundTripFailures: number;
  unmatchedReferenceRows: number;
  unmatchedModuleRows: number;
  oneToOneEntries: number;
  manyToOneEntries: number;
  oneToManyEntries: number;
  manyToManyEntries: number;
  emptyPlaceholderEntries: number;
  entriesWithUnknownReviewGroup: number;
  isCompleteAndConsistent: boolean;
};

export type VerseMapValidation = {
  validatedAt: string;
  sourceChecks: {
    referenceFingerprintMatches: boolean;
    moduleFingerprintMatches: boolean;
    referencePath: string;
    modulePath: string;
  };
  candidateAndConfirmed: VerseMapScopeValidation;
  confirmedOnly: VerseMapScopeValidation;
};

export type VerseMapDocument = {
  schemaVersion: number;
  generatedAt: string;
  reference: VerseMapSource;
  module: VerseMapSource;
  reviewGroups: VerseMapReviewGroup[];
  entries: VerseMapEntry[];
  validation: VerseMapValidation;
  notes: string[];
};

export type CreateVerseMapOptions = {
  referencePath: string;
  modulePath: string;
  referenceDifferencesManifestPath?: string;
};

export type ValidateVerseMapOptions = {
  referencePath?: string;
  modulePath?: string;
};

type InternalVerse = VerseMapLocation & {
  ordinal: number;
  normalizedText: string;
  reviewText: string;
  declaredVerseRange?: { firstVerse: number; lastVerse: number };
};

type VerseSourceData = {
  descriptor: VerseMapSource;
  versesByBook: Map<number, InternalVerse[]>;
  versesByKey: Map<string, InternalVerse>;
};

type DraftPair = {
  reference: InternalVerse[];
  module: InternalVerse[];
  evidence: Set<string>;
};

type KnownVersification = {
  manifestPath: string;
  relationsByBook: Map<number, LegacyVerseRelation[]>;
};

function coordinateKey(location: Pick<VerseMapLocation, 'bookIndex' | 'chapter' | 'verse'>): string {
  return `${location.bookIndex}:${location.chapter}:${location.verse}`;
}

function formatLocation(location: Pick<VerseMapLocation, 'bookIndex' | 'chapter' | 'verse'>): string {
  return `${location.bookIndex} ${location.chapter}:${location.verse}`;
}

function sourceHash(filePath: string): string {
  return createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
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

function normalizedScriptureText(value: string): string {
  return decodeEntities(value)
    .replace(/<(?:S|m|f|n|NOTE|XREF|GRAM)\b[^>]*>[\s\S]*?<\/(?:S|m|f|n|NOTE|XREF|GRAM)\s*>/gi, '')
    .replace(/<[^>]+>/g, '')
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function declaredVerseRange(value: string): { firstVerse: number; lastVerse: number } | undefined {
  const match = /<n\b[^>]*>\s*\[\s*(\d+)\s*[-–—]\s*(\d+)\s*\]\s*<\/n\s*>/i.exec(value);
  if (!match) return undefined;
  const firstVerse = Number(match[1]);
  const lastVerse = Number(match[2]);
  return firstVerse > 0 && lastVerse > firstVerse ? { firstVerse, lastVerse } : undefined;
}

function publicLocation(verse: InternalVerse): VerseMapLocation {
  return {
    bookIndex: verse.bookIndex,
    chapter: verse.chapter,
    verse: verse.verse,
    sourceBookNumber: verse.sourceBookNumber,
    empty: verse.empty
  };
}

function attributeValue(attributes: string, name: string): string | undefined {
  const match = new RegExp(`${name}\\s*=\\s*["']([^"']+)["']`, 'i').exec(attributes);
  return match?.[1];
}

function descriptorForFile(
  filePath: string,
  kind: VerseSourceKind,
  moduleId: string,
  description: string | undefined,
  sha256: string,
  verseRows: number,
  mappedVerseRows: number,
  unmappedBookNumbers: number[]
): VerseMapSource {
  return {
    kind,
    path: path.resolve(filePath),
    fileName: path.basename(filePath),
    moduleId,
    description,
    sha256,
    verseRows,
    mappedVerseRows,
    unmappedVerseRows: verseRows - mappedVerseRows,
    unmappedBookNumbers
  };
}

function finalizeSource(descriptor: VerseMapSource, verses: InternalVerse[]): VerseSourceData {
  const versesByBook = new Map<number, InternalVerse[]>();
  const versesByKey = new Map<string, InternalVerse>();
  for (const verse of verses) {
    const book = versesByBook.get(verse.bookIndex) ?? [];
    book.push(verse);
    versesByBook.set(verse.bookIndex, book);
  }
  for (const bookVerses of versesByBook.values()) {
    bookVerses.sort((left, right) => left.chapter - right.chapter || left.verse - right.verse);
    for (let ordinal = 0; ordinal < bookVerses.length; ordinal++) {
      bookVerses[ordinal].ordinal = ordinal;
      versesByKey.set(coordinateKey(bookVerses[ordinal]), bookVerses[ordinal]);
    }
  }
  return { descriptor, versesByBook, versesByKey };
}

function readMyBibleSource(filePath: string): VerseSourceData {
  const resolved = path.resolve(filePath);
  const db = new Database(resolved, { readonly: true, fileMustExist: true });
  db.pragma('query_only = ON');
  try {
    const tables = new Set((db.prepare(`
      SELECT lower(name) name FROM sqlite_master WHERE type = 'table'
    `).all() as Array<{ name: string }>).map(row => row.name));
    if (!tables.has('verses')) throw new Error(`${resolved} is not a MyBible Bible module: table 'verses' is missing.`);
    const info: Record<string, string> = {};
    if (tables.has('info')) {
      for (const row of db.prepare('SELECT name, value FROM info').iterate() as Iterable<{ name: unknown; value: unknown }>) {
        if (row.name != null) info[String(row.name)] = row.value == null ? '' : String(row.value);
      }
    }
    const verses: InternalVerse[] = [];
    const unmappedBooks = new Set<number>();
    let verseRows = 0;
    for (const row of db.prepare(`
      SELECT book_number, chapter, verse, text
      FROM verses
      ORDER BY book_number, chapter, verse
    `).iterate() as Iterable<{ book_number: unknown; chapter: unknown; verse: unknown; text: unknown }>) {
      verseRows++;
      const sourceBookNumber = Number(row.book_number);
      const bookIndex = bibleNoteBookIndexFromMyBible(sourceBookNumber);
      if (bookIndex == null) {
        unmappedBooks.add(sourceBookNumber);
        continue;
      }
      const text = row.text == null ? '' : String(row.text);
      verses.push({
        bookIndex,
        chapter: Number(row.chapter),
        verse: Number(row.verse),
        sourceBookNumber,
        empty: text.trim().length === 0,
        normalizedText: normalizedScriptureText(text),
        reviewText: text.trim(),
        declaredVerseRange: declaredVerseRange(text),
        ordinal: 0
      });
    }
    const descriptor = descriptorForFile(
      resolved,
      'mybible-sqlite',
      path.basename(resolved).replace(/\.SQLite3$/i, ''),
      info.description?.trim() || undefined,
      sourceHash(resolved),
      verseRows,
      verses.length,
      [...unmappedBooks].sort((left, right) => left - right)
    );
    return finalizeSource(descriptor, verses);
  } finally {
    db.close();
  }
}

function readZefaniaXmlSource(
  filePath: string,
  xml: string,
  kind: Extract<VerseSourceKind, 'biblenote-zefania-xml' | 'biblenote-bnm'>,
  sha256: string
): VerseSourceData {
  if (!/<XMLBIBLE\b/i.test(xml)) throw new Error(`${filePath} does not contain a Zefania XMLBIBLE document.`);
  const verses: InternalVerse[] = [];
  for (const bookMatch of xml.matchAll(/<BIBLEBOOK\b([^>]*)>([\s\S]*?)<\/BIBLEBOOK\s*>/gi)) {
    const bookIndex = Number(attributeValue(bookMatch[1], 'bnumber'));
    if (!Number.isInteger(bookIndex) || bookIndex <= 0) continue;
    for (const chapterMatch of bookMatch[2].matchAll(/<CHAPTER\b([^>]*)>([\s\S]*?)<\/CHAPTER\s*>/gi)) {
      const chapter = Number(attributeValue(chapterMatch[1], 'cnumber'));
      if (!Number.isInteger(chapter) || chapter <= 0) continue;
      for (const verseMatch of chapterMatch[2].matchAll(/<VERS\b([^>]*?)(?:\/\s*>|>([\s\S]*?)<\/VERS\s*>)/gi)) {
        const verse = Number(attributeValue(verseMatch[1], 'vnumber'));
        if (!Number.isInteger(verse) || verse <= 0) continue;
        const text = verseMatch[2] ?? '';
        verses.push({
          bookIndex,
          chapter,
          verse,
          sourceBookNumber: bookIndex,
          empty: text.trim().length === 0,
          normalizedText: normalizedScriptureText(text),
          reviewText: decodeEntities(text).trim(),
          ordinal: 0
        });
      }
    }
  }
  const title = /<title\b[^>]*>([\s\S]*?)<\/title\s*>/i.exec(xml)?.[1];
  const moduleId = path.basename(filePath).replace(/\.(?:xml|bnm)$/i, '');
  const descriptor = descriptorForFile(
    filePath,
    kind,
    moduleId,
    title ? decodeEntities(title.replace(/<[^>]+>/g, '')).trim() : undefined,
    sha256,
    verses.length,
    verses.length,
    []
  );
  return finalizeSource(descriptor, verses);
}

export async function readVerseMapSource(filePath: string): Promise<VerseSourceData> {
  const resolved = path.resolve(filePath);
  const extension = path.extname(resolved).toLowerCase();
  if (extension === '.sqlite3') return readMyBibleSource(resolved);
  if (extension === '.xml') {
    return readZefaniaXmlSource(
      resolved,
      fs.readFileSync(resolved, 'utf8'),
      'biblenote-zefania-xml',
      sourceHash(resolved)
    );
  }
  if (extension === '.bnm') {
    const bytes = fs.readFileSync(resolved);
    const zip = await JSZip.loadAsync(bytes);
    const bibleEntry = Object.values(zip.files).find(entry => !entry.dir && path.basename(entry.name).toLowerCase() === 'bible.xml');
    if (!bibleEntry) throw new Error(`${resolved} does not contain bible.xml.`);
    return readZefaniaXmlSource(
      resolved,
      await bibleEntry.async('string'),
      'biblenote-bnm',
      createHash('sha256').update(bytes).digest('hex')
    );
  }
  throw new Error(`Unsupported verse source '${resolved}'. Expected .SQLite3, .xml, or .bnm.`);
}

/** Loads source verse bodies for the local review UI without embedding them in the editable map. */
export async function readVerseMapReviewTextIndex(filePath: string): Promise<Map<string, string>> {
  const source = await readVerseMapSource(filePath);
  return new Map([...source.versesByKey].map(([key, verse]) => [key, verse.reviewText]));
}

/** Loads valid source coordinates so the review UI can safely edit a disputed correspondence. */
export async function readVerseMapReviewLocationIndex(filePath: string): Promise<Map<string, VerseMapLocation>> {
  const source = await readVerseMapSource(filePath);
  return new Map([...source.versesByKey].map(([key, verse]) => [key, publicLocation(verse)]));
}

function textIndex(verses: InternalVerse[], available: Set<string>): Map<string, InternalVerse[]> {
  const result = new Map<string, InternalVerse[]>();
  for (const verse of verses) {
    if (!available.has(coordinateKey(verse)) || verse.empty || verse.normalizedText.length < MIN_EXACT_TEXT_LENGTH) continue;
    result.set(verse.normalizedText, [...(result.get(verse.normalizedText) ?? []), verse]);
  }
  return result;
}

function concatenatedTextIndex(
  verses: InternalVerse[],
  available: Set<string>,
  length: number
): Map<string, InternalVerse[][]> {
  const result = new Map<string, InternalVerse[][]>();
  for (let index = 0; index + length <= verses.length; index++) {
    const group = verses.slice(index, index + length);
    if (group.some(verse => !available.has(coordinateKey(verse)) || verse.empty)) continue;
    if (group.some((verse, groupIndex) => groupIndex > 0
      && (verse.chapter !== group[groupIndex - 1].chapter || verse.verse !== group[groupIndex - 1].verse + 1))) continue;
    const text = group.map(verse => verse.normalizedText).join(' ').trim();
    if (text.length < MIN_EXACT_TEXT_LENGTH) continue;
    result.set(text, [...(result.get(text) ?? []), group]);
  }
  return result;
}

function claimPair(
  pairs: DraftPair[],
  referenceAvailable: Set<string>,
  moduleAvailable: Set<string>,
  reference: InternalVerse[],
  module: InternalVerse[],
  evidence: string[]
): void {
  for (const verse of reference) referenceAvailable.delete(coordinateKey(verse));
  for (const verse of module) moduleAvailable.delete(coordinateKey(verse));
  pairs.push({ reference, module, evidence: new Set(evidence) });
}

function isAdjacentOrEqual(left: VerseCoordinate, right: VerseCoordinate): boolean {
  if (left.bookIndex !== right.bookIndex) return false;
  if (left.chapter === right.chapter) return right.verse === left.verse || right.verse === left.verse + 1;
  return right.chapter === left.chapter + 1 && right.verse === 1;
}

function legacyRelationRuns(relations: LegacyVerseRelation[]): LegacyVerseRelation[][] {
  const runs: LegacyVerseRelation[][] = [];
  for (const relation of relations) {
    const current = runs.at(-1);
    const previous = current?.at(-1);
    const continues = previous
      && isAdjacentOrEqual(previous.reference, relation.reference)
      && isAdjacentOrEqual(previous.module, relation.module)
      && (coordinateKey(previous.reference) !== coordinateKey(relation.reference)
        || coordinateKey(previous.module) !== coordinateKey(relation.module));
    if (!continues) runs.push([relation]);
    else current!.push(relation);
  }
  return runs;
}

function uniqueCoordinateCount(coordinates: VerseCoordinate[], available: Set<string>): number {
  return [...new Set(coordinates.map(coordinateKey))].filter(key => available.has(key)).length;
}

/**
 * Selects only legacy RST-versification runs whose boundary rows prove that the imported module
 * uses the base numbering. A tie deliberately leaves the passage for ordinary matching/review.
 */
function selectedLegacyRelations(relations: LegacyVerseRelation[], module: InternalVerse[]): LegacyVerseRelation[] {
  const moduleCoordinates = new Set(module.map(coordinateKey));
  return legacyRelationRuns(relations).flatMap(run => {
    const baseCoverage = uniqueCoordinateCount(run.map(relation => relation.reference), moduleCoordinates);
    const bridgeCoverage = uniqueCoordinateCount(run.map(relation => relation.module), moduleCoordinates);
    return baseCoverage > bridgeCoverage ? run : [];
  });
}

function pairKnownVersification(
  reference: InternalVerse[],
  module: InternalVerse[],
  relations: LegacyVerseRelation[],
  referenceAvailable: Set<string>,
  moduleAvailable: Set<string>,
  pairs: DraftPair[]
): { reservedReference: Set<string>; reservedModule: Set<string> } {
  const selected = selectedLegacyRelations(relations, module);
  const reservedReference = new Set(selected.map(relation => coordinateKey(relation.module)));
  const reservedModule = new Set(selected.map(relation => coordinateKey(relation.reference)));
  const referenceByCoordinate = new Map(reference.map(verse => [coordinateKey(verse), verse]));
  const moduleByCoordinate = new Map(module.map(verse => [coordinateKey(verse), verse]));

  const neighbors = new Map<string, Set<string>>();
  for (const relation of selected) {
    const referenceKey = `r:${coordinateKey(relation.module)}`;
    const moduleKey = `m:${coordinateKey(relation.reference)}`;
    neighbors.set(referenceKey, new Set([...(neighbors.get(referenceKey) ?? []), moduleKey]));
    neighbors.set(moduleKey, new Set([...(neighbors.get(moduleKey) ?? []), referenceKey]));
  }

  const visited = new Set<string>();
  for (const start of neighbors.keys()) {
    if (visited.has(start)) continue;
    const pending = [start];
    const componentNodes = new Set<string>();
    const referenceVerses: InternalVerse[] = [];
    const moduleVerses: InternalVerse[] = [];
    while (pending.length > 0) {
      const node = pending.pop()!;
      if (visited.has(node)) continue;
      visited.add(node);
      componentNodes.add(node);
      const key = node.slice(2);
      if (node.startsWith('r:')) {
        const verse = referenceByCoordinate.get(key);
        if (verse && referenceAvailable.has(key)) referenceVerses.push(verse);
      } else {
        const verse = moduleByCoordinate.get(key);
        if (verse && moduleAvailable.has(key)) moduleVerses.push(verse);
      }
      for (const neighbor of neighbors.get(node) ?? []) if (!visited.has(neighbor)) pending.push(neighbor);
    }
    referenceVerses.sort((left, right) => left.ordinal - right.ordinal);
    moduleVerses.sort((left, right) => left.ordinal - right.ordinal);
    if (referenceVerses.length > 0 && moduleVerses.length > 0) {
      const allowNonMonotonic = selected.some(relation => relation.skipCheck
        && componentNodes.has(`r:${coordinateKey(relation.module)}`)
        && componentNodes.has(`m:${coordinateKey(relation.reference)}`));
      claimPair(
        pairs,
        referenceAvailable,
        moduleAvailable,
        referenceVerses,
        moduleVerses,
        ['known-versification', ...(allowNonMonotonic ? ['known-versification-skip-check'] : [])]
      );
    }
  }
  return { reservedReference, reservedModule };
}

function pairDeclaredVerseRanges(
  reference: InternalVerse[],
  module: InternalVerse[],
  referenceAvailable: Set<string>,
  moduleAvailable: Set<string>,
  pairs: DraftPair[]
): void {
  const referenceByCoordinate = new Map(reference.map(verse => [coordinateKey(verse), verse]));
  const moduleByCoordinate = new Map(module.map(verse => [coordinateKey(verse), verse]));
  for (const moduleVerse of module) {
    const range = moduleVerse.declaredVerseRange;
    if (!range || range.firstVerse !== moduleVerse.verse || !moduleAvailable.has(coordinateKey(moduleVerse))) continue;
    const referenceVerses: InternalVerse[] = [];
    for (let verse = range.firstVerse; verse <= range.lastVerse; verse++) {
      const referenceVerse = referenceByCoordinate.get(`${moduleVerse.bookIndex}:${moduleVerse.chapter}:${verse}`);
      if (!referenceVerse || !referenceAvailable.has(coordinateKey(referenceVerse))) {
        referenceVerses.length = 0;
        break;
      }
      referenceVerses.push(referenceVerse);
    }
    if (referenceVerses.length === 0) continue;
    const moduleVerses = [moduleVerse];
    let conflictingModuleRow = false;
    for (let verse = range.firstVerse + 1; verse <= range.lastVerse; verse++) {
      const placeholder = moduleByCoordinate.get(`${moduleVerse.bookIndex}:${moduleVerse.chapter}:${verse}`);
      if (!placeholder) continue;
      if (!placeholder.empty || !moduleAvailable.has(coordinateKey(placeholder))) {
        conflictingModuleRow = true;
        break;
      }
      moduleVerses.push(placeholder);
    }
    if (conflictingModuleRow) continue;
    claimPair(
      pairs,
      referenceAvailable,
      moduleAvailable,
      referenceVerses,
      moduleVerses,
      ['declared-verse-range']
    );
  }
}

function pairExactConcatenations(
  reference: InternalVerse[],
  module: InternalVerse[],
  referenceAvailable: Set<string>,
  moduleAvailable: Set<string>,
  pairs: DraftPair[]
): void {
  for (const length of [3, 2]) {
    const referenceGroups = concatenatedTextIndex(reference, referenceAvailable, length);
    const moduleSingles = textIndex(module, moduleAvailable);
    for (const [text, referenceMatches] of referenceGroups) {
      const moduleMatches = moduleSingles.get(text);
      if (referenceMatches.length !== 1 || moduleMatches?.length !== 1) continue;
      const referenceGroup = referenceMatches[0];
      const moduleVerse = moduleMatches[0];
      if (referenceGroup.some(verse => !referenceAvailable.has(coordinateKey(verse)))) continue;
      if (!moduleAvailable.has(coordinateKey(moduleVerse))) continue;
      claimPair(
        pairs,
        referenceAvailable,
        moduleAvailable,
        referenceGroup,
        [moduleVerse],
        ['exact-concatenated-text']
      );
    }

    const referenceSingles = textIndex(reference, referenceAvailable);
    const moduleGroups = concatenatedTextIndex(module, moduleAvailable, length);
    for (const [text, moduleMatches] of moduleGroups) {
      const referenceMatches = referenceSingles.get(text);
      if (moduleMatches.length !== 1 || referenceMatches?.length !== 1) continue;
      const referenceVerse = referenceMatches[0];
      const moduleGroup = moduleMatches[0];
      if (!referenceAvailable.has(coordinateKey(referenceVerse))) continue;
      if (moduleGroup.some(verse => !moduleAvailable.has(coordinateKey(verse)))) continue;
      claimPair(
        pairs,
        referenceAvailable,
        moduleAvailable,
        [referenceVerse],
        moduleGroup,
        ['exact-concatenated-text']
      );
    }
  }
}

function pairBook(
  reference: InternalVerse[],
  module: InternalVerse[],
  knownVersificationRelations: LegacyVerseRelation[] = []
): DraftPair[] {
  const referenceAvailable = new Set(reference.map(coordinateKey));
  const moduleAvailable = new Set(module.map(coordinateKey));
  const pairs: DraftPair[] = [];
  const reserved = pairKnownVersification(
    reference,
    module,
    knownVersificationRelations,
    referenceAvailable,
    moduleAvailable,
    pairs
  );
  pairDeclaredVerseRanges(reference, module, referenceAvailable, moduleAvailable, pairs);
  pairExactConcatenations(reference, module, referenceAvailable, moduleAvailable, pairs);
  const referenceTexts = textIndex(reference, referenceAvailable);
  const moduleTexts = textIndex(module, moduleAvailable);

  for (const [text, referenceMatches] of referenceTexts) {
    const moduleMatches = moduleTexts.get(text);
    if (referenceMatches.length !== 1 || moduleMatches?.length !== 1) continue;
    const left = referenceMatches[0];
    const right = moduleMatches[0];
    referenceAvailable.delete(coordinateKey(left));
    moduleAvailable.delete(coordinateKey(right));
    pairs.push({
      reference: [left],
      module: [right],
      evidence: new Set(coordinateKey(left) === coordinateKey(right) ? ['exact-text', 'same-coordinate'] : ['exact-text'])
    });
  }

  const availableModuleByCoordinate = new Map(
    module.filter(verse => moduleAvailable.has(coordinateKey(verse))).map(verse => [coordinateKey(verse), verse])
  );
  for (const left of reference) {
    if (!referenceAvailable.has(coordinateKey(left))) continue;
    if (reserved.reservedReference.has(coordinateKey(left))) continue;
    const right = availableModuleByCoordinate.get(coordinateKey(left));
    if (!right || !moduleAvailable.has(coordinateKey(right))) continue;
    if (reserved.reservedModule.has(coordinateKey(right))) continue;
    referenceAvailable.delete(coordinateKey(left));
    moduleAvailable.delete(coordinateKey(right));
    pairs.push({ reference: [left], module: [right], evidence: new Set(['same-coordinate']) });
  }

  const remainingReference = reference.filter(verse => referenceAvailable.has(coordinateKey(verse)));
  const remainingModule = module.filter(verse => moduleAvailable.has(coordinateKey(verse)));
  for (const verse of remainingReference) {
    pairs.push({ reference: [verse], module: [], evidence: new Set(['unmatched']) });
  }
  for (const verse of remainingModule) {
    pairs.push({ reference: [], module: [verse], evidence: new Set(['unmatched']) });
  }

  pairs.sort((left, right) => {
    const leftReference = left.reference[0]?.ordinal ?? Number.MAX_SAFE_INTEGER;
    const rightReference = right.reference[0]?.ordinal ?? Number.MAX_SAFE_INTEGER;
    if (leftReference !== rightReference) return leftReference - rightReference;
    return (left.module[0]?.ordinal ?? Number.MAX_SAFE_INTEGER) - (right.module[0]?.ordinal ?? Number.MAX_SAFE_INTEGER);
  });

  const merged: DraftPair[] = [];
  for (const pair of pairs) {
    const containsEmpty = [...pair.reference, ...pair.module].some(verse => verse.empty);
    const previous = merged.at(-1);
    const canMergeWithPrevious = containsEmpty
      && previous != null
      && previous.reference.length > 0
      && previous.module.length > 0
      && pair.reference.length > 0
      && pair.module.length > 0
      && previous.reference.at(-1)!.ordinal + 1 === pair.reference[0].ordinal
      && previous.module.at(-1)!.ordinal + 1 === pair.module[0].ordinal;
    if (!canMergeWithPrevious) {
      merged.push(pair);
      continue;
    }
    previous.reference.push(...pair.reference);
    previous.module.push(...pair.module);
    for (const evidence of pair.evidence) previous.evidence.add(evidence);
    previous.evidence.add('empty-placeholder-adjacency');
  }
  return merged;
}

function entryKind(pair: DraftPair): VerseMapEntryKind {
  if (pair.reference.length > 0 && pair.module.length === 0) return 'unmatched-reference';
  if (pair.module.length > 0 && pair.reference.length === 0) return 'unmatched-module';
  if ([...pair.reference, ...pair.module].some(verse => verse.empty)) return 'empty-placeholder-group';
  if (pair.reference.length > 1 && pair.module.length === 1) return 'merged-in-module';
  if (pair.reference.length === 1 && pair.module.length > 1) return 'split-in-module';
  if (pair.reference.length > 1 || pair.module.length > 1) return 'many-to-many';
  return coordinateKey(pair.reference[0]) === coordinateKey(pair.module[0]) ? 'identity' : 'renumbered';
}

function confidenceFor(pair: DraftPair): VerseMapConfidence {
  if (pair.evidence.has('unmatched') || pair.evidence.has('ordinal-alignment') || pair.evidence.has('empty-placeholder-adjacency')) {
    return 'low';
  }
  if (pair.evidence.has('exact-text') || pair.evidence.has('exact-concatenated-text')
    || pair.evidence.has('known-versification') || pair.evidence.has('declared-verse-range')) {
    return 'high';
  }
  return 'medium';
}

function pairBookIndex(pair: DraftPair): number {
  return pair.reference[0]?.bookIndex ?? pair.module[0]?.bookIndex ?? 0;
}

function groupSignature(entry: VerseMapEntry, autoConfirmed: boolean): string {
  const reference = entry.reference[0];
  const module = entry.module[0];
  const delta = reference && module && entry.reference.length === 1 && entry.module.length === 1
    ? `${module.chapter - reference.chapter}:${module.verse - reference.verse}`
    : 'complex';
  return [
    reference?.bookIndex ?? module?.bookIndex ?? 0,
    entry.kind,
    delta,
    autoConfirmed ? 'auto' : 'review'
  ].join('|');
}

function hasSameCoordinateSequence(entry: VerseMapEntry): boolean {
  return entry.reference.length === entry.module.length
    && entry.reference.length > 0
    && entry.reference.every((location, index) => coordinateKey(location) === coordinateKey(entry.module[index]));
}

export function canConfirmAutomatically(entry: VerseMapEntry): boolean {
  if ((entry.evidence.includes('known-versification') || entry.evidence.includes('declared-verse-range'))
    && entry.reference.length > 0 && entry.module.length > 0) return true;
  if (!hasSameCoordinateSequence(entry)) return false;
  if (entry.kind === 'identity') return true;
  return entry.kind === 'empty-placeholder-group'
    && entry.evidence.includes('empty-placeholder-adjacency')
    && entry.reference.some(location => !location.empty)
    && entry.module.some(location => !location.empty);
}

function weakestConfidence(entries: VerseMapEntry[]): VerseMapConfidence {
  if (entries.some(entry => entry.confidence === 'low')) return 'low';
  if (entries.some(entry => entry.confidence === 'medium')) return 'medium';
  return 'high';
}

function groupSpan(entries: VerseMapEntry[], side: 'reference' | 'module'): { start?: string; end?: string } {
  const locations = entries.flatMap(entry => entry[side]);
  return {
    start: locations[0] ? formatLocation(locations[0]) : undefined,
    end: locations.at(-1) ? formatLocation(locations.at(-1)!) : undefined
  };
}

function createEntriesAndGroups(
  reference: VerseSourceData,
  module: VerseSourceData,
  knownVersification?: KnownVersification
): {
  entries: VerseMapEntry[];
  reviewGroups: VerseMapReviewGroup[];
} {
  const bookIndexes = [...new Set([...reference.versesByBook.keys(), ...module.versesByBook.keys()])]
    .sort((left, right) => left - right);
  const draftPairs: DraftPair[] = [];
  for (const bookIndex of bookIndexes) {
    const referenceBook = reference.versesByBook.get(bookIndex) ?? [];
    const moduleBook = module.versesByBook.get(bookIndex) ?? [];
    if (referenceBook.length === 0) {
      for (const verse of moduleBook) draftPairs.push({ reference: [], module: [verse], evidence: new Set(['unmatched']) });
    } else if (moduleBook.length === 0) {
      for (const verse of referenceBook) draftPairs.push({ reference: [verse], module: [], evidence: new Set(['unmatched']) });
    } else {
      draftPairs.push(...pairBook(
        referenceBook,
        moduleBook,
        knownVersification?.relationsByBook.get(bookIndex) ?? []
      ));
    }
  }
  draftPairs.sort((left, right) => {
    const bookDifference = pairBookIndex(left) - pairBookIndex(right);
    if (bookDifference !== 0) return bookDifference;
    const referenceDifference = (left.reference[0]?.ordinal ?? Number.MAX_SAFE_INTEGER)
      - (right.reference[0]?.ordinal ?? Number.MAX_SAFE_INTEGER);
    if (referenceDifference !== 0) return referenceDifference;
    return (left.module[0]?.ordinal ?? Number.MAX_SAFE_INTEGER) - (right.module[0]?.ordinal ?? Number.MAX_SAFE_INTEGER);
  });

  const entries: VerseMapEntry[] = draftPairs.map((pair, index) => ({
    id: `m${String(index + 1).padStart(6, '0')}`,
    reviewGroupId: '',
    kind: entryKind(pair),
    confidence: confidenceFor(pair),
    evidence: [...pair.evidence].sort(),
    reference: pair.reference.map(publicLocation),
    module: pair.module.map(publicLocation)
  }));

  const reviewGroups: VerseMapReviewGroup[] = [];
  let groupEntries: VerseMapEntry[] = [];
  let signature = '';
  function finishGroup(): void {
    if (groupEntries.length === 0) return;
    const id = `g${String(reviewGroups.length + 1).padStart(5, '0')}`;
    for (const entry of groupEntries) entry.reviewGroupId = id;
    const referenceSpan = groupSpan(groupEntries, 'reference');
    const moduleSpan = groupSpan(groupEntries, 'module');
    const autoConfirmed = groupEntries.every(entry => canConfirmAutomatically(entry));
    reviewGroups.push({
      id,
      status: autoConfirmed ? 'confirmed' : 'candidate',
      autoConfirmed,
      allowNonMonotonic: groupEntries.some(entry => entry.evidence.includes('known-versification-skip-check')),
      kind: groupEntries[0].kind,
      confidence: weakestConfidence(groupEntries),
      evidence: [...new Set(groupEntries.flatMap(entry => entry.evidence))].sort(),
      bookIndex: groupEntries[0].reference[0]?.bookIndex ?? groupEntries[0].module[0]?.bookIndex ?? 0,
      entryCount: groupEntries.length,
      firstEntryId: groupEntries[0].id,
      lastEntryId: groupEntries.at(-1)!.id,
      referenceStart: referenceSpan.start,
      referenceEnd: referenceSpan.end,
      moduleStart: moduleSpan.start,
      moduleEnd: moduleSpan.end
    });
    groupEntries = [];
  }
  for (const entry of entries) {
    const nextSignature = groupSignature(entry, canConfirmAutomatically(entry));
    if (groupEntries.length > 0 && signature !== nextSignature) finishGroup();
    signature = nextSignature;
    groupEntries.push(entry);
  }
  finishGroup();
  return { entries, reviewGroups };
}

function coverage(expected: Set<string>, mapped: Set<string>): VerseMapCoverage {
  const missing = [...expected].filter(key => !mapped.has(key));
  return {
    totalRows: expected.size,
    mappedRows: expected.size - missing.length,
    missingRows: missing.length,
    percent: expected.size === 0 ? 100 : Number((((expected.size - missing.length) / expected.size) * 100).toFixed(4)),
    missingExamples: missing.slice(0, MAX_VALIDATION_EXAMPLES).map(key => {
      const [bookIndex, chapter, verse] = key.split(':');
      return `${bookIndex} ${chapter}:${verse}`;
    })
  };
}

function validateScope(
  document: Pick<VerseMapDocument, 'entries' | 'reviewGroups'>,
  reference: VerseSourceData,
  module: VerseSourceData,
  includeGroup: (status: VerseMapReviewStatus) => boolean
): VerseMapScopeValidation {
  const groupsById = new Map(document.reviewGroups.map(group => [group.id, group]));
  const includedGroups = document.reviewGroups.filter(group => includeGroup(group.status));
  const includedGroupIds = new Set(includedGroups.map(group => group.id));
  const entriesWithUnknownReviewGroup = document.entries.filter(entry => !groupsById.has(entry.reviewGroupId)).length;
  const entries = document.entries.filter(entry => includedGroupIds.has(entry.reviewGroupId));
  const referenceExpected = new Set(reference.versesByKey.keys());
  const moduleExpected = new Set(module.versesByKey.keys());
  const mappedReference = new Set<string>();
  const mappedModule = new Set<string>();
  const referenceAssignments = new Map<string, number>();
  const moduleAssignments = new Map<string, number>();
  const referenceToModule = new Map<string, Set<string>>();
  const moduleToReference = new Map<string, Set<string>>();
  let invalidReferenceLocations = 0;
  let invalidModuleLocations = 0;
  let crossBookEntries = 0;
  let unmatchedReferenceRows = 0;
  let unmatchedModuleRows = 0;
  let oneToOneEntries = 0;
  let manyToOneEntries = 0;
  let oneToManyEntries = 0;
  let manyToManyEntries = 0;
  let emptyPlaceholderEntries = 0;

  for (const entry of entries) {
    const referenceKeys = entry.reference.map(coordinateKey);
    const moduleKeys = entry.module.map(coordinateKey);
    for (const key of referenceKeys) if (!referenceExpected.has(key)) invalidReferenceLocations++;
    for (const key of moduleKeys) if (!moduleExpected.has(key)) invalidModuleLocations++;
    const books = new Set([...entry.reference, ...entry.module].map(location => location.bookIndex));
    if (books.size > 1) crossBookEntries++;
    if (moduleKeys.length === 0) unmatchedReferenceRows += referenceKeys.length;
    if (referenceKeys.length === 0) unmatchedModuleRows += moduleKeys.length;
    if (referenceKeys.length > 0 && moduleKeys.length > 0) {
      if (referenceKeys.length === 1 && moduleKeys.length === 1) oneToOneEntries++;
      else if (referenceKeys.length > 1 && moduleKeys.length === 1) manyToOneEntries++;
      else if (referenceKeys.length === 1 && moduleKeys.length > 1) oneToManyEntries++;
      else manyToManyEntries++;
      if ([...entry.reference, ...entry.module].some(location => location.empty)) emptyPlaceholderEntries++;
      for (const referenceKey of referenceKeys) {
        mappedReference.add(referenceKey);
        referenceAssignments.set(referenceKey, (referenceAssignments.get(referenceKey) ?? 0) + 1);
        const targets = referenceToModule.get(referenceKey) ?? new Set<string>();
        for (const moduleKey of moduleKeys) targets.add(moduleKey);
        referenceToModule.set(referenceKey, targets);
      }
      for (const moduleKey of moduleKeys) {
        mappedModule.add(moduleKey);
        moduleAssignments.set(moduleKey, (moduleAssignments.get(moduleKey) ?? 0) + 1);
        const targets = moduleToReference.get(moduleKey) ?? new Set<string>();
        for (const referenceKey of referenceKeys) targets.add(referenceKey);
        moduleToReference.set(moduleKey, targets);
      }
    }
  }

  const duplicateReferenceAssignments = [...referenceAssignments.values()].filter(count => count > 1)
    .reduce((sum, count) => sum + count - 1, 0);
  const duplicateModuleAssignments = [...moduleAssignments.values()].filter(count => count > 1)
    .reduce((sum, count) => sum + count - 1, 0);
  let roundTripFailures = 0;
  for (const [referenceKey, moduleKeys] of referenceToModule) {
    if ([...moduleKeys].some(moduleKey => !moduleToReference.get(moduleKey)?.has(referenceKey))) roundTripFailures++;
  }
  for (const [moduleKey, referenceKeys] of moduleToReference) {
    if ([...referenceKeys].some(referenceKey => !referenceToModule.get(referenceKey)?.has(moduleKey))) roundTripFailures++;
  }

  const referenceOrdinal = new Map<string, number>();
  const moduleOrdinal = new Map<string, number>();
  for (const verses of reference.versesByBook.values()) for (const verse of verses) referenceOrdinal.set(coordinateKey(verse), verse.ordinal);
  for (const verses of module.versesByBook.values()) for (const verse of verses) moduleOrdinal.set(coordinateKey(verse), verse.ordinal);
  let reverseOrderTransitions = 0;
  let allowedNonMonotonicTransitions = 0;
  for (const bookIndex of new Set([...reference.versesByBook.keys(), ...module.versesByBook.keys()])) {
    const ordered = entries.flatMap(entry => {
      if (entry.reference.length === 0 || entry.module.length === 0) return [];
      if (entry.reference.some(location => location.bookIndex !== bookIndex)) return [];
      if (entry.module.some(location => location.bookIndex !== bookIndex)) return [];
      const referenceOrdinals = entry.reference.map(location => referenceOrdinal.get(coordinateKey(location))).filter(Number.isFinite) as number[];
      const moduleOrdinals = entry.module.map(location => moduleOrdinal.get(coordinateKey(location))).filter(Number.isFinite) as number[];
      if (referenceOrdinals.length === 0 || moduleOrdinals.length === 0) return [];
      return [{
        reviewGroupId: entry.reviewGroupId,
        referenceMin: Math.min(...referenceOrdinals),
        moduleMin: Math.min(...moduleOrdinals),
        moduleMax: Math.max(...moduleOrdinals)
      }];
    }).sort((left, right) => left.referenceMin - right.referenceMin);
    let previous: typeof ordered[number] | undefined;
    for (const item of ordered) {
      if (previous && item.moduleMin < previous.moduleMin) {
        const allowed = groupsById.get(previous.reviewGroupId)?.allowNonMonotonic === true
          || groupsById.get(item.reviewGroupId)?.allowNonMonotonic === true;
        if (allowed) allowedNonMonotonicTransitions++;
        else reverseOrderTransitions++;
      }
      previous = item;
    }
  }

  const referenceCoverage = coverage(referenceExpected, mappedReference);
  const moduleCoverage = coverage(moduleExpected, mappedModule);
  const isCompleteAndConsistent = referenceCoverage.missingRows === 0
    && moduleCoverage.missingRows === 0
    && invalidReferenceLocations === 0
    && invalidModuleLocations === 0
    && duplicateReferenceAssignments === 0
    && duplicateModuleAssignments === 0
    && crossBookEntries === 0
    && reverseOrderTransitions === 0
    && roundTripFailures === 0
    && unmatchedReferenceRows === 0
    && unmatchedModuleRows === 0
    && entriesWithUnknownReviewGroup === 0;
  return {
    groups: includedGroups.length,
    entries: entries.length,
    referenceCoverage,
    moduleCoverage,
    invalidReferenceLocations,
    invalidModuleLocations,
    duplicateReferenceAssignments,
    duplicateModuleAssignments,
    crossBookEntries,
    reverseOrderTransitions,
    allowedNonMonotonicTransitions,
    roundTripFailures,
    unmatchedReferenceRows,
    unmatchedModuleRows,
    oneToOneEntries,
    manyToOneEntries,
    oneToManyEntries,
    manyToManyEntries,
    emptyPlaceholderEntries,
    entriesWithUnknownReviewGroup,
    isCompleteAndConsistent
  };
}

function validateDocumentWithSources(
  document: Pick<VerseMapDocument, 'reference' | 'module' | 'entries' | 'reviewGroups'>,
  reference: VerseSourceData,
  module: VerseSourceData
): VerseMapValidation {
  return {
    validatedAt: new Date().toISOString(),
    sourceChecks: {
      referenceFingerprintMatches: document.reference.sha256 === reference.descriptor.sha256,
      moduleFingerprintMatches: document.module.sha256 === module.descriptor.sha256,
      referencePath: reference.descriptor.path,
      modulePath: module.descriptor.path
    },
    candidateAndConfirmed: validateScope(document, reference, module, status => status !== 'rejected'),
    confirmedOnly: validateScope(document, reference, module, status => status === 'confirmed')
  };
}

function loadKnownVersification(
  reference: VerseSourceData,
  explicitManifestPath?: string
): KnownVersification | undefined {
  const manifestPath = explicitManifestPath
    ? path.resolve(explicitManifestPath)
    : path.join(path.dirname(reference.descriptor.path), 'manifest.xml');
  if (!fs.existsSync(manifestPath)) {
    if (explicitManifestPath) throw new Error(`Reference differences manifest was not found: ${manifestPath}`);
    return undefined;
  }
  const legacy = readLegacyVerseMappings(manifestPath);
  if (legacy.moduleId.trim().toLowerCase() !== reference.descriptor.moduleId.trim().toLowerCase()) {
    if (explicitManifestPath) {
      throw new Error(
        `Reference differences manifest belongs to '${legacy.moduleId}', but the comparison module is '${reference.descriptor.moduleId}'.`
      );
    }
    return undefined;
  }
  const relationsByBook = new Map<number, LegacyVerseRelation[]>();
  for (const relation of legacy.relations) {
    relationsByBook.set(relation.module.bookIndex, [
      ...(relationsByBook.get(relation.module.bookIndex) ?? []),
      relation
    ]);
  }
  return { manifestPath, relationsByBook };
}

export async function createVerseMapDraft(options: CreateVerseMapOptions): Promise<VerseMapDocument> {
  const reference = await readVerseMapSource(options.referencePath);
  const module = await readVerseMapSource(options.modulePath);
  const knownVersification = loadKnownVersification(reference, options.referenceDifferencesManifestPath);
  const generated = createEntriesAndGroups(reference, module, knownVersification);
  const baseDocument = {
    schemaVersion: MAP_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    reference: reference.descriptor,
    module: module.descriptor,
    reviewGroups: generated.reviewGroups,
    entries: generated.entries,
    notes: [
      'Direct same-coordinate mappings and unambiguous adjacent empty placeholders are confirmed automatically.',
      knownVersification
        ? `Known comparison-module versification is applied from ${knownVersification.manifestPath}.`
        : 'No known comparison-module versification manifest was applied.',
      'Only structural holes, renumbering, merges, splits, and other ambiguous passages remain candidates for manual review.',
      'Exact-text evidence compares normalized text internally; verse bodies and normalized hashes are not stored in this map.',
      'The confirmedOnly validation scope is the only scope intended for neutral VerseId search mappings.'
    ]
  };
  return {
    ...baseDocument,
    validation: validateDocumentWithSources(baseDocument, reference, module)
  };
}

export async function validateVerseMapDocument(
  document: VerseMapDocument,
  options: ValidateVerseMapOptions = {}
): Promise<VerseMapValidation> {
  if (document.schemaVersion !== MAP_SCHEMA_VERSION) {
    throw new Error(`Unsupported verse map schema version ${document.schemaVersion}. Expected ${MAP_SCHEMA_VERSION}.`);
  }
  const reference = await readVerseMapSource(options.referencePath ?? document.reference.path);
  const module = await readVerseMapSource(options.modulePath ?? document.module.path);
  return validateDocumentWithSources(document, reference, module);
}

export function readVerseMapDocument(filePath: string): VerseMapDocument {
  const document = JSON.parse(fs.readFileSync(path.resolve(filePath), 'utf8')) as VerseMapDocument;
  if (!document || !Array.isArray(document.entries) || !Array.isArray(document.reviewGroups)) {
    throw new Error(`${path.resolve(filePath)} is not a BibleNote verse map document.`);
  }
  return document;
}
