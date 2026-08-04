import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import {
  createInductiveAnnotations,
  createInductiveRelation,
  createInductiveStyle,
  deleteInductiveAnnotation,
  deleteInductiveRelation,
  inductiveDbPath,
  listAllInductiveAnnotations,
  listAllInductiveRelations,
  listInductiveAnnotations,
  listInductiveRelations,
  listInductiveStyles,
  openInductiveDb,
  updateInductiveStyle
} from '../src/inductive-markings.js';

test('inductive markings live in a separate user database and persist semantic anchors', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'biblenote-inductive-'));
  const cacheDbPath = path.join(directory, 'onenote-cache.sqlite');
  const db = openInductiveDb(cacheDbPath);
  try {
    assert.equal(inductiveDbPath(cacheDbPath), path.join(directory, 'biblenote-user.sqlite'));
    const styles = listInductiveStyles(db);
    assert.ok(styles.length >= 10);
    assert.equal(styles.find(style => style.id === 'contrast')?.symbol, '↔');
    assert.equal(styles.find(style => style.id === 'conclusion')?.symbol, '∴');

    const custom = createInductiveStyle(db, {
      name:'Завет',
      symbol:'◇',
      color:'#365f91',
      backgroundColor:'#dce8f5',
      decoration:'box'
    });
    assert.equal(custom.name, 'Завет');
    assert.equal(custom.builtIn, false);

    const [annotation] = createInductiveAnnotations(db, [{
      module:'rst',
      bookIndex:1,
      chapter:12,
      verse:2,
      startOffset:5,
      endOffset:10,
      quote:'завет',
      prefix:'Мой ',
      suffix:' с вами',
      styleId:custom.id
    }]);
    assert.equal(annotation.quote, 'завет');
    assert.equal(annotation.styleName, 'Завет');

    const [sameAnchor] = createInductiveAnnotations(db, [{
      module:'rst',
      bookIndex:1,
      chapter:12,
      verse:2,
      startOffset:5,
      endOffset:10,
      quote:'завет',
      styleId:custom.id,
      note:'Повторное сохранение обновляет, а не дублирует отметку.'
    }]);
    assert.equal(sameAnchor.id, annotation.id);

    const annotations = listInductiveAnnotations(db, { module:'rst', bookIndex:1, chapter:12 });
    assert.equal(annotations.length, 1);
    assert.equal(annotations[0].note, 'Повторное сохранение обновляет, а не дублирует отметку.');
    const updated = updateInductiveStyle(db, custom.id, {
      name:'Обновлённый Завет',
      symbol:'◇',
      color:'#274c77',
      backgroundColor:'#e7f0f8',
      decoration:'double'
    });
    assert.equal(updated?.name, 'Обновлённый Завет');
    assert.equal(updated?.builtIn, false);
    assert.equal(listInductiveAnnotations(db, { module:'rst', bookIndex:1, chapter:12 })[0].styleName, 'Обновлённый Завет');
    const [targetAnnotation] = createInductiveAnnotations(db, [{
      module:'rst',
      bookIndex:1,
      chapter:12,
      verse:3,
      startOffset:0,
      endOffset:5,
      quote:'слово',
      styleId:custom.id
    }]);
    const relation = createInductiveRelation(db, {
      module:'rst',
      bookIndex:1,
      chapter:12,
      source:{ verse:2, startOffset:5, endOffset:10, quote:'завет' },
      target:{ verse:3, startOffset:0, endOffset:5, quote:'слово' },
      type:'contrast',
      note:'Две связанные фразы'
    });
    assert.deepEqual(new Set([relation.sourceQuote, relation.targetQuote]), new Set(['завет', 'слово']));
    assert.equal(listInductiveRelations(db, { module:'rst', bookIndex:1, chapter:12 }).length, 1);
    assert.equal(deleteInductiveAnnotation(db, targetAnnotation.id), true);
    assert.equal(deleteInductiveAnnotation(db, annotation.id), true);
    assert.equal(listInductiveAnnotations(db, { module:'rst', bookIndex:1, chapter:12 }).length, 0);
    assert.equal(listInductiveRelations(db, { module:'rst', bookIndex:1, chapter:12 }).length, 1);
    assert.equal(deleteInductiveRelation(db, relation.id), true);
  } finally {
    if (db.open) db.close();
    fs.rmSync(directory, { recursive:true, force:true });
  }
});

test('edits to built-in inductive styles survive reopening the user database', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'biblenote-inductive-style-'));
  const cacheDbPath = path.join(directory, 'onenote-cache.sqlite');
  let db = openInductiveDb(cacheDbPath);
  try {
    const original = listInductiveStyles(db).find(style => style.id === 'god');
    assert.ok(original);
    const updated = updateInductiveStyle(db, 'god', {
      name:'Имя Бога',
      symbol:'○',
      color:'#123456',
      backgroundColor:'#abcdef',
      decoration:'wavy'
    });
    assert.equal(updated?.builtIn, true);
    db.close();
    db = openInductiveDb(cacheDbPath);
    const reopened = listInductiveStyles(db).find(style => style.id === 'god');
    assert.equal(reopened?.name, 'Имя Бога');
    assert.equal(reopened?.symbol, '○');
    assert.equal(reopened?.decoration, 'wavy');
  } finally {
    db.close();
    fs.rmSync(directory, { recursive:true, force:true });
  }
});

test('legacy annotation-based relations migrate to independent text ranges', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'biblenote-inductive-relation-migration-'));
  const cacheDbPath = path.join(directory, 'onenote-cache.sqlite');
  let db = openInductiveDb(cacheDbPath);
  try {
    const annotations = createInductiveAnnotations(db, [
      {
        module:'rst', bookIndex:43, chapter:1, verse:1,
        startOffset:0, endOffset:8, quote:'В начале', styleId:'keyword'
      },
      {
        module:'rst', bookIndex:43, chapter:1, verse:2,
        startOffset:9, endOffset:17, quote:'в начале', styleId:'keyword'
      }
    ]);
    const source = annotations.find(annotation => Number(annotation.verse) === 1);
    const target = annotations.find(annotation => Number(annotation.verse) === 2);
    assert.ok(source && target);
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO inductive_relations(
        id, module, book_index, chapter, source_annotation_id, target_annotation_id,
        relation_type, note, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('legacy-relation', 'rst', 43, 1, source.id, target.id, 'comparison', 'Старая связь', now, now);
    db.close();

    db = openInductiveDb(cacheDbPath);
    const [migrated] = listInductiveRelations(db, { module:'rst', bookIndex:43, chapter:1 });
    assert.equal(migrated.id, 'legacy-relation');
    assert.equal(migrated.sourceQuote, 'В начале');
    assert.equal(migrated.targetQuote, 'в начале');
    assert.equal(deleteInductiveAnnotation(db, source.id), true);
    assert.equal(listInductiveRelations(db, { module:'rst', bookIndex:43, chapter:1 }).length, 1);
  } finally {
    if (db.open) db.close();
    fs.rmSync(directory, { recursive:true, force:true });
  }
});

test('reader assets expose the inductive palette, chapter observations, and exact-match batch action', () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const reader = fs.readFileSync(path.join(root, 'ui', 'bible-reader.js'), 'utf8');
  const styles = fs.readFileSync(path.join(root, 'ui', 'styles.css'), 'utf8');
  const html = fs.readFileSync(path.join(root, 'ui', 'index.html'), 'utf8');
  const cacheUi = fs.readFileSync(path.join(root, 'src', 'cache-ui.ts'), 'utf8');

  assert.equal(reader.includes("api('/api/inductive/styles'"), true);
  assert.equal(reader.includes("api('/api/inductive/annotations?'"), true);
  assert.equal(reader.includes("api('/api/inductive/relations?'"), true);
  assert.equal(reader.includes('function beginInductiveRelationFromSelection('), true);
  assert.equal(reader.includes('function createInductiveRelationFromSelection('), true);
  assert.equal(reader.includes('function handleInductiveMarkClick('), true);
  assert.equal(reader.includes("textElement.addEventListener('click', handleInductiveMarkClick)"), true);
  assert.equal(reader.includes("mark.classList.toggle('relation-active'"), true);
  assert.equal(reader.includes("endpoint.side === 'source' ? '①→' : '→②'"), true);
  assert.equal(reader.includes('function allInductiveOccurrences('), true);
  assert.equal(reader.includes("allInput.dataset.inductiveAll = 'true'"), true);
  assert.equal(reader.includes("observations.setAttribute('aria-label', 'Индуктивные наблюдения')"), true);
  assert.equal(reader.includes('function redoInductiveMarks()'), true);
  assert.equal(reader.includes('let inductiveUndoStack = [];'), true);
  assert.equal(reader.includes('let inductiveRedoStack = [];'), true);
  assert.equal(reader.includes('inductiveUndoStack.length > 100'), true);
  assert.equal(reader.includes('function selectBibleReaderVerse('), true);
  assert.equal(reader.includes('inductiveVisibilityButton.disabled = inductiveMode'), true);
  assert.equal(reader.includes('inductive-popover-hint'), true);
  assert.equal(reader.includes('let inductiveObservationStyleFilter = null;'), true);
  assert.equal(reader.includes("const inductiveAvailableRelationTypes = ['contrast', 'comparison', 'cause'];"), true);
  assert.equal(reader.includes("const inductiveLegacyRelationStyleIds = new Set(['contrast', 'comparison']);"), true);
  assert.equal(reader.includes("annotation.styleId === inductiveObservationStyleFilter"), true);
  assert.equal(reader.includes("item.setAttribute('aria-pressed', String(selected))"), true);
  assert.equal(reader.includes("showInductiveStyleForm(entry, style)"), true);
  assert.equal(reader.includes("method:style ? 'PATCH' : 'POST'"), true);
  assert.equal(reader.includes("querySelector('.inductive-style-form')?.remove()"), true);
  assert.equal(reader.includes('palette.after(form)'), true);
  assert.equal(reader.includes("collapseButton.textContent = inductivePanelCollapsed ? '‹' : 'Свернуть ›'"), true);
  assert.equal(reader.includes('const allObservationCount = allObservationGroups.length + relationCount;'), true);
  assert.equal(reader.includes("mode.title = inductiveMode ? 'Выключить режим разметки' : 'Включить режим разметки'"), true);
  assert.equal(styles.includes('.inductive-selection-popover {'), true);
  assert.equal(styles.includes('.inductive-side-style.active {'), true);
  assert.equal(styles.includes('.inductive-side-style-edit {'), true);
  assert.equal(styles.includes('.inductive-popover-options label { display:flex; align-items:center;'), true);
  assert.equal(styles.includes('.inductive-relation-row {'), true);
  assert.equal(styles.includes('.inductive-relation-endpoint[data-relations]::after {'), true);
  assert.equal(styles.includes('.inductive-relation-endpoint.relation-active {'), true);
  assert.equal(styles.includes('.inductive-relation-row.active {'), true);
  assert.equal(styles.includes('.inductive-observations-panel {'), true);
  assert.equal(styles.includes('.inductive-reader-workspace.panel-collapsed {'), true);
  assert.equal(styles.includes(':root .page.bible-reader-page { width:100%; max-width:none;'), true);
  assert.equal(html.includes('id="exportInductiveMarkings"'), true);
  assert.equal(html.includes('id="exportAllInductiveMarkings"'), true);
  assert.equal(html.includes('Экспортировать разметку текущей главы'), true);
  assert.equal(html.includes('Экспортировать разметку всей Библии'), true);
  assert.equal(reader.includes("api('/api/inductive/export'"), true);
  assert.equal(cacheUi.includes("url.pathname === '/api/inductive/export'"), true);
  assert.equal(cacheUi.includes('listAllInductiveAnnotations(inductiveDb)'), true);
  assert.equal(cacheUi.includes('listAllInductiveRelations(inductiveDb)'), true);
  assert.equal(cacheUi.includes("url.pathname === '/api/inductive/annotations'"), true);
  assert.equal(cacheUi.includes("url.pathname === '/api/inductive/relations'"), true);
  assert.equal(cacheUi.includes("request.method === 'PATCH'"), true);
});

test('whole-Bible inductive export queries include markings from different chapters', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'biblenote-inductive-all-'));
  const cacheDbPath = path.join(directory, 'onenote-cache.sqlite');
  const db = openInductiveDb(cacheDbPath);
  try {
    createInductiveAnnotations(db, [
      { module:'rst', bookIndex:43, chapter:1, verse:1, startOffset:0, endOffset:8, quote:'В начале', styleId:'keyword' },
      { module:'rst', bookIndex:43, chapter:2, verse:1, startOffset:0, endOffset:5, quote:'слово', styleId:'keyword' }
    ]);
    createInductiveRelation(db, {
      module:'rst', bookIndex:43, chapter:2,
      source:{ verse:1, startOffset:0, endOffset:5, quote:'слово' },
      target:{ verse:2, startOffset:6, endOffset:9, quote:'Бог' },
      type:'comparison'
    });
    assert.deepEqual(listAllInductiveAnnotations(db).map(item => Number(item.chapter)), [1, 2]);
    assert.deepEqual(listAllInductiveRelations(db).map(item => Number(item.chapter)), [2]);
  } finally {
    db.close();
    fs.rmSync(directory, { recursive:true, force:true });
  }
});

test('reader expands partial selections to whole words and joins adjacent marks of one style', () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const reader = fs.readFileSync(path.join(root, 'ui', 'bible-reader.js'), 'utf8');
  const start = reader.indexOf('function inductiveWordCharacter(');
  const end = reader.indexOf('function inductiveTextElementFromNode(', start);
  assert.ok(start >= 0 && end > start, 'selection normalization helpers are missing');
  const context:{ result?:unknown } = {};
  vm.runInNewContext(reader.slice(start, end) + `
    const text = 'землю Ханаанскую, Бог Всемогущий';
    const range = expandInductiveSelectionToWordBoundaries(text, 1, 14);
    const clicked = inductiveWordAtPoint('Оно было в начале у Бога.', 13);
    const adjacent = coalesceInductiveAnnotations([
      { id:'a', styleId:'god', startOffset:18, endOffset:21, quote:'Бог' },
      { id:'b', styleId:'god', startOffset:22, endOffset:33, quote:'Всемогущий' }
    ], text);
    const separated = coalesceInductiveAnnotations([
      { id:'a', styleId:'god', startOffset:0, endOffset:3, quote:'Бог' },
      { id:'b', styleId:'god', startOffset:8, endOffset:19, quote:'Всемогущий' }
    ], 'Бог наш Всемогущий');
    result = { range, clicked, adjacent, separated };
  `, context);
  const result = JSON.parse(JSON.stringify(context.result));
  assert.deepEqual(result.range, { startOffset:0, endOffset:16, quote:'землю Ханаанскую' });
  assert.deepEqual(result.clicked, { startOffset:11, endOffset:17, quote:'начале' });
  assert.equal(result.adjacent.length, 1);
  assert.equal(result.adjacent[0].quote, 'Бог Всемогущий');
  assert.deepEqual(result.adjacent[0].sourceIds, ['a', 'b']);
  assert.equal(result.separated.length, 2);
});

test('clicking the other endpoint keeps a relation highlighted and only the same endpoint clears it', () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const reader = fs.readFileSync(path.join(root, 'ui', 'bible-reader.js'), 'utf8');
  const start = reader.indexOf('function toggleInductiveRelationIds(');
  const end = reader.indexOf('function handleInductiveMarkClick(', start);
  assert.ok(start >= 0 && end > start, 'relation highlight helpers are missing');
  const context:{ result?:unknown } = {};
  vm.runInNewContext(`
    let inductiveActiveRelationIds = [];
    let inductiveActiveRelationAnchorIds = [];
    function refreshInductiveRendering() {}
  ` + reader.slice(start, end) + `
    toggleInductiveRelationsForEndpoint(['r1:source'], ['r1']);
    const first = { relations:[...inductiveActiveRelationIds], anchor:[...inductiveActiveRelationAnchorIds] };
    toggleInductiveRelationsForEndpoint(['r1:target'], ['r1']);
    const second = { relations:[...inductiveActiveRelationIds], anchor:[...inductiveActiveRelationAnchorIds] };
    toggleInductiveRelationsForEndpoint(['r1:target'], ['r1']);
    const repeated = { relations:[...inductiveActiveRelationIds], anchor:[...inductiveActiveRelationAnchorIds] };
    result = { first, second, repeated };
  `, context);
  assert.deepEqual(JSON.parse(JSON.stringify(context.result)), {
    first:{ relations:['r1'], anchor:['r1:source'] },
    second:{ relations:['r1'], anchor:['r1:target'] },
    repeated:{ relations:[], anchor:[] }
  });
});
