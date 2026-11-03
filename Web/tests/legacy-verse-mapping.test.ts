import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { readLegacyVerseMappings } from '../src/legacy-verse-mapping.js';

function relationKeys(bookIndex: number, chapter: number, verse: number): string[] {
  const manifest = path.resolve('..', 'Api', 'Modules', 'rst', 'manifest.xml');
  return readLegacyVerseMappings(manifest).relations
    .filter(relation => relation.reference.bookIndex === bookIndex
      && relation.reference.chapter === chapter
      && relation.reference.verse === verse)
    .map(relation => `${relation.module.bookIndex}:${relation.module.chapter}:${relation.module.verse}`);
}

test('expands the verified RST legacy formulas relative to KJV', () => {
  assert.deepEqual(relationKeys(3, 14, 55), ['3:14:55']);
  assert.deepEqual(relationKeys(3, 14, 56), ['3:14:55']);
  assert.deepEqual(relationKeys(3, 14, 57), ['3:14:56']);
  assert.deepEqual(relationKeys(19, 3, 1), ['19:3:1', '19:3:2']);
  assert.deepEqual(relationKeys(19, 3, 2), ['19:3:3']);
  assert.deepEqual(relationKeys(44, 1, 15), ['44:1:15', '44:1:16']);
  assert.deepEqual(relationKeys(44, 1, 16), ['44:1:16']);
});
