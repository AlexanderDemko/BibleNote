import assert from 'node:assert/strict';
import test from 'node:test';
import Database from 'better-sqlite3';
import { migrateCacheSchema } from '../src/cache-schema.js';

test('invalidates capped relation parses once so sync can rebuild them with local-first priority', () => {
  const db = new Database(':memory:');
  try {
    migrateCacheSchema(db, () => {});
    db.prepare(`
      INSERT INTO pages(id, title, content_hash, metadata_synced_at)
      VALUES ('capped', 'Capped relations', 'hash', '2026-07-20T00:00:00Z')
    `).run();
    db.prepare(`
      INSERT INTO page_bible_parse_state(
        page_id, content_hash, module, parser_version, parsed_at, refs_count, paragraphs_count
      ) VALUES ('capped', 'hash', 'rst', 'biblenote-http-v4', '2026-07-20T00:00:00Z', 2, 1)
    `).run();
    db.prepare(`
      INSERT INTO page_paragraphs(
        page_id, paragraph_index, text, parsed_at, parser_version, module
      ) VALUES ('capped', 0, 'Ин 3:16; Рим 5:8', '2026-07-20T00:00:00Z', 'biblenote-http-v4', 'rst')
    `).run();
    const insertRef = db.prepare(`
      INSERT INTO paragraph_verse_refs(
        page_id, paragraph_index, original_text, normalized_ref,
        verse_id, top_verse_id, book_index, chapter, verse, top_chapter, top_verse,
        module, parser_version, parsed_at
      ) VALUES ('capped', 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'rst', 'biblenote-http-v4', '2026-07-20T00:00:00Z')
    `);
    const sourceRefId = Number(insertRef.run('Ин 3:16', 'Иоанна 3:16', 43003016, 43003016, 43, 3, 16, 3, 16).lastInsertRowid);
    const targetRefId = Number(insertRef.run('Рим 5:8', 'Римлянам 5:8', 45005008, 45005008, 45, 5, 8, 5, 8).lastInsertRowid);
    db.prepare(`
      WITH RECURSIVE sequence(value) AS (
        SELECT 1
        UNION ALL
        SELECT value + 1 FROM sequence WHERE value < 50000
      )
      INSERT INTO paragraph_verse_relations(
        page_id, verse_ref_id, relative_verse_ref_id,
        verse_id, relative_verse_id, paragraph_index, relative_paragraph_index,
        relation_weight, module, parser_version, parsed_at
      )
      SELECT 'capped', ?, ?, 43003016, 45005008, 0, 0,
        1.0, 'rst', 'biblenote-http-v4', '2026-07-20T00:00:00Z'
      FROM sequence
    `).run(sourceRefId, targetRefId);
    db.prepare("DELETE FROM sync_state WHERE key = 'bible_relation_priority_local_first_v1'").run();

    migrateCacheSchema(db, () => {});

    assert.equal(db.prepare("SELECT 1 FROM page_bible_parse_state WHERE page_id = 'capped'").get(), undefined);
    assert.equal(
      (db.prepare("SELECT value FROM sync_state WHERE key = 'bible_relation_priority_local_first_v1'").get() as { value: string }).value,
      '1'
    );
    assert.equal((db.prepare('SELECT COUNT(*) count FROM paragraph_verse_relations').get() as { count: number }).count, 50000);

    db.prepare(`
      INSERT INTO page_bible_parse_state(
        page_id, content_hash, module, parser_version, parsed_at, refs_count, paragraphs_count
      ) VALUES ('capped', 'hash', 'rst', 'biblenote-http-v4', '2026-07-20T01:00:00Z', 2, 1)
    `).run();
    migrateCacheSchema(db, () => {});
    assert.notEqual(db.prepare("SELECT 1 FROM page_bible_parse_state WHERE page_id = 'capped'").get(), undefined);
  } finally {
    db.close();
  }
});
