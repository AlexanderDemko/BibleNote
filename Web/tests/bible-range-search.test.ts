import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { openCacheDb, searchBibleReferenceNotesByWeight } from '../src/cache.js';

function addReference(
  db: ReturnType<typeof openCacheDb>,
  id: string,
  chapter: number,
  verse: number | null,
  topChapter: number | null = null,
  topVerse: number | null = null,
  bookIndex = 42,
  paragraphIndex = 0,
  module = 'rst'
) {
  db.prepare(`
    INSERT OR IGNORE INTO pages(id, title, last_modified_date_time)
    VALUES (?, ?, '2026-10-17T00:00:00Z')
  `).run(id, id);
  const text = `${bookIndex} ${chapter}:${verse ?? ''}-${topChapter ?? chapter}:${topVerse ?? verse ?? ''}`;
  db.prepare(`
    INSERT INTO page_paragraphs(page_id, paragraph_index, paragraph_path, text, parsed_at, parser_version, module)
    VALUES (?, ?, ?, ?, '2026-10-17T00:00:00Z', 'test', ?)
  `).run(id, paragraphIndex, String(paragraphIndex), text, module);
  db.prepare(`
    INSERT INTO paragraph_verse_refs(
      page_id, paragraph_index, original_text, normalized_ref,
      book_index, chapter, verse, top_chapter, top_verse, start_index, end_index,
      parsed_at, parser_version, module
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, '2026-10-17T00:00:00Z', 'test', ?)
  `).run(id, paragraphIndex, text, text, bookIndex, chapter, verse, topChapter, topVerse, text.length - 1, module);
}

test('range search includes any shared verse and overlapping ranges with inclusive boundaries', () => {
  const db = openCacheDb(':memory:');
  try {
    addReference(db, 'before', 4, 15);
    addReference(db, 'first', 4, 16);
    addReference(db, 'middle', 4, 18);
    addReference(db, 'last', 4, 20);
    addReference(db, 'after', 4, 21);
    addReference(db, 'exact', 4, 16, 4, 20);
    addReference(db, 'inside', 4, 17, 4, 19);
    addReference(db, 'containing', 4, 14, 4, 22);
    addReference(db, 'overlap-left', 4, 14, 4, 17);
    addReference(db, 'overlap-right', 4, 19, 4, 22);
    addReference(db, 'touch-left', 4, 14, 4, 16);
    addReference(db, 'touch-right', 4, 20, 4, 22);
    addReference(db, 'range-before', 4, 12, 4, 15);
    addReference(db, 'range-after', 4, 21, 4, 24);
    addReference(db, 'previous-chapter', 3, 18);
    addReference(db, 'next-chapter', 5, 18);
    addReference(db, 'other-book', 4, 18, null, null, 43);
    addReference(db, 'chapter', 4, null);

    for (const orderByWeight of [false, true]) {
      const rows = searchBibleReferenceNotesByWeight(db, {
        bookIndex:42, chapter:4, verse:16, topChapter:4, topVerse:20, orderByWeight
      });
      assert.deepEqual(rows.map(row => row.id).sort(), [
        'chapter', 'containing', 'exact', 'first', 'inside', 'last', 'middle',
        'overlap-left', 'overlap-right', 'touch-left', 'touch-right'
      ].sort());
    }

    const singleVerseRows = searchBibleReferenceNotesByWeight(db, { bookIndex:42, chapter:4, verse:18 });
    assert.deepEqual(singleVerseRows.map(row => row.id).sort(), [
      'chapter', 'containing', 'exact', 'inside', 'middle'
    ]);
  } finally {
    db.close();
  }
});

test('range search compares chapter and verse together across chapter boundaries', () => {
  const db = openCacheDb(':memory:');
  try {
    addReference(db, 'before', 4, 15);
    addReference(db, 'first', 4, 16);
    addReference(db, 'middle-chapter', 5, 30);
    addReference(db, 'last', 6, 3);
    addReference(db, 'after', 6, 4);
    addReference(db, 'overlap-left', 3, 20, 4, 16);
    addReference(db, 'overlap-right', 6, 3, 7, 2);
    addReference(db, 'range-before', 3, 20, 4, 15);
    addReference(db, 'range-after', 6, 4, 7, 2);
    addReference(db, 'middle-chapter-ref', 5, null);

    const rows = searchBibleReferenceNotesByWeight(db, {
      bookIndex:42, chapter:4, verse:16, topChapter:6, topVerse:3
    });
    assert.deepEqual(rows.map(row => row.id).sort(), [
      'first', 'last', 'middle-chapter', 'middle-chapter-ref', 'overlap-left', 'overlap-right'
    ]);
  } finally {
    db.close();
  }
});

test('range search returns each note once and highlights only its matching references', () => {
  const db = openCacheDb(':memory:');
  try {
    addReference(db, 'note', 4, 16);
    addReference(db, 'note', 4, 18, null, null, 42, 1);
    addReference(db, 'note', 4, 20, null, null, 42, 2);
    addReference(db, 'note', 4, 21, null, null, 42, 3);

    const rows = searchBibleReferenceNotesByWeight(db, {
      bookIndex:42, chapter:4, verse:16, topChapter:4, topVerse:20
    });
    assert.equal(rows.length, 1);
    assert.equal(rows[0].id, 'note');
    assert.deepEqual(rows[0].paragraphIndexes, [0, 1, 2]);
    assert.deepEqual(rows[0].bibleOccurrences.map(occurrence => occurrence.paragraphIndex), [0, 1, 2]);
    assert.equal(rows[0].bibleWeight, 3);
  } finally {
    db.close();
  }
});

test('multi-chapter note weight uses actual verse counts with absent or incomplete relations', () => {
  const db = openCacheDb(':memory:');
  try {
    for (const id of ['without-relations', 'partial-source', 'partial-relative']) {
      addReference(db, id, 1, 1, 8, 12);
    }
    for (const [id, reversed] of [['partial-source', false], ['partial-relative', true]] as const) {
      addReference(db, id, 9, 1, null, null, 42, 1);
      const refs = db.prepare('SELECT id FROM paragraph_verse_refs WHERE page_id=? ORDER BY paragraph_index').all(id) as Array<{ id:number }>;
      db.prepare(`
        INSERT INTO paragraph_verse_relations(
          page_id, verse_ref_id, relative_verse_ref_id, verse_id, relative_verse_id,
          paragraph_index, relative_paragraph_index, relation_weight, module, parser_version, parsed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, 'rst', 'test', '2026-10-17')
      `).run(id, refs[reversed ? 1 : 0].id, refs[reversed ? 0 : 1].id,
        reversed ? 42009001 : 42004016, reversed ? 42004016 : 42009001,
        reversed ? 1 : 0, reversed ? 0 : 1);
    }
    addReference(db, 'exact-verse', 4, 16);
    addReference(db, 'textology', 1, 1, 8, 12);
    addReference(db, 'textology', 1, 1, 11, 33, 42, 1);
    addReference(db, 'textology', 1, 1, 8, 12, 42, 2);

    const rows = searchBibleReferenceNotesByWeight(db, { bookIndex:42, chapter:4, verse:16, orderByWeight:true });
    assert.equal(rows[0].id, 'exact-verse');
    for (const id of ['without-relations', 'partial-source', 'partial-relative']) {
      // Luke 1:1-8:12 contains 80+52+38+44+39+49+50+12 = 364 verses.
      assert.equal(rows.find(row => row.id === id)?.bibleWeight, 0.0027);
    }
    // Luke 1:1-11:33 contains 545 verses. Three long ranges stay below one exact verse.
    assert.equal(rows.find(row => row.id === 'textology')?.bibleWeight, 0.0073);
  } finally {
    db.close();
  }
});

test('note weights count partial boundary chapters, whole middle chapters and chapter-only references', () => {
  const db = openCacheDb(':memory:');
  try {
    addReference(db, 'two-chapters', 4, 40, 5, 3);
    addReference(db, 'three-chapters', 4, 40, 6, 3);
    addReference(db, 'whole-chapter', 4, null);
    addReference(db, 'missing-module', 1, 1, 8, 12, 42, 0, 'unavailable-module');
    const rows = searchBibleReferenceNotesByWeight(db, { bookIndex:42, chapter:4, verse:42 });
    assert.equal(rows.find(row => row.id === 'two-chapters')?.bibleWeight, 0.125); // 5+3
    assert.equal(rows.find(row => row.id === 'three-chapters')?.bibleWeight, 0.0213); // 5+39+3
    assert.equal(rows.find(row => row.id === 'whole-chapter')?.bibleWeight, 0.0227); // 44
    assert.equal((db.prepare("SELECT bible_range_length('rst', 42, 4, 0, 4, 0) AS length").get() as { length:number }).length, 44);
    assert.equal(rows.find(row => row.id === 'missing-module')?.bibleWeight, 0);
  } finally {
    db.close();
  }
});

test('note weights follow the reference module numbering and reload an updated module', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'biblenote-range-length-'));
  const previousDataDir = process.env.BIBLENOTE_DATA_DIR;
  const db = openCacheDb(':memory:');
  try {
    process.env.BIBLENOTE_DATA_DIR = root;
    const writeModule = (name: string, lastVerse: number) => {
      const dir = path.join(root, 'Modules', name);
      fs.mkdirSync(dir, { recursive:true });
      fs.writeFileSync(path.join(dir, 'bible.xml'), `<XMLBIBLE><BIBLEBOOK bnumber="42">
        <CHAPTER cnumber="4"><VERS vnumber="16"/><VERS vnumber="18"/></CHAPTER>
        <CHAPTER cnumber="5">${Array.from({ length:lastVerse }, (_, i) => `<VERS vnumber="${i + 1}"/>`).join('')}</CHAPTER>
        </BIBLEBOOK></XMLBIBLE>`);
    };
    writeModule('short-module', 1);
    writeModule('long-module', 2);
    addReference(db, 'short', 4, 16, 5, 2, 42, 0, 'short-module');
    addReference(db, 'long', 4, 16, 5, 2, 42, 0, 'long-module');
    addReference(db, 'sparse-chapter', 4, 16, 4, 18, 42, 0, 'short-module');
    const search = () => searchBibleReferenceNotesByWeight(db, { bookIndex:42, chapter:4, verse:16 });
    const rows = search();
    assert.equal(rows.find(row => row.id === 'short')?.bibleWeight, 0.3333);
    assert.equal(rows.find(row => row.id === 'long')?.bibleWeight, 0.25);
    assert.equal(rows.find(row => row.id === 'sparse-chapter')?.bibleWeight, 0.5);
    writeModule('short-module', 2);
    assert.equal(search().find(row => row.id === 'short')?.bibleWeight, 0.25);
  } finally {
    if (previousDataDir == null) delete process.env.BIBLENOTE_DATA_DIR;
    else process.env.BIBLENOTE_DATA_DIR = previousDataDir;
    db.close();
    assert.ok(path.resolve(root).startsWith(path.resolve(os.tmpdir()) + path.sep));
    fs.rmSync(root, { recursive:true, force:true });
  }
});
