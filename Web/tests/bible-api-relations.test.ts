import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { once } from 'node:events';
import type { BibleParseResult } from '../src/bible.js';
import { findParallelBibleReferenceNotes, findParallelBibleReferences, openCacheDb, searchBibleReferenceNotesByWeight, upsertBibleParseResult } from '../src/cache.js';
import { startCacheUi } from '../src/cache-ui.js';

test('stores only Bible relations calculated and returned by the API', () => {
  const db = openCacheDb(':memory:');
  try {
    db.prepare(`
      INSERT INTO pages(
        id, title, parent_notebook_id, parent_notebook_name, parent_section_name,
        content_hash, metadata_synced_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run('page-1', 'API weights', 'notebook-1', 'Notebook', 'Section', 'hash-1', '2026-07-17T00:00:00Z');

    const result: BibleParseResult = {
      pageId:'page-1',
      module:'rst',
      paragraphs:[
        {
          index:0,
          text:'First paragraph',
          references:[
            { originalText:'Мф. 1:1', normalized:'Матфея 1:1', bookIndex:40, chapter:1, verse:1, topChapter:1, topVerse:1 },
            { originalText:'Мф. 1:2', normalized:'Матфея 1:2', bookIndex:40, chapter:1, verse:2, topChapter:1, topVerse:2 }
          ]
        },
        {
          index:2,
          text:'Third paragraph',
          references:[
            { originalText:'Мф. 1:3', normalized:'Матфея 1:3', bookIndex:40, chapter:1, verse:3, topChapter:1, topVerse:3 }
          ]
        }
      ],
      relations:[
        {
          paragraphIndex:0,
          referenceIndex:0,
          verseId:40001001,
          relativeParagraphIndex:2,
          relativeReferenceIndex:0,
          relativeVerseId:40001003,
          relationWeight:0.25
        }
      ],
      relationsCapped:false
    };

    upsertBibleParseResult(db, 'page-1', 'hash-1', result, 'biblenote-http-v4', '2026-07-17T00:00:00Z');

    const relations = db.prepare(`
      SELECT
        source.normalized_ref AS sourceRef,
        target.normalized_ref AS targetRef,
        rel.verse_id AS verseId,
        rel.relative_verse_id AS relativeVerseId,
        rel.relation_weight AS relationWeight
      FROM paragraph_verse_relations rel
      JOIN paragraph_verse_refs source ON source.id = rel.verse_ref_id
      JOIN paragraph_verse_refs target ON target.id = rel.relative_verse_ref_id
    `).all();
    assert.deepEqual(relations, [{
      sourceRef:'Матфея 1:1',
      targetRef:'Матфея 1:3',
      verseId:40001001,
      relativeVerseId:40001003,
      relationWeight:0.25
    }]);

    const weighted = searchBibleReferenceNotesByWeight(db, {
      bookIndex:40,
      chapter:1,
      verse:1,
      notebookIds:['notebook-1'],
      includeAuxiliaryRefs:true,
      orderByWeight:true
    });
    assert.equal(weighted[0]?.bibleWeight, 0.6667);
  } finally {
    db.close();
  }
});

test('rejects a legacy ParsePage response without API-calculated relations', () => {
  const db = openCacheDb(':memory:');
  try {
    db.prepare(`
      INSERT INTO pages(id, title, content_hash, metadata_synced_at)
      VALUES (?, ?, ?, ?)
    `).run('page-1', 'Legacy response', 'hash-1', '2026-07-17T00:00:00Z');

    assert.throws(
      () => upsertBibleParseResult(db, 'page-1', 'hash-1', { paragraphs:[] }, 'biblenote-http-v4'),
      /does not contain relations/
    );
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM paragraph_verse_refs').get().count, 0);
  } finally {
    db.close();
  }
});

test('preserves cached relations when the API returns an impossible empty relation set', () => {
  const db = openCacheDb(':memory:');
  try {
    db.prepare(`
      INSERT INTO pages(id, title, content_hash, metadata_synced_at)
      VALUES (?, ?, ?, ?)
    `).run('page-1', 'Preserve relations', 'hash-1', '2026-07-17T00:00:00Z');

    const paragraphs: BibleParseResult['paragraphs'] = [{
      index:0,
      text:'Two references',
      references:[
        { originalText:'Ин. 3:16', normalized:'Иоанна 3:16', bookIndex:43, chapter:3, verse:16, topChapter:3, topVerse:16 },
        { originalText:'Рим. 5:8', normalized:'Римлянам 5:8', bookIndex:45, chapter:5, verse:8, topChapter:5, topVerse:8 }
      ]
    }];
    upsertBibleParseResult(db, 'page-1', 'hash-1', {
      paragraphs,
      relations:[{
        paragraphIndex:0,
        referenceIndex:0,
        verseId:43003016,
        relativeParagraphIndex:0,
        relativeReferenceIndex:1,
        relativeVerseId:45005008,
        relationWeight:0.8
      }]
    }, 'biblenote-http-v4');

    assert.throws(
      () => upsertBibleParseResult(db, 'page-1', 'hash-1', { paragraphs, relations:[] }, 'biblenote-http-v4'),
      /no relations for 2 recognized references/
    );
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM paragraph_verse_refs').get().count, 2);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM paragraph_verse_relations').get().count, 1);
  } finally {
    db.close();
  }
});

test('does not infer a parallel relation that was not calculated by the API', () => {
  const db = openCacheDb(':memory:');
  try {
    db.prepare(`
      INSERT INTO pages(
        id, title, parent_notebook_id, parent_notebook_name, parent_section_name,
        content_hash, metadata_synced_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run('same-paragraph', 'Same paragraph', 'notebook-1', 'Notebook', 'Section', 'hash-same', '2026-07-19T00:00:00Z');

    upsertBibleParseResult(db, 'same-paragraph', 'hash-same', {
      paragraphs:[{
        index:0,
        text:'2 Кор. 1:12; ср. Деян. 23:1',
        references:[
          { originalText:'2 Кор. 1:12', normalized:'2Коринфянам 1:12', bookIndex:47, bookName:'2Коринфянам', chapter:1, verse:12, topChapter:1, topVerse:12 },
          { originalText:'Деян. 23:1', normalized:'Деяния 23:1', bookIndex:44, bookName:'Деяния', chapter:23, verse:1, topChapter:23, topVerse:1 }
        ]
      }, {
        index:1,
        text:'Слабая внешняя связь: 2 Кор. 8:23',
        references:[
          { originalText:'2 Кор. 8:23', normalized:'2Коринфянам 8:23', bookIndex:47, bookName:'2Коринфянам', chapter:8, verse:23, topChapter:8, topVerse:23 }
        ]
      }],
      relations:[{
        paragraphIndex:1,
        referenceIndex:0,
        verseId:47008023,
        relativeParagraphIndex:0,
        relativeReferenceIndex:0,
        relativeVerseId:47001012,
        relationWeight:0.125
      }]
    }, 'biblenote-http-v4', '2026-07-19T00:00:00Z');

    const rows = findParallelBibleReferences(db, {
      bookIndex:47,
      chapter:1,
      verse:12,
      includeAuxiliaryRefs:true
    });
    assert.equal(rows.some(row => row.normalizedRef === 'Деяния 23:1'), false);
    assert.equal(rows[0]?.normalizedRef, '2Коринфянам 8:23');
    assert.equal(rows[0]?.relationWeight, 0.125);

    const notes = findParallelBibleReferenceNotes(db, {
      bookIndex:47,
      chapter:1,
      verse:12,
      relatedBookIndex:44,
      relatedChapter:23,
      relatedVerse:1,
      includeAuxiliaryRefs:true
    });
    assert.equal(notes.length, 0);
  } finally {
    db.close();
  }
});

test('returns range relations as exact verses and sums repeated contributions per page', () => {
  const db = openCacheDb(':memory:');
  try {
    db.prepare(`
      INSERT INTO pages(
        id, title, parent_notebook_id, parent_notebook_name, parent_section_name,
        content_hash, metadata_synced_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run('page-range', 'Range evidence', 'notebook-1', 'Notebook', 'Section', 'hash-range', '2026-07-18T00:00:00Z');

    upsertBibleParseResult(db, 'page-range', 'hash-range', {
      paragraphs:[{
        index:0,
        text:'Иоан. 3:16; Иоан. 3:16; Деян. 9:3-15; Иоан. 3:15-17',
        references:[
          { originalText:'Иоан. 3:16', normalized:'Иоанна 3:16', bookIndex:43, bookName:'Иоанна', chapter:3, verse:16, topChapter:3, topVerse:16 },
          { originalText:'Иоан. 3:16', normalized:'Иоанна 3:16', bookIndex:43, bookName:'Иоанна', chapter:3, verse:16, topChapter:3, topVerse:16 },
          { originalText:'Деян. 9:3-15', normalized:'Деяния 9:3-15', bookIndex:44, bookName:'Деяния', chapter:9, verse:3, topChapter:9, topVerse:15 },
          { originalText:'Иоан. 3:15-17', normalized:'Иоанна 3:15-17', bookIndex:43, bookName:'Иоанна', chapter:3, verse:15, topChapter:3, topVerse:17 }
        ]
      }, {
        index:1,
        text:'Повторное упоминание Иоан. 3:16',
        references:[
          { originalText:'Иоан. 3:16', normalized:'Иоанна 3:16', bookIndex:43, bookName:'Иоанна', chapter:3, verse:16, topChapter:3, topVerse:16 }
        ]
      }, {
        index:2,
        text:'Ещё одно упоминание Иоан. 3:16',
        references:[
          { originalText:'Иоан. 3:16', normalized:'Иоанна 3:16', bookIndex:43, bookName:'Иоанна', chapter:3, verse:16, topChapter:3, topVerse:16 }
        ]
      }, {
        index:3,
        text:'Ещё одно упоминание Деян. 9:3-15',
        references:[
          { originalText:'Деян. 9:3-15', normalized:'Деяния 9:3-15', bookIndex:44, bookName:'Деяния', chapter:9, verse:3, topChapter:9, topVerse:15 }
        ]
      }],
      relations:[
        { paragraphIndex:0, referenceIndex:0, verseId:43003016, relativeParagraphIndex:0, relativeReferenceIndex:2, relativeVerseId:44009003, relationWeight:0.5 },
        { paragraphIndex:0, referenceIndex:1, verseId:43003016, relativeParagraphIndex:0, relativeReferenceIndex:2, relativeVerseId:44009003, relationWeight:0.8 },
        { paragraphIndex:0, referenceIndex:0, verseId:43003016, relativeParagraphIndex:0, relativeReferenceIndex:2, relativeVerseId:44009004, relationWeight:0.5 },
        { paragraphIndex:0, referenceIndex:0, verseId:43003016, relativeParagraphIndex:0, relativeReferenceIndex:3, relativeVerseId:43003017, relationWeight:1 }
      ]
    }, 'biblenote-http-v4', '2026-07-18T00:00:00Z');

    const rows = findParallelBibleReferences(db, {
      bookIndex:43,
      chapter:3,
      verse:16,
      includeAuxiliaryRefs:true
    });

    assert.deepEqual(rows.map(row => ({
      ref:row.normalizedRef,
      verse:row.verse,
      topVerse:row.topVerse,
      support:row.relationWeight,
      relations:row.relations,
      pages:row.pages,
      commonNotePageIds:row.commonNotePageIds
    })), [
      { ref:'Иоанна 3:17', verse:17, topVerse:17, support:0.3333, relations:1, pages:1, commonNotePageIds:['page-range'] },
      { ref:'Деяния 9:3', verse:3, topVerse:3, support:0.1, relations:2, pages:1, commonNotePageIds:['page-range'] },
      { ref:'Деяния 9:4', verse:4, topVerse:4, support:0.0385, relations:1, pages:1, commonNotePageIds:['page-range'] }
    ]);

    const notes = findParallelBibleReferenceNotes(db, {
      bookIndex:43,
      chapter:3,
      verse:16,
      relatedBookIndex:44,
      relatedChapter:9,
      relatedVerse:3,
      includeAuxiliaryRefs:true
    });
    assert.equal(notes.length, 1);
    assert.equal(notes[0]?.relationWeight, 0.1);
    assert.equal(notes[0]?.parentNotebookId, 'notebook-1');
    assert.deepEqual(String(notes[0]?.pairParagraphIndexes).split(',').map(Number).sort(), [0, 1, 2, 3]);
    assert.equal(notes[0]?.relatedNormalizedRef, 'Деяния 9:3-15');
    assert.equal(findParallelBibleReferenceNotes(db, {
      bookIndex:43,
      chapter:3,
      verse:16,
      relatedBookIndex:44,
      relatedChapter:9,
      relatedVerse:0,
      includeAuxiliaryRefs:true
    }).length, 0);
    assert.equal(findParallelBibleReferenceNotes(db, {
      bookIndex:43,
      chapter:3,
      verse:16,
      relatedBookIndex:44,
      relatedChapter:9,
      relatedVerse:3,
      notebookIds:['another-notebook'],
      includeAuxiliaryRefs:true
    }).length, 0);

    const reverseRangeRows = findParallelBibleReferences(db, {
      bookIndex:43,
      chapter:3,
      verse:17,
      includeAuxiliaryRefs:true
    });
    assert.equal(reverseRangeRows[0]?.normalizedRef, 'Иоанна 3:16');
    assert.equal(reverseRangeRows[0]?.relationWeight, 0.3333);
  } finally {
    db.close();
  }
});

test('does not treat a truncated chapter prefix as an explicit parallel chapter reference', () => {
  const db = openCacheDb(':memory:');
  try {
    db.prepare(`
      INSERT INTO pages(
        id, title, parent_notebook_id, parent_notebook_name, parent_section_name,
        content_hash, metadata_synced_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run('chapter-prefix', 'Chapter prefix', 'notebook-1', 'Notebook', 'Section', 'hash-prefix', '2026-09-02T00:00:00Z');

    const targetText = 'Точный стих Фил 1:24';
    const dotText = 'Тема (Фил 1.19-26)';
    const colonText = 'Тема (Фил 1:19-26)';
    const commaText = 'Тема (Фил 1,19-26)';
    const explicitText = 'Обзор Фил 2.';
    const chapterRef = (text: string, chapter: number) => {
      const originalText = `Фил ${chapter}`;
      const startIndex = text.indexOf(originalText);
      return {
        originalText,
        normalized:`Филиппийцам ${chapter}`,
        bookIndex:50,
        bookName:'К Филиппийцам',
        chapter,
        verse:0,
        topChapter:chapter,
        topVerse:0,
        isChapter:true,
        startIndex,
        endIndex:startIndex + originalText.length - 1,
        entryType:'BookChapter'
      };
    };

    upsertBibleParseResult(db, 'chapter-prefix', 'hash-prefix', {
      paragraphs:[
        {
          index:0,
          text:targetText,
          references:[{
            originalText:'Фил 1:24', normalized:'Филиппийцам 1:24',
            bookIndex:50, bookName:'К Филиппийцам', chapter:1, verse:24,
            topChapter:1, topVerse:24,
            startIndex:targetText.indexOf('Фил 1:24'),
            endIndex:targetText.indexOf('Фил 1:24') + 'Фил 1:24'.length - 1,
            entryType:'BookChapterVerse'
          }]
        },
        { index:1, text:dotText, references:[chapterRef(dotText, 1)] },
        { index:2, text:colonText, references:[chapterRef(colonText, 1)] },
        { index:3, text:commaText, references:[chapterRef(commaText, 1)] },
        { index:4, text:explicitText, references:[chapterRef(explicitText, 2)] }
      ],
      relations:[
        { paragraphIndex:0, referenceIndex:0, verseId:50001024, relativeParagraphIndex:1, relativeReferenceIndex:0, relativeVerseId:50001000, relationWeight:1 },
        { paragraphIndex:0, referenceIndex:0, verseId:50001024, relativeParagraphIndex:2, relativeReferenceIndex:0, relativeVerseId:50001000, relationWeight:1 },
        { paragraphIndex:0, referenceIndex:0, verseId:50001024, relativeParagraphIndex:3, relativeReferenceIndex:0, relativeVerseId:50001000, relationWeight:1 },
        { paragraphIndex:0, referenceIndex:0, verseId:50001024, relativeParagraphIndex:4, relativeReferenceIndex:0, relativeVerseId:50002000, relationWeight:1 }
      ]
    }, 'biblenote-http-v4', '2026-09-02T00:00:00Z');

    const rows = findParallelBibleReferences(db, {
      bookIndex:50,
      chapter:1,
      verse:24,
      includeAuxiliaryRefs:true
    });
    assert.deepEqual(rows.map(row => row.relatedVerseId), [50002000]);

    assert.equal(findParallelBibleReferenceNotes(db, {
      bookIndex:50,
      chapter:1,
      verse:24,
      relatedBookIndex:50,
      relatedChapter:1,
      relatedVerse:0,
      includeAuxiliaryRefs:true
    }).length, 0);
    assert.equal(findParallelBibleReferenceNotes(db, {
      bookIndex:50,
      chapter:1,
      verse:24,
      relatedBookIndex:50,
      relatedChapter:2,
      relatedVerse:0,
      includeAuxiliaryRefs:true
    }).length, 1);
  } finally {
    db.close();
  }
});

test('does not inflate an explicit chapter relation with every verse relation in that chapter', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'biblenote-parallel-chapter-'));
  const dbPath = path.join(tempDir, 'cache.sqlite');
  let server: ReturnType<typeof startCacheUi> | undefined;
  try {
    const db = openCacheDb(dbPath);
    db.prepare(`
      INSERT INTO pages(
        id, title, parent_notebook_id, parent_notebook_name, parent_section_name,
        content_hash, metadata_synced_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run('chapter-api', 'Chapter API', 'notebook-1', 'Notebook', 'Section', 'hash-api', '2026-09-02T00:00:00Z');
    upsertBibleParseResult(db, 'chapter-api', 'hash-api', {
      paragraphs:[
        { index:0, text:'Фил 1:24', references:[{ originalText:'Фил 1:24', normalized:'Филиппийцам 1:24', bookIndex:50, bookName:'К Филиппийцам', chapter:1, verse:24, topChapter:1, topVerse:24 }] },
        { index:1, text:'Фил 2', references:[{ originalText:'Фил 2', normalized:'Филиппийцам 2', bookIndex:50, bookName:'К Филиппийцам', chapter:2, verse:0, topChapter:2, topVerse:0, isChapter:true, entryType:'BookChapter', startIndex:0, endIndex:4 }] },
        { index:2, text:'Фил 2:3', references:[{ originalText:'Фил 2:3', normalized:'Филиппийцам 2:3', bookIndex:50, bookName:'К Филиппийцам', chapter:2, verse:3, topChapter:2, topVerse:3 }] }
      ],
      relations:[
        { paragraphIndex:0, referenceIndex:0, verseId:50001024, relativeParagraphIndex:1, relativeReferenceIndex:0, relativeVerseId:50002000, relationWeight:1 },
        { paragraphIndex:0, referenceIndex:0, verseId:50001024, relativeParagraphIndex:2, relativeReferenceIndex:0, relativeVerseId:50002003, relationWeight:5 }
      ]
    }, 'biblenote-http-v4', '2026-09-02T00:00:00Z');
    db.close();

    server = startCacheUi({ dbPath, port:0 });
    await once(server, 'listening');
    const address = server.address();
    assert.ok(address && typeof address === 'object');
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const readyDeadline = Date.now() + 5000;
    while (Date.now() < readyDeadline) {
      const startup = await fetch(`${baseUrl}/api/startup`).then(response => response.json()) as { ready?: boolean };
      if (startup.ready) break;
      await new Promise(resolve => setTimeout(resolve, 50));
    }

    const result = await fetch(`${baseUrl}/api/bible/parallel?bookIndex=50&chapter=1&verse=24&limit=20&includeAux=1`)
      .then(response => response.json()) as { rows:Array<Record<string, unknown>> };
    const chapter = result.rows.find(row => Number(row.relatedVerseId) === 50002000);
    assert.equal(chapter?.relationWeight, 1);
    assert.equal(chapter?.relations, 1);
    assert.equal(chapter?.pages, 1);
  } finally {
    if (server) await new Promise<void>(resolve => server!.close(() => resolve()));
    fs.rmSync(tempDir, { recursive:true, force:true, maxRetries:5, retryDelay:50 });
  }
});
