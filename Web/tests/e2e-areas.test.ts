import assert from 'node:assert/strict';
import test from 'node:test';
import { allAreas, areasForChangedFiles } from '../e2e/areas.mjs';

test('e2e area selector always includes smoke and selects a focused area', () => {
  assert.deepEqual(
    areasForChangedFiles(['Web/ui/navigation-search.js']),
    ['smoke', 'search']
  );
});

test('e2e area selector supports cross-cutting feature files', () => {
  assert.deepEqual(
    areasForChangedFiles(['Web/ui/bible-reader.js']),
    ['smoke', 'bible', 'inductive']
  );
});

test('e2e area selector runs all areas for shared or unknown production files', () => {
  assert.deepEqual(areasForChangedFiles(['Web/src/cache-ui.ts']), allAreas);
  assert.deepEqual(areasForChangedFiles(['Api/Application/Startup.cs']), allAreas);
});

test('e2e area selector skips documentation-only changes', () => {
  assert.deepEqual(areasForChangedFiles(['README.md', 'Web/README.md']), ['smoke']);
});
