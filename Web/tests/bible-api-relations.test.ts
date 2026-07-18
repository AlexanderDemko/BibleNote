import assert from 'node:assert/strict';
import test from 'node:test';
import type { BibleParseResult } from '../src/bible.js';
import { openCacheDb, searchBibleReferenceNotesByWeight, upsertBibleParseResult } from '../src/cache.js';

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
