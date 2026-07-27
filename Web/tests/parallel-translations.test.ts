import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { bibleNoteParallelVerseText } from '../src/biblenote-gateway.js';

const root = fileURLToPath(new URL('../', import.meta.url));

test('parallel translation gateway forwards the base and target modules', async () => {
  const originalFetch = globalThis.fetch;
  let requestedUrl = '';
  globalThis.fetch = async input => {
    requestedUrl = String(input);
    return Response.json({
      baseModule:'rst',
      module:'kjv',
      rows:[]
    });
  };
  try {
    const result = await bibleNoteParallelVerseText({
      baseModule:'rst',
      module:'kjv',
      bookIndex:43,
      chapter:3
    });
    const url = new URL(requestedUrl);
    assert.equal(url.pathname, '/api/VerseParsing/ParallelVerseText');
    assert.equal(url.searchParams.get('baseModule'), 'rst');
    assert.equal(url.searchParams.get('module'), 'kjv');
    assert.equal(url.searchParams.get('bookIndex'), '43');
    assert.equal(url.searchParams.get('chapter'), '3');
    assert.equal(result.module, 'kjv');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('reader exposes a three-translation picker and correspondence-based rows', () => {
  const reader = fs.readFileSync(path.join(root, 'ui', 'bible-reader.js'), 'utf8');
  const styles = fs.readFileSync(path.join(root, 'ui', 'styles.css'), 'utf8');
  const cacheUi = fs.readFileSync(path.join(root, 'src', 'cache-ui.ts'), 'utf8');

  assert.equal(reader.includes("slice(0, 3)"), true);
  assert.equal(reader.includes("api('/api/bible/parallel-text?'"), true);
  assert.equal(reader.includes('row.baseChapter'), true);
  assert.equal(reader.includes('row.baseVerse'), true);
  assert.equal(reader.includes("className = 'bible-reader-translation-header'"), true);
  assert.equal(reader.includes("className = 'bible-reader-translation-row'"), true);
  assert.equal(reader.includes("textContent = 'Основной'"), true);
  assert.equal(reader.includes("textContent = 'Показать'"), true);
  assert.equal(styles.includes('@container (max-width:760px)'), true);
  assert.equal(styles.includes('.bible-reader-translation-cell::before'), true);
  assert.equal(cacheUi.includes("url.pathname === '/api/bible/parallel-text'"), true);
});

test('reader decodes HTML entities in primary and parallel verse text', () => {
  const reader = fs.readFileSync(path.join(root, 'ui', 'bible-reader.js'), 'utf8');
  const start = reader.indexOf('function bibleReaderDisplayText(value)');
  const end = reader.indexOf('function renderBibleReaderParallelChapter', start);
  assert.ok(start >= 0 && end > start, 'verse text decoder is missing');

  const context = {
    decodeHtmlText:(value:string) => String(value)
      .replaceAll('&lt;', '<')
      .replaceAll('&gt;', '>')
      .replaceAll('&amp;', '&'),
    result:''
  };
  vm.runInNewContext(
    reader.slice(start, end)
      + "\nresult = bibleReaderDisplayText('&lt;To the chief Musician&gt; &amp; Psalm');",
    context
  );

  assert.equal(context.result, '<To the chief Musician> & Psalm');
  assert.equal(reader.includes('primaryText.textContent = bibleReaderDisplayText(verse.text)'), true);
  assert.equal(reader.includes('text.textContent = bibleReaderDisplayText(mappedVerse.text)'), true);
  assert.equal(reader.includes('text.textContent = bibleReaderDisplayText(verse.text)'), true);

  const controller = fs.readFileSync(
    path.join(root, '..', 'Api', 'Application', 'Controllers', 'VerseParsingController.cs'),
    'utf8'
  );
  assert.equal(
    (controller.match(/Text = WebUtility\.HtmlDecode\(text\)/g) || []).length,
    2
  );
});

test('clicking a selected Bible verse clears its selection', () => {
  const reader = fs.readFileSync(path.join(root, 'ui', 'bible-reader.js'), 'utf8');
  const start = reader.indexOf('function toggleBibleReaderVerseSelection(');
  const end = reader.indexOf('function renderBibleReaderParallelChapter', start);
  assert.ok(start >= 0 && end > start, 'verse selection toggle is missing');

  const selected = new Set(['current', 'other']);
  const row = {
    classList:{
      contains:(name:string) => name === 'selected' && selected.has('current'),
      add:(name:string) => { if (name === 'selected') selected.add('current'); },
      remove:(name:string) => { if (name === 'selected') selected.delete('current'); }
    }
  };
  const other = {
    classList:{ remove:(name:string) => { if (name === 'selected') selected.delete('other'); } }
  };
  const saved:unknown[] = [];
  const context = {
    saveBibleReaderState:(state:unknown) => saved.push(state),
    versesEl:{ querySelectorAll:() => [row, other] },
    row,
    selected,
    saved
  };
  vm.runInNewContext(
    reader.slice(start, end)
      + "\ntoggleBibleReaderVerseSelection(versesEl, row, '.selected', 4);",
    context
  );

  assert.equal(selected.size, 0);
  assert.equal(JSON.stringify(saved), JSON.stringify([{ verse:undefined }]));
  assert.equal(
    (reader.match(/toggleBibleReaderVerseSelection\(/g) || []).length,
    3,
    'the helper must be used by both reader modes'
  );
});
