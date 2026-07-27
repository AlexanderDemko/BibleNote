import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const uiDirectory = fileURLToPath(new URL('../ui/', import.meta.url));

test('sync UI exposes clear modes instead of conflicting technical flags', () => {
  const html = fs.readFileSync(path.join(uiDirectory, 'index.html'), 'utf8');
  const sync = fs.readFileSync(path.join(uiDirectory, 'sync.js'), 'utf8');

  assert.equal(html.includes('id="syncModeQuick"'), true);
  assert.equal(html.includes('id="syncModeFull"'), true);
  assert.equal(html.includes('id="syncModeRebuild"'), true);
  assert.equal(html.includes('id="syncContentPolicy"'), true);
  assert.equal(html.includes('Пересоздать локальный кэш'), true);
  assert.equal(html.includes('id="syncMetadataOnly"'), false);
  assert.equal(html.includes('id="syncReplaceAll"'), false);
  assert.equal(html.includes('id="syncForceContent"'), false);
  assert.equal(html.includes('value="metadata"'), false);
  assert.equal((html.match(/class="sync-panel"/g) || []).length, 1);
  assert.equal(html.includes('<summary id="syncSettingsSummary">Синхронизация</summary>'), true);
  assert.equal(html.includes('<summary>Запуск синхронизации</summary>'), false);

  assert.equal(sync.includes("incrementalMetadata: mode === 'quick'"), true);
  assert.equal(sync.includes("const replaceAll = mode === 'rebuild'"), true);
  assert.equal(sync.includes("forceContent: mode === 'full' && contentPolicy === 'all'"), true);
});

test('Bible reference parsing is mandatory and visible as a sync stage', () => {
  const html = fs.readFileSync(path.join(uiDirectory, 'index.html'), 'utf8');
  const sync = fs.readFileSync(path.join(uiDirectory, 'sync.js'), 'utf8');

  assert.equal(html.includes('id="syncParseBibleRefs"'), false);
  assert.equal(html.includes('id="syncForceBibleParse"'), false);
  assert.equal(sync.includes('parseBibleRefs: true'), true);
  assert.equal(sync.includes("getElementById('syncForceBibleParse')"), false);
  assert.equal(sync.includes("title:'Обработка библейских ссылок'"), true);
  assert.equal(sync.includes('Библейские ссылки будут обработаны автоматически'), true);
});

test('sync progress and partial failures are presented as one staged operation', () => {
  const sync = fs.readFileSync(path.join(uiDirectory, 'sync.js'), 'utf8');
  const styles = fs.readFileSync(path.join(uiDirectory, 'styles.css'), 'utf8');

  assert.equal(sync.includes('function renderSyncProgress(progress)'), true);
  assert.equal(sync.includes('Этап ${stageIndex + 1} из ${stages.length}'), true);
  assert.equal(sync.includes("title.textContent = errorCount ? 'Завершено с ошибками'"), true);
  assert.equal(sync.includes('(result.sectionScanErrors || 0)'), true);
  assert.equal(sync.includes('(result.bibleRefsParseErrors || 0)'), true);
  assert.equal(styles.includes('.sync-progress-track'), true);
  assert.equal(styles.includes('.sync-result-metrics'), true);
  assert.equal(styles.includes('.activity-toast.warning'), true);
});

test('advanced sync settings omit technical limits and use the safe request speed', () => {
  const html = fs.readFileSync(path.join(uiDirectory, 'index.html'), 'utf8');
  const sync = fs.readFileSync(path.join(uiDirectory, 'sync.js'), 'utf8');
  const styles = fs.readFileSync(path.join(uiDirectory, 'styles.css'), 'utf8');

  assert.equal(html.includes('id="syncRefreshHours"'), false);
  assert.equal(sync.includes("getElementById('syncRefreshHours')"), false);
  assert.equal(html.includes('id="syncMaxPages"'), false);
  assert.equal(sync.includes("getElementById('syncMaxPages')"), false);
  assert.equal(html.includes('id="syncConcurrency"'), false);
  assert.equal(html.includes('id="syncConcurrencyWarning"'), false);
  assert.equal(sync.includes('const safeSyncConcurrency = 1'), true);
  assert.equal(sync.includes('concurrency: safeSyncConcurrency'), true);
  assert.equal(html.includes('которые ещё не были обработаны'), false);
  assert.equal(styles.includes('.sync-panel .sync-advanced > summary::after'), true);
  assert.equal(styles.includes('.sync-panel .sync-advanced[open] > summary::after'), true);
});
