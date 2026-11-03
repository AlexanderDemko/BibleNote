import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type Database from 'better-sqlite3';

type VerseIndex = Map<number, number[]>;
const indexes = new Map<string, { mtimeMs: number; size: number; verses: VerseIndex }>();
const moduleDir = path.dirname(fileURLToPath(import.meta.url));

function moduleRoots(): string[] {
  const dataRoot = process.platform === 'darwin'
    ? path.join(os.homedir(), 'Library', 'Application Support', 'BibleNote')
    : path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), '.local', 'share'), 'BibleNote');
  return [
    ...(process.env.BIBLENOTE_DATA_DIR ? [path.join(process.env.BIBLENOTE_DATA_DIR, 'Modules')] : []),
    ...(process.env.BIBLENOTE_TEST_ISOLATED !== '1' ? [path.join(dataRoot, 'Modules')] : []),
    path.resolve(moduleDir, '..', '..', 'BibleNote', 'Modules'),
    path.resolve(moduleDir, '..', 'vendor', 'BibleNote', 'Modules'),
    path.resolve(moduleDir, '..', '..', 'Api', 'Modules')
  ];
}

function readVerseIndex(module: string): VerseIndex | undefined {
  if (!module || module === '.' || module === '..' || /[\\/:\0]/.test(module)) return undefined;
  for (const root of moduleRoots()) {
    const file = path.join(root, module, 'bible.xml');
    if (!fs.existsSync(file)) continue;
    try {
      const stat = fs.statSync(file);
      const cached = indexes.get(file);
      if (cached?.mtimeMs === stat.mtimeMs && cached.size === stat.size) return cached.verses;
      const verses: VerseIndex = new Map();
      // Only coordinates are needed; verse text and markup do not affect the length.
      const xml = fs.readFileSync(file, 'utf8').replace(/<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>/g, '');
      let book: number | undefined;
      let chapter: number | undefined;
      for (const match of xml.matchAll(/<\/?(?:BIBLEBOOK|CHAPTER|VERS)\b[^>]*>/gi)) {
        const tag = match[0];
        if (/^<BIBLEBOOK\b/i.test(tag)) {
          book = Number(/\bbnumber\s*=\s*["'](\d+)["']/i.exec(tag)?.[1]);
          chapter = undefined;
        } else if (/^<CHAPTER\b/i.test(tag)) {
          chapter = Number(/\bcnumber\s*=\s*["'](\d+)["']/i.exec(tag)?.[1]);
        } else if (/^<VERS\b/i.test(tag)) {
          const verse = Number(/\bvnumber\s*=\s*["'](\d+)["']/i.exec(tag)?.[1]);
          if (!(book && chapter && verse)) continue;
          const coordinates = verses.get(book) ?? [];
          coordinates.push(chapter * 1000 + verse);
          verses.set(book, coordinates);
        } else if (/^<\/CHAPTER\b/i.test(tag)) {
          chapter = undefined;
        } else if (/^<\/BIBLEBOOK\b/i.test(tag)) {
          book = undefined;
          chapter = undefined;
        }
      }
      for (const [bookIndex, coordinates] of verses) {
        verses.set(bookIndex, [...new Set(coordinates)].sort((a, b) => a - b));
      }
      indexes.set(file, { mtimeMs:stat.mtimeMs, size:stat.size, verses });
      return verses;
    } catch {
      // An unavailable module must not turn a long range into a single verse.
      return undefined;
    }
  }
  return undefined;
}

function lowerBound(values: number[], target: number): number {
  let left = 0;
  let right = values.length;
  while (left < right) {
    const middle = (left + right) >>> 1;
    if (values[middle] < target) left = middle + 1;
    else right = middle;
  }
  return left;
}

export function registerBibleRangeLength(db: Database.Database): void {
  // Check each module once per search; reuse parsed coordinates until its XML changes.
  const modules = new Map<string, VerseIndex | undefined>();
  db.function('bible_range_length', { deterministic:true }, (
    module: string, book: number, chapter: number, verse: number | null,
    topChapter: number | null, topVerse: number | null
  ): number | null => {
    const lastChapter = topChapter ?? chapter;
    const firstVerse = verse && verse > 0 ? verse : 1;
    const lastVerse = topVerse ?? verse;
    if (lastChapter < chapter || (lastChapter === chapter && lastVerse && lastVerse < firstVerse)) return null;
    if (lastChapter === chapter && verse && verse > 0 && lastVerse === verse) return 1;
    if (!modules.has(module)) modules.set(module, readVerseIndex(module));
    const coordinates = modules.get(module)?.get(book);
    if (!coordinates) {
      // A same-chapter verse interval can still be counted without chapter lengths.
      return lastChapter === chapter && verse && verse > 0 && lastVerse && lastVerse > 0
        ? lastVerse - firstVerse + 1 : null;
    }
    const start = chapter * 1000 + firstVerse;
    const end = lastChapter * 1000 + (lastVerse && lastVerse > 0 ? lastVerse : 999);
    const count = lowerBound(coordinates, end + 1) - lowerBound(coordinates, start);
    return count > 0 ? count : null;
  });
}
