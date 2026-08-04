import assert from 'node:assert/strict';
import test from 'node:test';
import { openCacheDb, searchCacheAdvanced, searchCacheRelaxed } from '../src/cache.js';
import { relaxedSearchTextScore } from '../src/cache-search.js';

test('relaxed search weight rewards query word order', () => {
  const ordered = relaxedSearchTextScore('alpha is close to beta', 'alpha beta', false);
  const reversed = relaxedSearchTextScore('beta is close to alpha', 'alpha beta', false);

  assert.ok(ordered);
  assert.ok(reversed);
  assert.ok(ordered.weight > reversed.weight);
});

test('relaxed note search mirrors Bible search thresholds and ranking', () => {
  const db = openCacheDb(':memory:');
  try {
    const insertPage = db.prepare(`
      INSERT INTO pages(
        id, title, content_text, last_modified_date_time,
        parent_notebook_id, parent_notebook_name, parent_section_name
      ) VALUES (?, ?, ?, '2026-07-26T00:00:00Z', 'notebook-1', 'Notebook', 'Section')
    `);
    const insertFts = db.prepare(`
      INSERT INTO pages_fts(page_id, title, content, notebook, section)
      VALUES (?, ?, ?, 'Notebook', 'Section')
    `);
    const addPage = (id: string, title: string, content: string) => {
      insertPage.run(id, title, content);
      insertFts.run(id, title, content);
    };

    addPage('desired', 'Притчи', 'Первый в тяжбе своей прав, но приходит соперник.');
    addPage('distractor', 'Размышления', 'Каждый человек считает свой выбор правильным.');
    addPage('one-term', 'Черновик', 'Здесь упоминается только тяжба.');

    const relaxed = searchCacheRelaxed(db, 'каждый в тяжбе прав', {
      notebookIds:['notebook-1'],
      limit:10
    });
    assert.deepEqual(relaxed.map(result => result.id), ['desired', 'distractor']);
    assert.ok(Number(relaxed[0].search_weight) > Number(relaxed[1].search_weight));

    const twoTerms = searchCacheRelaxed(db, 'каждый тяжбе', {
      notebookIds:['notebook-1'],
      limit:10
    });
    assert.deepEqual(twoTerms.map(result => result.id), []);

    const ignoredShortWord = searchCacheRelaxed(db, 'в тяжбе', {
      notebookIds:['notebook-1'],
      limit:10
    });
    assert.deepEqual(ignoredShortWord.map(result => result.id), ['desired']);
  } finally {
    db.close();
  }
});

test('phrase note search accepts punctuation between consecutive words', () => {
  const db = openCacheDb(':memory:');
  try {
    db.prepare(`
      INSERT INTO pages(
        id, title, content_text, last_modified_date_time,
        parent_notebook_id, parent_notebook_name, parent_section_name
      ) VALUES (?, ?, ?, '2026-08-03T00:00:00Z', 'notebook-1', 'Notebook', 'Section')
    `).run('phrase-page', 'К Ефесянам', '1 Павел, апостол Христа Иисуса.');

    const results = searchCacheAdvanced(db, 'павел апостол христа', {
      mode:'phrase',
      caseSensitive:false,
      notebookIds:['notebook-1'],
      limit:10
    });

    assert.deepEqual(results.map(result => result.id), ['phrase-page']);
    assert.match(String(results[0].snippet), /Павел, апостол Христа/u);
  } finally {
    db.close();
  }
});
