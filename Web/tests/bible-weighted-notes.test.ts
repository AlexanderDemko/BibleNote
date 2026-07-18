import assert from 'node:assert/strict';
import test from 'node:test';
import { openCacheDb, searchBibleReferenceNotesByWeight } from '../src/cache.js';

test('penalizes a Bible reference when it is surrounded by more strongly related references', () => {
  const db = openCacheDb(':memory:');
  try {
    const insertPage = db.prepare(`
      INSERT INTO pages(
        id, title, last_modified_date_time,
        parent_notebook_id, parent_notebook_name, parent_section_name
      ) VALUES (?, ?, ?, ?, ?, ?)
    `);
    const insertParagraph = db.prepare(`
      INSERT INTO page_paragraphs(
        page_id, paragraph_index, paragraph_path, text,
        parsed_at, parser_version, module
      ) VALUES (?, ?, ?, ?, '2026-07-16T00:00:00Z', 'test', 'test')
    `);
    const insertRef = db.prepare(`
      INSERT INTO paragraph_verse_refs(
        page_id, paragraph_index, original_text, normalized_ref,
        verse_id, top_verse_id, book_index, book_name,
        chapter, verse, top_chapter, top_verse,
        module, parser_version, parsed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'test', 'test', '2026-07-16T00:00:00Z')
    `);
    const insertRelation = db.prepare(`
      INSERT INTO paragraph_verse_relations(
        page_id, verse_ref_id, relative_verse_ref_id,
        verse_id, relative_verse_id,
        paragraph_index, relative_paragraph_index, relation_weight,
        module, parser_version, parsed_at
      ) VALUES (?, ?, ?, ?, ?, 0, 1, ?, 'test', 'test', '2026-07-16T00:00:00Z')
    `);

    const targetVerseId = 45001001;
    const relatedVerseId = 45001002;
    const addWeightedPage = (id: string, title: string, modifiedAt: string, weight?: number) => {
      insertPage.run(id, title, modifiedAt, 'notebook-1', 'Notebook', 'Section');
      insertParagraph.run(id, 0, '0', `${title} target`);
      const targetRefId = Number(insertRef.run(
        id, 0, 'Рим 1:1', 'Римлянам 1:1',
        targetVerseId, targetVerseId, 45, 'Римлянам', 1, 1, 1, 1
      ).lastInsertRowid);
      if (weight == null) return;
      insertParagraph.run(id, 1, '1', `${title} related`);
      const relatedRefId = Number(insertRef.run(
        id, 1, 'Рим 1:2', 'Римлянам 1:2',
        relatedVerseId, relatedVerseId, 45, 'Римлянам', 1, 2, 1, 2
      ).lastInsertRowid);
      insertRelation.run(id, targetRefId, relatedRefId, targetVerseId, relatedVerseId, weight);
    };

    addWeightedPage('heavy', 'Heavy', '2026-07-16T03:00:00Z', 0.8);
    addWeightedPage('zero', 'Zero', '2026-07-16T02:00:00Z');
    addWeightedPage('light', 'Light', '2026-07-16T01:00:00Z', 0.2);

    const rows = searchBibleReferenceNotesByWeight(db, {
      bookIndex:45,
      chapter:1,
      verse:1,
      notebookIds:['notebook-1'],
      includeAuxiliaryRefs:true,
      orderByWeight:true
    });

    assert.deepEqual(rows.map(row => ({ id:row.id, weight:row.bibleWeight })), [
      { id:'zero', weight:1 },
      { id:'light', weight:0.8333 },
      { id:'heavy', weight:0.5556 }
    ]);
    assert.deepEqual(rows.map(row => row.paragraphIndexes), [[0], [0], [0]]);
  } finally {
    db.close();
  }
});

test('adds the independently penalized weights of repeated Bible references in one note', () => {
  const db = openCacheDb(':memory:');
  try {
    db.prepare(`
      INSERT INTO pages(
        id, title, last_modified_date_time,
        parent_notebook_id, parent_notebook_name, parent_section_name
      ) VALUES ('repeated', 'Repeated', '2026-07-16T03:00:00Z', 'notebook-1', 'Notebook', 'Section')
    `).run();
    const insertParagraph = db.prepare(`
      INSERT INTO page_paragraphs(
        page_id, paragraph_index, paragraph_path, text,
        parsed_at, parser_version, module
      ) VALUES ('repeated', ?, ?, ?, '2026-07-16T00:00:00Z', 'test', 'test')
    `);
    insertParagraph.run(0, '0', 'First target');
    insertParagraph.run(1, '1', 'Second target and related reference');

    const insertRef = db.prepare(`
      INSERT INTO paragraph_verse_refs(
        page_id, paragraph_index, original_text, normalized_ref,
        verse_id, top_verse_id, book_index, book_name,
        chapter, verse, top_chapter, top_verse,
        module, parser_version, parsed_at
      ) VALUES ('repeated', ?, ?, ?, ?, ?, 45, 'Римлянам', 1, ?, 1, ?, 'test', 'test', '2026-07-16T00:00:00Z')
    `);
    const targetVerseId = 45001001;
    const firstTargetId = Number(insertRef.run(0, 'Рим 1:1', 'Римлянам 1:1', targetVerseId, targetVerseId, 1, 1).lastInsertRowid);
    const secondTargetId = Number(insertRef.run(1, 'Рим 1:1', 'Римлянам 1:1', targetVerseId, targetVerseId, 1, 1).lastInsertRowid);
    const relatedVerseId = 45001002;
    const relatedRefId = Number(insertRef.run(1, 'Рим 1:2', 'Римлянам 1:2', relatedVerseId, relatedVerseId, 2, 2).lastInsertRowid);

    const insertRelation = db.prepare(`
      INSERT INTO paragraph_verse_relations(
        page_id, verse_ref_id, relative_verse_ref_id,
        verse_id, relative_verse_id,
        paragraph_index, relative_paragraph_index, relation_weight,
        module, parser_version, parsed_at
      ) VALUES ('repeated', ?, ?, ?, ?, ?, ?, ?, 'test', 'test', '2026-07-16T00:00:00Z')
    `);
    insertRelation.run(firstTargetId, secondTargetId, targetVerseId, targetVerseId, 0, 1, 0.5);
    insertRelation.run(firstTargetId, relatedRefId, targetVerseId, relatedVerseId, 0, 1, 0.5);
    insertRelation.run(secondTargetId, relatedRefId, targetVerseId, relatedVerseId, 1, 1, 1);

    const rows = searchBibleReferenceNotesByWeight(db, {
      bookIndex:45,
      chapter:1,
      verse:1,
      notebookIds:['notebook-1'],
      includeAuxiliaryRefs:true,
      orderByWeight:true
    });

    // First occurrence: 1 / (1 + 1.0) = 0.5.
    // Second occurrence: 1 / (1 + 1.5) = 0.4.
    assert.equal(rows[0]?.bibleWeight, 0.9);
  } finally {
    db.close();
  }
});
