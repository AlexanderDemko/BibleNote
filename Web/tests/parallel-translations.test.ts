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

  class FakeElement {
    children: Array<FakeElement | { textContent: string }> = [];
    className = '';
    classList = { add: (...names: string[]) => { this.className += ` ${names.join(' ')}`; } };
    dataset: Record<string, string> = {};
    style = { setProperty: () => undefined };
    title = '';
    private value = '';
    append(...children: Array<FakeElement | { textContent: string }>) { this.children.push(...children); }
    replaceChildren() { this.children = []; this.value = ''; }
    set textContent(value: string) { this.value = value; this.children = [{ textContent: value }]; }
    get textContent() { return this.value || this.children.map(child => child.textContent).join(''); }
  }
  const renderStart = reader.indexOf('let bibleFootnoteSequence = 0;');
  const renderEnd = reader.indexOf('function prepareInductiveTextElement(', renderStart);
  const richContext = {
    document: {
      createElement: () => new FakeElement(),
      createTextNode: (value: string) => ({ textContent: value })
    },
    inductiveMarksVisible: false,
    validInductiveAnnotationsForText: () => [],
    validInductiveRelationEndpointsForText: () => [],
    result: null as null | ((element: FakeElement, verse: number, text: string, rich: unknown) => void)
  };
  vm.runInNewContext(reader.slice(renderStart, renderEnd) + '\nresult = renderInductiveText;', richContext);
  const rendered = new FakeElement();
  richContext.result!(rendered, Number.NaN, '<Music> & Psalm', {
    decorations: [{ startOffset:0, endOffset:7, kind:'italic' }],
    breaks: [{ offset:8, kind:'paragraph' }]
  });
  assert.equal(rendered.textContent, '<Music> & Psalm');
  assert.match((rendered.children[0] as FakeElement).className, /bible-rich-italic/);
  assert.match((rendered.children[2] as FakeElement).className, /paragraph/);
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

test('selecting a verse from chapter observations highlights and scrolls to it', () => {
  const reader = fs.readFileSync(path.join(root, 'ui', 'bible-reader.js'), 'utf8');
  const start = reader.indexOf('function selectBibleReaderVerse(');
  const end = reader.indexOf('function toggleBibleReaderVerseSelection(', start);
  assert.ok(start >= 0 && end > start, 'explicit verse selection helper is missing');

  const selected = new Set(['other']);
  const other = {
    classList:{ remove:(name:string) => { if (name === 'selected') selected.delete('other'); } }
  };
  const saved:unknown[] = [];
  const scrolls:unknown[] = [];
  const versesEl = { querySelectorAll:() => [other] };
  const row = {
    closest:() => versesEl,
    classList:{ add:(name:string) => { if (name === 'selected') selected.add('current'); } },
    scrollIntoView:(options:unknown) => scrolls.push(options)
  };
  const context = {
    saveBibleReaderState:(state:unknown) => saved.push(state),
    row,
    selected,
    saved,
    scrolls
  };
  vm.runInNewContext(reader.slice(start, end) + '\nselectBibleReaderVerse(row, 7);', context);

  assert.deepEqual([...selected], ['current']);
  assert.equal(JSON.stringify(saved), JSON.stringify([{ verse:7 }]));
  assert.equal(JSON.stringify(scrolls), JSON.stringify([{ block:'center', behavior:'smooth' }]));
});
