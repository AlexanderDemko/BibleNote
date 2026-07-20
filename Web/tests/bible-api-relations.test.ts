import assert from 'node:assert/strict';
import test from 'node:test';
import type { BibleParseResult } from '../src/bible.js';
import { findParallelBibleReferenceNotes, findParallelBibleReferences, openCacheDb, searchBibleReferenceNotesByWeight, upsertBibleParseResult } from '../src/cache.js';

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
    assert.equal(weighted[0]?.bibleWeight, 0.8);
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
