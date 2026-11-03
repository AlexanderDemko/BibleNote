import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_VERSE_ID_REGISTRY, formatVerseId } from '../src/verse-id.js';

test('formats neutral BibleNote VerseIds independently of a translation module', () => {
  assert.equal(DEFAULT_VERSE_ID_REGISTRY, 'bnverse:v1');
  assert.equal(formatVerseId({ bookIndex:1, chapter:1, verse:1 }), 'bnverse:v1:1:1:1');
  assert.equal(formatVerseId({ bookIndex:3, chapter:14, verse:55 }), 'bnverse:v1:3:14:55');
  assert.equal(formatVerseId({ bookIndex:44, chapter:1, verse:16 }), 'bnverse:v1:44:1:16');
});

test('rejects invalid VerseId coordinates and registries', () => {
  assert.throws(() => formatVerseId({ bookIndex:0, chapter:1, verse:1 }), /positive integers/);
  assert.throws(() => formatVerseId({ bookIndex:1, chapter:1, verse:1 }, 'KJV'), /registry identifier/);
});
