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
  assert.equal(sync.includes("? 'Страница удалена из источника данных'"), true);
  assert.equal(sync.includes(": errorCount ? 'Завершено с ошибками' : 'Синхронизация завершена'"), true);
  assert.equal(sync.includes('(result.sectionScanErrors || 0)'), true);
  assert.equal(sync.includes('(result.bibleRefsParseErrors || 0)'), true);
  assert.equal(sync.includes("parts.push('страниц: ' + progress.bibleParseDone + '/' + progress.bibleParseTotal)"), true);
  assert.equal(sync.includes("parts.push('BibleNote: ' + progress.bibleParseDone"), false);
  assert.equal(sync.includes("parts.push('актуальны: ' + progress.bibleParseSkipped)"), false);
  assert.equal(styles.includes('.sync-progress-track'), true);
  assert.equal(styles.includes('.sync-result-metrics'), true);
  assert.equal(styles.includes('.activity-toast.warning'), true);
  assert.equal(sync.includes("document.querySelectorAll('dialog[open]')"), true);
  assert.equal(sync.includes("mirror.className = 'activity-toast dialog-activity-toast'"), true);
  assert.equal(styles.includes('.activity-toast.dialog-activity-toast'), true);
});

test('sync UI discovers externally started synchronization while idle', () => {
  const sync = fs.readFileSync(path.join(uiDirectory, 'sync.js'), 'utf8');
  const initializeStart = sync.indexOf('async function initializeApp()');
  const initialSyncPoll = sync.indexOf('refreshSyncState().catch(handleSyncPollError)', initializeStart);
  const initialStatusLoad = sync.indexOf("api('/api/status')", initializeStart);
  const startupWait = sync.indexOf('await waitForCacheReady()', initializeStart);

  assert.equal(sync.includes('const idleSyncPollIntervalMs = 5000'), true);
  assert.equal(sync.includes('scheduleSyncStatePoll(idleSyncPollIntervalMs)'), true);
  assert.equal(sync.includes('scheduleSyncStatePoll(activeSyncPollIntervalMs)'), true);
  assert.equal(sync.includes('let lastHandledTerminalSyncKey = null'), true);
  assert.equal(sync.includes('terminalSyncKey !== lastHandledTerminalSyncKey'), true);
  assert.equal(sync.includes("api('/api/startup', { timeoutMs:180000 })"), true);
  assert.equal(sync.includes("setTimeout(() => initializeApp().catch(showError), 500)"), false);
  assert.equal(startupWait > initializeStart && startupWait < initialSyncPoll, true);
  assert.equal(initialSyncPoll > initializeStart && initialSyncPoll < initialStatusLoad, true);
});

test('sync UI refreshes source counts when document loading reaches Bible parsing', () => {
  const sync = fs.readFileSync(path.join(uiDirectory, 'sync.js'), 'utf8');
  const syncCore = fs.readFileSync(path.join(uiDirectory, '..', 'src', 'sync.ts'), 'utf8');

  assert.equal(sync.includes("if (progress.phase !== 'bible-parse') return"), true);
  assert.equal(sync.includes('const sourceKey = progress.sourceId'), true);
  assert.equal(sync.includes('await loadNotebookSelector()'), true);
  assert.equal(sync.includes('await renderNotesList()'), true);
  assert.equal(sync.includes('await refreshLiveSyncTree(state, progress)'), true);
  assert.equal(syncCore.includes('sourceId:source.id'), true);
  assert.equal(syncCore.includes('onProgress:progress => options.onProgress?.({ ...progress, ...sourceProgress })'), true);
});

test('targeted sync removes a page that was deleted from classic OneNote', () => {
  const sync = fs.readFileSync(path.join(uiDirectory, 'sync.js'), 'utf8');
  const syncCom = fs.readFileSync(path.join(uiDirectory, '..', 'src', 'sync-com.ts'), 'utf8');

  assert.equal(syncCom.includes('const deletedPagesMarked = markPageDeleted(db, options.pageId, startedAt)'), true);
  assert.equal(syncCom.includes("throw new Error('Страница не найдена в классическом OneNote.')"), true);
  assert.equal(sync.includes('const targetedPageDeleted = Boolean('), true);
  assert.equal(sync.includes('Страница удалена из источника данных и убрана из BibleNote.'), true);
  assert.equal(sync.includes("history.replaceState(null, '', '/')"), true);
  assert.equal(sync.includes('renderEmptyPage();'), true);
});

test('synchronization journal presents durable run history instead of individual pages', () => {
  const cacheUi = fs.readFileSync(path.join(uiDirectory, '..', 'src', 'cache-ui.ts'), 'utf8');
  const journal = fs.readFileSync(path.join(uiDirectory, 'notebooks-log.js'), 'utf8');
  const html = fs.readFileSync(path.join(uiDirectory, 'index.html'), 'utf8');

  assert.equal(cacheUi.includes("url.pathname === '/api/sync-history'"), true);
  assert.equal(cacheUi.includes('saveSyncHistory(db, body, startedAt, finishedAt, result)'), true);
  assert.equal(journal.includes("api('/api/sync-history?'"), true);
  assert.equal(journal.includes("['проверено', values.pages || 0]"), true);
  assert.equal(journal.includes("['загружено', values.contentDownloaded || 0]"), true);
  assert.equal(journal.includes('formatSyncDuration(item.startedAt, item.finishedAt)'), true);
  assert.equal(html.includes('<h2>История синхронизаций</h2>'), true);
  assert.equal(html.includes('id="logFilter"'), false);
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
  assert.equal(html.includes('syncIncludeHtml'), false);
  assert.equal(styles.includes('.sync-advanced'), false);
});
