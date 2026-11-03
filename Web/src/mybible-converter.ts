import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import JSZip from 'jszip';
import { bibleNoteBookIndexFromMyBible } from './mybible-analyzer.js';
import { DEFAULT_VERSE_ID_REGISTRY } from './verse-id.js';

export type ConvertMyBibleOptions = {
  biblePath: string;
  referenceManifestPath: string;
  outputPath: string;
  shortName: string;
  footnotesPath?: string | false;
  requireResolvedFootnotes?: boolean;
  preserveAllFootnotes?: boolean;
  directMappingsPath?: string;
  coordinateReferenceModule?: string;
  verseIdRegistry?: string;
  allowUnmappedPreview?: boolean;
  force?: boolean;
};

export type ConvertMyBibleSummary = {
  outputPath: string;
  backupPath?: string;
  shortName: string;
  displayName: string;
  books: number;
  chapters: number;
  verses: number;
  styledVerseRows: number;
  strongMarkerOccurrences: number;
  paragraphBreakOccurrences: number;
  footnotesEmbedded: number;
  footnoteMarkersUnresolved: number;
  footnoteRecordsSource: number;
  footnoteRecordsPreserved: number;
  unmarkedFootnotesEmbedded: number;
  malformedMarkupRowsRecovered: number;
  directMappingsEmbedded: boolean;
  mappingStatus: 'verse-id-mapped' | 'preview-unmapped';
  sourceSha256: string;
};

type SourceBook = { sourceBookNumber: number; bookIndex: number; shortName: string; longName: string };
type SourceVerse = { sourceBookNumber: number; bookIndex: number; chapter: number; verse: number; text: string };
type Footnote = { sourceBookNumber: number; chapter: number; verse: number; endChapter: number; endVerse: number; marker: string; text: string };

type ConversionCounters = {
  styledVerseRows: number;
  strongMarkerOccurrences: number;
  paragraphBreakOccurrences: number;
  footnotesEmbedded: number;
  footnoteMarkersUnresolved: number;
  malformedMarkupRowsRecovered: number;
};

function sha256(filePath: string): string {
  return createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function xmlEscape(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function decodeEntities(value: string): string {
  return value
    .replace(/&#(\d+);/g, (_match, number: string) => String.fromCodePoint(Number(number)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, number: string) => String.fromCodePoint(Number.parseInt(number, 16)))
    .replaceAll('&nbsp;', '\u00a0')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&amp;', '&');
}

function infoTable(db: Database.Database): Record<string, string> {
  const tables = new Set((db.prepare(`SELECT lower(name) name FROM sqlite_master WHERE type='table'`).all() as Array<{ name: string }>).map(row => row.name));
  if (!tables.has('info')) return {};
  return Object.fromEntries((db.prepare('SELECT name, value FROM info').all() as Array<{ name: unknown; value: unknown }>)
    .filter(row => row.name != null)
    .map(row => [String(row.name), row.value == null ? '' : String(row.value)]));
}

function readBibleSource(filePath: string): { metadata: Record<string, string>; books: SourceBook[]; verses: SourceVerse[] } {
  const db = new Database(path.resolve(filePath), { readonly: true, fileMustExist: true });
  db.pragma('query_only = ON');
  try {
    const tables = new Set((db.prepare(`SELECT lower(name) name FROM sqlite_master WHERE type='table'`).all() as Array<{ name: string }>).map(row => row.name));
    if (!tables.has('books') || !tables.has('verses')) throw new Error('The input is not a MyBible Bible module (books/verses tables are required).');
    const books = (db.prepare('SELECT book_number, short_name, long_name FROM books ORDER BY book_number').all() as Array<Record<string, unknown>>)
      .flatMap(row => {
        const sourceBookNumber = Number(row.book_number);
        const bookIndex = bibleNoteBookIndexFromMyBible(sourceBookNumber);
        return bookIndex == null ? [] : [{
          sourceBookNumber,
          bookIndex,
          shortName: String(row.short_name ?? '').trim(),
          longName: String(row.long_name ?? '').trim()
        }];
      });
    const bySourceBook = new Map(books.map(book => [book.sourceBookNumber, book.bookIndex]));
    const verses = (db.prepare('SELECT book_number, chapter, verse, text FROM verses ORDER BY book_number, chapter, verse').all() as Array<Record<string, unknown>>)
      .flatMap(row => {
        const sourceBookNumber = Number(row.book_number);
        const bookIndex = bySourceBook.get(sourceBookNumber);
        if (bookIndex == null) return [];
        const chapter = Number(row.chapter);
        const verse = Number(row.verse);
        if (!Number.isInteger(chapter) || chapter < 1 || !Number.isInteger(verse) || verse < 1) return [];
        return [{ sourceBookNumber, bookIndex, chapter, verse, text: String(row.text ?? '') }];
      });
    return { metadata: infoTable(db), books, verses };
  } finally {
    db.close();
  }
}

function discoverFootnotes(biblePath: string): string | undefined {
  const extension = path.extname(biblePath);
  const candidate = biblePath.slice(0, -extension.length) + '.commentaries' + extension;
  return fs.existsSync(candidate) ? candidate : undefined;
}

function readFootnotes(filePath?: string): Footnote[] {
  if (!filePath) return [];
  const db = new Database(path.resolve(filePath), { readonly: true, fileMustExist: true });
  db.pragma('query_only = ON');
  try {
    const metadata = infoTable(db);
    if (!/^(?:1|true|yes)$/i.test(metadata.is_footnotes?.trim() ?? '')) {
      throw new Error(`${path.resolve(filePath)} is a commentary module, not a footnotes companion.`);
    }
    return (db.prepare(`
      SELECT book_number, chapter_number_from, verse_number_from, chapter_number_to, verse_number_to, marker, text
      FROM commentaries
      ORDER BY book_number, chapter_number_from, verse_number_from, marker
    `).all() as Array<Record<string, unknown>>).map(row => ({
      sourceBookNumber: Number(row.book_number),
      chapter: Number(row.chapter_number_from),
      verse: Number(row.verse_number_from),
      endChapter: Number(row.chapter_number_to) || Number(row.chapter_number_from),
      endVerse: Number(row.verse_number_to) || Number(row.verse_number_from),
      marker: String(row.marker ?? '').trim(),
      text: String(row.text ?? '')
    }));
  } finally {
    db.close();
  }
}

function markerKey(sourceBookNumber: number, chapter: number, verse: number, marker: string): string {
  return `${sourceBookNumber}:${chapter}:${verse}:${decodeEntities(marker).trim()}`;
}

function bookMarkerKey(sourceBookNumber: number, marker: string): string {
  return `${sourceBookNumber}:${decodeEntities(marker).trim()}`;
}

function footnoteResolver(footnotes: Footnote[]): (book: number, chapter: number, verse: number, marker: string) => Footnote | undefined {
  const exact = new Map<string, Footnote>();
  const byBookMarker = new Map<string, Footnote[]>();
  for (const footnote of footnotes) {
    exact.set(markerKey(footnote.sourceBookNumber, footnote.chapter, footnote.verse, footnote.marker), footnote);
    const key = bookMarkerKey(footnote.sourceBookNumber, footnote.marker);
    byBookMarker.set(key, [...(byBookMarker.get(key) ?? []), footnote]);
  }
  return (book, chapter, verse, marker) => {
    const direct = exact.get(markerKey(book, chapter, verse, marker));
    if (direct) return direct;
    const candidates = byBookMarker.get(bookMarkerKey(book, marker));
    const ranged = candidates?.filter(note =>
      (chapter > note.chapter || (chapter === note.chapter && verse >= note.verse)) &&
      (chapter < note.endChapter || (chapter === note.endChapter && verse <= note.endVerse))
    );
    if (ranged?.length === 1) return ranged[0];
    if (ranged && ranged.length > 1) return undefined;
    return candidates?.length === 1 ? candidates[0] : undefined;
  };
}

type OpenTag = { source: string; open: string; close: string; skip: boolean };

function footnoteTextXml(xml: string): string {
  // NOTE's legacy XML model stores text and styled children separately. Plain text keeps
  // their original order in every supported reader; the original markup is archived separately.
  return xml.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, (_match, text: string) => xmlEscape(text))
    .replace(/<BR\b[^>]*\/\s*>/gi, '\n').replace(/<[^>]+>/g, '');
}

function convertedMarkup(
  input: string,
  context: { sourceBookNumber: number; chapter: number; verse: number },
  resolveFootnote: ReturnType<typeof footnoteResolver>,
  counters: ConversionCounters,
  allowFootnotes = true
): { xml: string; recovered: boolean; styled: boolean } {
  const cleanedInput = input.replace(/<\/?(?:pb|p|br|i|j|b|t|n|e|s|u|sup|sub)\b[^>]*$/i, '');
  const embeddedNotes: string[] = [];
  const withPlaceholders = allowFootnotes
    ? cleanedInput.replace(/<f\b[^>]*>([\s\S]*?)<\/f\s*>/gi, (_match, rawMarker: string) => {
        const marker = decodeEntities(rawMarker.replace(/<[^>]+>/g, '')).trim();
        const footnote = resolveFootnote(context.sourceBookNumber, context.chapter, context.verse, marker);
        let noteBody: string;
        if (footnote) {
          counters.footnotesEmbedded++;
          noteBody = footnoteTextXml(convertedMarkup(footnote.text, context, resolveFootnote, counters, false).xml);
        } else {
          counters.footnoteMarkersUnresolved++;
          noteBody = xmlEscape(marker);
        }
        embeddedNotes.push(`<NOTE type="x-studynote" ex="${xmlEscape(marker)}">${noteBody}</NOTE>`);
        return `\uE000${embeddedNotes.length - 1}\uE001`;
      })
    : cleanedInput;
  const tagPattern = /<\/?([A-Za-z][\w-]*)(?:\s[^>]*)?\/?>/g;
  const stack: OpenTag[] = [];
  let recovered = cleanedInput !== input;
  let styled = false;
  let result = '';
  let cursor = 0;
  let skipDepth = 0;
  const outsideStyles = (xml: string) => [...stack].reverse().map(tag => tag.close).join('')
    + xml + stack.map(tag => tag.open).join('');
  const appendText = (value: string) => {
    if (skipDepth > 0 || !value) return;
    const escaped = xmlEscape(decodeEntities(value));
    // XmlSerializer discards whitespace-only text nodes, even with xml:space="preserve".
    // CDATA keeps separators between adjacent styles, breaks and note markers as text.
    const appendFragment = (fragment: string) => {
      if (fragment) result += /^\s+$/.test(fragment) ? `<![CDATA[${fragment}]]>` : fragment;
    };
    let offset = 0;
    for (const marker of escaped.matchAll(/\uE000(\d+)\uE001/g)) {
      appendFragment(escaped.slice(offset, marker.index));
      result += outsideStyles(embeddedNotes[Number(marker[1])] ?? '');
      offset = marker.index! + marker[0].length;
    }
    appendFragment(escaped.slice(offset));
  };
  for (const match of withPlaceholders.matchAll(tagPattern)) {
    appendText(withPlaceholders.slice(cursor, match.index));
    cursor = (match.index ?? 0) + match[0].length;
    const source = match[1].toLowerCase();
    const closing = /^<\//.test(match[0]);
    const selfClosing = /\/\s*>$/.test(match[0]) || source === 'br' || source === 'pb';
    if (closing) {
      const found = stack.map(item => item.source).lastIndexOf(source);
      if (found < 0) {
        recovered = true;
        continue;
      }
      if (found !== stack.length - 1) recovered = true;
      while (stack.length > found) {
        const open = stack.pop();
        if (open?.skip) skipDepth--;
        else if (skipDepth === 0) result += open?.close ?? '';
      }
      continue;
    }
    if (source === 'br' || source === 'pb') {
      if (skipDepth === 0) result += outsideStyles(`<BR art="${source === 'pb' ? 'x-p' : 'x-nl'}" />`);
      if (source === 'pb') counters.paragraphBreakOccurrences++;
      continue;
    }
    let opening = '';
    let close = '';
    let skip = false;
    switch (source) {
      case 's':
        skip = true;
        counters.strongMarkerOccurrences++;
        break;
      case 'i': opening = '<STYLE fs="italic">'; close = '</STYLE>'; styled = true; break;
      case 'b': case 'h': opening = '<STYLE fs="bold">'; close = '</STYLE>'; styled = true; break;
      case 'u': opening = '<STYLE fs="underline">'; close = '</STYLE>'; styled = true; break;
      case 'e': opening = '<STYLE fs="emphasis">'; close = '</STYLE>'; styled = true; break;
      case 'j': opening = '<STYLE id="mybible-words-of-jesus">'; close = '</STYLE>'; styled = true; break;
      case 't': opening = '<STYLE id="mybible-translator-added" fs="italic">'; close = '</STYLE>'; styled = true; break;
      case 'n': opening = '<STYLE id="mybible-special-text">'; close = '</STYLE>'; styled = true; break;
      case 'sup': opening = '<SUP art="x-sup">'; close = '</SUP>'; styled = true; break;
      case 'sub': opening = '<SUP art="x-sub">'; close = '</SUP>'; styled = true; break;
      default: break;
    }
    if (skip) skipDepth++;
    else if (skipDepth === 0) result += opening;
    if (!selfClosing) stack.push({ source, open: opening, close, skip });
  }
  appendText(withPlaceholders.slice(cursor));
  if (stack.length > 0) recovered = true;
  while (stack.length > 0) {
    const open = stack.pop();
    if (open?.skip) skipDepth--;
    else if (skipDepth === 0) result += open?.close ?? '';
  }
  return { xml: result.trim(), recovered, styled };
}

function replaceOrAddAttribute(openingTag: string, name: string, value: string): string {
  const encoded = xmlEscape(value);
  const expression = new RegExp(`\\s${name}="[^"]*"`, 'i');
  return expression.test(openingTag)
    ? openingTag.replace(expression, ` ${name}="${encoded}"`)
    : openingTag.replace(/>$/, ` ${name}="${encoded}">`);
}

function buildManifest(
  referenceManifest: string,
  options: { shortName: string; displayName: string; locale: string; description: string; books: SourceBook[]; directMappings?: string }
): string {
  let manifest = referenceManifest.replace(/\s*<BibleDirectVerseMappings\b[\s\S]*?<\/BibleDirectVerseMappings\s*>/gi, '');
  manifest = manifest.replace(
    /<BibleTranslationDifferences\b[^>]*(?:\/\s*>|>[\s\S]*?<\/BibleTranslationDifferences\s*>)/i,
    '<BibleTranslationDifferences />'
  );
  manifest = manifest.replace(/<BibleNoteModule\b[^>]*>/i, root => {
    let updated = replaceOrAddAttribute(root, 'ShortName', options.shortName);
    updated = replaceOrAddAttribute(updated, 'Name', options.displayName);
    updated = replaceOrAddAttribute(updated, 'Locale', options.locale);
    return replaceOrAddAttribute(updated, 'Description', options.description);
  });
  for (const book of options.books) {
    const expression = new RegExp(`(<BibleBook\\b[^>]*\\bIndex="${book.bookIndex}"[^>]*>)([\\s\\S]*?)(<\\/BibleBook\\s*>)`, 'i');
    manifest = manifest.replace(expression, (_whole, opening: string, content: string, closing: string) => {
      let updatedOpening = replaceOrAddAttribute(opening, 'Name', book.longName || book.shortName);
      updatedOpening = replaceOrAddAttribute(updatedOpening, 'ShortName', book.shortName || book.longName);
      const abbreviation = book.shortName.trim();
      const hasAbbreviation = [...content.matchAll(/<Abbreviation\b[^>]*>([\s\S]*?)<\/Abbreviation\s*>/gi)]
        .some(match => decodeEntities(match[1].replace(/<[^>]+>/g, '')).trim().toLocaleLowerCase() === abbreviation.toLocaleLowerCase());
      const updatedContent = abbreviation && !hasAbbreviation
        ? `${content.replace(/\s*$/, '')}\n      <Abbreviation>${xmlEscape(abbreviation)}</Abbreviation>\n    `
        : content;
      return updatedOpening + updatedContent + closing;
    });
  }
  const includedBooks = new Set(options.books.map(book => book.bookIndex));
  manifest = manifest.replace(/<BibleBook\b[^>]*\bIndex="(\d+)"[^>]*>[\s\S]*?<\/BibleBook\s*>/gi,
    (element, index: string) => includedBooks.has(Number(index)) ? element : '');
  const alphabet = [...new Set(options.books.flatMap(book => [...`${book.longName}${book.shortName}`]).filter(character => /\p{L}/u.test(character)))].join('');
  manifest = manifest.replace(/<BibleStructure\b[^>]*>/i, opening => replaceOrAddAttribute(opening, 'Alphabet', alphabet));
  if (options.directMappings) {
    manifest = manifest.replace(/\s*<BibleStructure\b/i, `\n  ${options.directMappings.trim().replace(/\n/g, '\n  ')}\n  <BibleStructure`);
  }
  return manifest.endsWith('\n') ? manifest : `${manifest}\n`;
}

function buildBibleXml(
  source: ReturnType<typeof readBibleSource>,
  resolveFootnote: ReturnType<typeof footnoteResolver>,
  counters: ConversionCounters,
  footnotes: Footnote[],
  usedFootnotes: Set<Footnote>,
  preserveAllFootnotes: boolean
): string {
  const convertedVerses = new Map<SourceVerse, string>();
  for (const verse of source.verses) {
    const converted = convertedMarkup(verse.text, verse, resolveFootnote, counters);
    if (converted.recovered) counters.malformedMarkupRowsRecovered++;
    if (converted.styled) counters.styledVerseRows++;
    convertedVerses.set(verse, converted.xml);
  }
  if (preserveAllFootnotes) {
    const versesByBook = new Map<number, SourceVerse[]>();
    for (const verse of source.verses) {
      const rows = versesByBook.get(verse.sourceBookNumber) ?? [];
      rows.push(verse);
      versesByBook.set(verse.sourceBookNumber, rows);
    }
    for (const footnote of footnotes) {
      if (usedFootnotes.has(footnote)) continue;
      const rows = versesByBook.get(footnote.sourceBookNumber) ?? [];
      const anchor = rows.find(verse => verse.chapter === footnote.chapter && verse.verse === footnote.verse)
        ?? rows.find(verse => verse.chapter === footnote.endChapter && verse.verse === footnote.endVerse)
        ?? rows.find(verse =>
          (verse.chapter > footnote.chapter || (verse.chapter === footnote.chapter && verse.verse >= footnote.verse))
          && (verse.chapter < footnote.endChapter || (verse.chapter === footnote.endChapter && verse.verse <= footnote.endVerse)));
      if (!anchor) throw new Error(`Cannot preserve footnote ${footnote.sourceBookNumber} ${footnote.chapter}:${footnote.verse} ${footnote.marker}: no verse in its source range.`);
      const body = footnoteTextXml(convertedMarkup(footnote.text, anchor, resolveFootnote, counters, false).xml);
      convertedVerses.set(anchor, convertedVerses.get(anchor) + `<NOTE type="x-studynote" ex="${xmlEscape(footnote.marker || '[*]')}">${body}</NOTE>`);
      counters.footnotesEmbedded++;
      usedFootnotes.add(footnote);
    }
  }
  const books = new Map<number, Map<number, SourceVerse[]>>();
  for (const verse of source.verses) {
    const chapters = books.get(verse.bookIndex) ?? new Map<number, SourceVerse[]>();
    chapters.set(verse.chapter, [...(chapters.get(verse.chapter) ?? []), verse]);
    books.set(verse.bookIndex, chapters);
  }
  const lines = [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<XMLBIBLE xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema">',
    '  <INFORMATION>',
    `    <title>${xmlEscape(source.metadata.description?.trim() || 'MyBible module')}</title>`,
    `    <language>${xmlEscape(source.metadata.language?.trim() || '')}</language>`,
    '  </INFORMATION>'
  ];
  for (const book of source.books.sort((left, right) => left.bookIndex - right.bookIndex)) {
    const chapters = books.get(book.bookIndex);
    if (!chapters) continue;
    lines.push(`  <BIBLEBOOK bnumber="${book.bookIndex}" bname="${xmlEscape(book.longName)}" bsname="${xmlEscape(book.shortName)}">`);
    for (const [chapter, verses] of [...chapters].sort(([left], [right]) => left - right)) {
      lines.push(`    <CHAPTER cnumber="${chapter}">`);
      for (const verse of verses.sort((left, right) => left.verse - right.verse)) {
        lines.push(`      <VERS vnumber="${verse.verse}">${convertedVerses.get(verse)}</VERS>`);
      }
      lines.push('    </CHAPTER>');
    }
    lines.push('  </BIBLEBOOK>');
  }
  lines.push('</XMLBIBLE>', '');
  return lines.join('\n');
}

function backupName(outputPath: string): string {
  return `${outputPath}.backup-${new Date().toISOString().replace(/[:.]/g, '-')}`;
}

export async function convertMyBibleModule(options: ConvertMyBibleOptions): Promise<ConvertMyBibleSummary> {
  if (!/^[^\\/:*?"<>|\u0000-\u001f]{1,48}$/.test(options.shortName.trim())) {
    throw new Error('shortName must be 1-48 filename-safe characters.');
  }
  const biblePath = path.resolve(options.biblePath);
  const referenceManifestPath = path.resolve(options.referenceManifestPath);
  const outputPath = path.resolve(options.outputPath);
  if (outputPath === biblePath || outputPath === referenceManifestPath) throw new Error('Output must not overwrite an input file.');
  if (fs.existsSync(outputPath) && !options.force) throw new Error(`Output already exists: ${outputPath}. Use --force to preserve and replace it.`);

  const source = readBibleSource(biblePath);
  if (source.books.length === 0 || source.verses.length === 0) throw new Error('The MyBible module has no supported Bible books or verses.');
  const selectedFootnotes = options.footnotesPath === false
    ? undefined
    : options.footnotesPath ?? discoverFootnotes(biblePath);
  const selectedFootnotesPath = selectedFootnotes ? path.resolve(selectedFootnotes) : undefined;
  const footnotes = selectedFootnotesPath ? readFootnotes(selectedFootnotesPath) : [];
  const counters: ConversionCounters = {
    styledVerseRows: 0,
    strongMarkerOccurrences: 0,
    paragraphBreakOccurrences: 0,
    footnotesEmbedded: 0,
    footnoteMarkersUnresolved: 0,
    malformedMarkupRowsRecovered: 0
  };
  const usedFootnotes = new Set<Footnote>();
  const resolver = footnoteResolver(footnotes);
  const trackedResolver: typeof resolver = (book, chapter, verse, marker) => {
    const footnote = resolver(book, chapter, verse, marker);
    if (footnote) usedFootnotes.add(footnote);
    return footnote;
  };
  const markerCount = source.verses.reduce((count, verse) => count + (verse.text.match(/<f\b[^>]*>[\s\S]*?<\/f\s*>/gi)?.length ?? 0), 0);
  const bibleXml = buildBibleXml(source, trackedResolver, counters, footnotes, usedFootnotes, options.preserveAllFootnotes === true);
  const unmarkedFootnotesEmbedded = counters.footnotesEmbedded + counters.footnoteMarkersUnresolved - markerCount;
  if (options.requireResolvedFootnotes && counters.footnoteMarkersUnresolved > 0) {
    const extension = path.extname(biblePath);
    const expectedPath = biblePath.slice(0, -extension.length) + '.commentaries' + extension;
    const sourceDescription = selectedFootnotesPath
      ? `В выбранном файле ${selectedFootnotesPath}`
      : `Файл сносок не найден (ожидался ${expectedPath})`;
    throw new Error(
      `${sourceDescription}. Не найдены тексты для ${counters.footnoteMarkersUnresolved} ` +
      `из ${counters.footnotesEmbedded + counters.footnoteMarkersUnresolved} маркеров сносок. ` +
      'Выберите соответствующий файл *.commentaries.SQLite3 в параметрах и повторите сборку.'
    );
  }
  const directMappings = options.directMappingsPath
    ? fs.readFileSync(path.resolve(options.directMappingsPath), 'utf8').replace(/^\s*<\?xml[^>]*>\s*/i, '')
    : undefined;
  if (directMappings && !/^\s*<BibleDirectVerseMappings\b[\s\S]*<\/BibleDirectVerseMappings>\s*$/i.test(directMappings)) {
    throw new Error('The direct mappings file does not contain a BibleDirectVerseMappings element.');
  }
  if (!directMappings && !options.allowUnmappedPreview) {
    throw new Error('A confirmed neutral VerseId direct-mappings file is required. Use allowUnmappedPreview only for a non-installable preview.');
  }
  if (directMappings) {
    const referenceModule = /\bReferenceModule="([^"]+)"/i.exec(directMappings)?.[1]?.trim().toLowerCase();
    const expectedReferenceModule = (options.coordinateReferenceModule ?? 'kjv').trim().toLowerCase();
    if (referenceModule !== expectedReferenceModule) {
      throw new Error(
        `Direct mappings reference '${referenceModule || '(missing)'}', expected coordinate module '${expectedReferenceModule}'.`
      );
    }
    const verseIdRegistry = /\bVerseIdRegistry="([^"]+)"/i.exec(directMappings)?.[1]?.trim();
    const expectedRegistry = options.verseIdRegistry ?? DEFAULT_VERSE_ID_REGISTRY;
    if (verseIdRegistry !== expectedRegistry) {
      throw new Error(
        `Direct mappings use VerseId registry '${verseIdRegistry || '(missing)'}', expected '${expectedRegistry}'.`
      );
    }
  }
  const displayName = source.metadata.description?.trim() || options.shortName.trim();
  const manifest = buildManifest(fs.readFileSync(referenceManifestPath, 'utf8'), {
    shortName: options.shortName.trim(),
    displayName,
    locale: source.metadata.language?.trim() || 'und',
    description: source.metadata.detailed_info?.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() || displayName,
    books: source.books,
    directMappings
  });
  const chapterCount = new Set(source.verses.map(verse => `${verse.bookIndex}:${verse.chapter}`)).size;
  const sourceSha256 = sha256(biblePath);
  const report = {
    format: 'biblenote-mybible-conversion-v1',
    convertedAt: new Date().toISOString(),
    source: { fileName: path.basename(biblePath), sha256: sourceSha256 },
    footnotes: selectedFootnotesPath ? { fileName: path.basename(selectedFootnotesPath), sha256: sha256(selectedFootnotesPath) } : undefined,
    referenceManifest: path.basename(referenceManifestPath),
    directMappings: options.directMappingsPath ? path.basename(options.directMappingsPath) : undefined,
    mappingStatus:directMappings ? 'verse-id-mapped' : 'preview-unmapped',
    counts: { books: source.books.length, chapters: chapterCount, verses: source.verses.length, ...counters,
      footnoteRecordsSource: footnotes.length, footnoteRecordsPreserved: usedFootnotes.size, unmarkedFootnotesEmbedded },
    notes: [
      'MyBible formatting is converted to semantic Zefania STYLE/BR/SUP elements.',
      'Strong-number markers are excluded from visible verse text; the source fingerprint is retained for provenance.',
      'Footnote markers are replaced with Zefania NOTE elements when a companion record can be matched.',
      directMappings
        ? `Legacy bridge differences are removed; explicit ${options.verseIdRegistry ?? DEFAULT_VERSE_ID_REGISTRY} mappings are authoritative.`
        : 'PREVIEW ONLY: neutral VerseId mappings have not been confirmed, so this package must not be installed.'
    ]
  };
  const zip = new JSZip();
  zip.file('manifest.xml', manifest);
  zip.file('bible.xml', bibleXml);
  zip.file('conversion-report.json', `${JSON.stringify(report, null, 2)}\n`);
  if (options.preserveAllFootnotes && footnotes.length > 0) {
    zip.file('footnotes-source.json', JSON.stringify({ format: 'mybible-footnotes-v1', notes: footnotes }));
  }
  const bytes = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 9 } });
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  const temporaryPath = path.join(path.dirname(outputPath), `.${path.basename(outputPath)}.${process.pid}.${randomUUID()}.tmp`);
  fs.writeFileSync(temporaryPath, bytes, { flag: 'wx' });
  let backupPath: string | undefined;
  try {
    if (fs.existsSync(outputPath)) {
      backupPath = backupName(outputPath);
      fs.renameSync(outputPath, backupPath);
    }
    try {
      fs.renameSync(temporaryPath, outputPath);
    } catch (error) {
      if (backupPath && !fs.existsSync(outputPath) && fs.existsSync(backupPath)) fs.renameSync(backupPath, outputPath);
      throw error;
    }
  } finally {
    fs.rmSync(temporaryPath, { force: true });
  }
  return {
    outputPath,
    backupPath,
    shortName: options.shortName.trim(),
    displayName,
    books: source.books.length,
    chapters: chapterCount,
    verses: source.verses.length,
    ...counters,
    footnoteRecordsSource: footnotes.length,
    footnoteRecordsPreserved: usedFootnotes.size,
    unmarkedFootnotesEmbedded,
    directMappingsEmbedded: Boolean(directMappings),
    mappingStatus:directMappings ? 'verse-id-mapped' : 'preview-unmapped',
    sourceSha256
  };
}
