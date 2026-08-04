import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { cacheStatistics, cacheStatus, openCacheDb } from '../src/cache.js';

const sourceDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src');

test('cache schema migration does not count the large Bible relation tables during startup', () => {
  const schemaSource = fs.readFileSync(path.join(sourceDirectory, 'cache-schema.ts'), 'utf8');
  assert.equal(schemaSource.includes("SELECT COUNT(*) AS value FROM paragraph_verse_relations"), false);
  assert.equal(schemaSource.includes("SELECT COUNT(*) AS value FROM paragraph_verse_refs"), false);
});

test('fast cache status excludes the large Bible relation counters', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'biblenote-cache-status-'));
  const dbPath = path.join(directory, 'cache.sqlite');
  const db = openCacheDb(dbPath);
  try {
    const status = cacheStatus(db);
    assert.equal('bibleReferencedParagraphs' in status, false);
    assert.equal('bibleReferences' in status, false);
    assert.equal('bibleReferenceRelations' in status, false);
    assert.equal('pagesWithErrors' in status, false);
    assert.equal('content' in status, false);

    const statistics = cacheStatistics(db);
    assert.equal(statistics.pagesWithErrors, 0);
    assert.equal(statistics.bibleReferencedParagraphs, 0);
    assert.equal(statistics.bibleReferences, 0);
    assert.equal(statistics.bibleReferenceRelations, 0);
  } finally {
    db.close();
    fs.rmSync(directory, { recursive:true, force:true });
  }
});
