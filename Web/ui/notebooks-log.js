function selectedNotebookIds() {
  const selected = new Set();
  for (const source of dataSourcesCache) {
    if (source.type === 'folder') {
      for (const notebook of source.notebooks || []) selected.add(notebook.id);
      continue;
    }
    if (Array.isArray(source.notebooks)) {
      for (const notebook of source.notebooks) selected.add(notebook.id);
    }
  }
  for (const notebook of selectableOneNoteNotebooks()) selected.add(notebook.id);
  return [...selected];
}

function selectableOneNoteNotebooks() {
  return notebooksCache.filter(notebook => {
    if (notebook.sourceType !== 'graph' && notebook.sourceType !== 'com') return false;
    const source = dataSourcesCache.find(item => item.type === notebook.sourceType);
    if (!source) return false;
    return !Array.isArray(source.notebooks) || source.notebooks.some(item => item.id === notebook.id);
  });
}

function saveNotebookSelection() {
  const selected = selectedNotebookIds();
  const selectedOneNoteCount = dataSourcesCache
    .filter(source => source.type === 'graph' || source.type === 'com')
    .reduce((count, source) => count + (Array.isArray(source.notebooks) ? source.notebooks.length : 0), 0);
  const hasLegacyAllNotebooksSource = dataSourcesCache.some(source =>
    (source.type === 'graph' || source.type === 'com') && !Array.isArray(source.notebooks)
  );
  syncNotebookSelectionEl.textContent = hasLegacyAllNotebooksSource
    ? 'Будут синхронизированы записные книжки, указанные в каждом источнике OneNote; для прежних источников без списка — все книжки.'
    : selectedOneNoteCount > 0
      ? `Будут синхронизированы записные книжки, указанные в источниках OneNote: ${selectedOneNoteCount}.`
      : 'Папочные источники синхронизируются полностью.';
  syncButton.disabled = syncRunning || selected.length === 0;
  quickSyncButton.disabled = syncRunning || dataSourcesCache.length === 0;
  if (typeof updateSyncSettingsPresentation === 'function') updateSyncSettingsPresentation();
}

async function loadNotebookSelector() {
  [notebooksCache, dataSourcesCache] = await Promise.all([
    api('/api/notebooks'),
    api('/api/data-sources').catch(() => [])
  ]);
  localStorage.removeItem('onenote.hiddenNotebookIds');
  saveNotebookSelection();
}

function openNotebookNameDialog(notebook) {
  editingNotebookId = notebook.id;
  notebookNameOriginalEl.textContent = (notebook.sourceType === 'folder' ? 'Исходное название папки: ' : 'Исходное имя в OneNote: ')
    + notebook.originalDisplayName;
  notebookNameInput.value = notebook.customDisplayName || notebook.originalDisplayName || '';
  resetNotebookNameButton.hidden = !notebook.customDisplayName;
  notebookNameDialog.showModal();
  notebookNameInput.focus();
  notebookNameInput.select();
}

async function saveNotebookDisplayName(displayName) {
  if (!editingNotebookId) return;
  saveNotebookNameButton.disabled = true;
  resetNotebookNameButton.disabled = true;
  try {
    const result = await api('/api/notebook-display-name', {
      method:'PATCH',
      headers:{ 'Content-Type':'application/json' },
      body:JSON.stringify({ notebookId:editingNotebookId, displayName })
    });
    notebookNameDialog.close();
    editingNotebookId = null;
    await loadNotebookSelector();
    await loadDownloadLog(true);
    if (selectedPageId) await openPage(selectedPageId);
    await renderNotesList();
    showActivity('Отображаемое имя сохранено: ' + result.displayName, 'success');
  } catch (error) {
    showActivity('Не удалось сохранить имя: ' + error.message, 'error');
  } finally {
    saveNotebookNameButton.disabled = false;
    resetNotebookNameButton.disabled = false;
  }
}

saveNotebookNameButton.addEventListener('click', () => saveNotebookDisplayName(notebookNameInput.value));
resetNotebookNameButton.addEventListener('click', () => saveNotebookDisplayName(null));
cancelNotebookNameButton.addEventListener('click', () => {
  notebookNameDialog.close();
  editingNotebookId = null;
});
notebookNameDialog.addEventListener('cancel', () => { editingNotebookId = null; });
closeBibleTextButton.addEventListener('click', () => {
  if (bibleVersePopupMode) window.close(); else bibleTextDialog.close();
});
function bibleTextDialogClickIsOutside(event) {
  if (event.target !== bibleTextDialog) return false;
  const rect = bibleTextDialog.getBoundingClientRect();
  return event.clientX < rect.left
    || event.clientX > rect.right
    || event.clientY < rect.top
    || event.clientY > rect.bottom;
}
bibleTextDialog.addEventListener('click', event => {
  if (!bibleTextDialogClickIsOutside(event)) return;
  if (bibleVersePopupMode) window.close(); else bibleTextDialog.close();
});
bibleTextDialog.addEventListener('cancel', event => {
  if (!bibleVersePopupMode) return;
  event.preventDefault();
  window.close();
});
bibleTextBackButton.addEventListener('click', () => navigateBibleTextHistory(-1).catch(showError));
bibleTextForwardButton.addEventListener('click', () => navigateBibleTextHistory(1).catch(showError));
async function openBibleActionInMain(action) {
  if (!currentBibleTextRef) return;
  await api('/api/system/main-bible-action', {
    method:'POST',
    headers:{ 'Content-Type':'application/json' },
    body:JSON.stringify({ action, ref:currentBibleTextRef })
  });
  window.close();
}

showBibleTextInReaderButton.addEventListener('click', () => {
  const action = bibleVersePopupMode ? openBibleActionInMain('reader') : openBibleTextInReader();
  action.catch(showError);
});
showBibleTextContextButton.addEventListener('click', () => showBibleTextContext().catch(showError));
showBibleTextNotesButton.addEventListener('click', () => {
  if (!currentBibleTextRef) return;
  if (bibleVersePopupMode) {
    openBibleActionInMain('notes').catch(showError);
    return;
  }
  bibleTextDialog.close();
  showBibleReaderVerseNotes(currentBibleTextRef).catch(showError);
});
notebookNameInput.addEventListener('keydown', event => {
  if (event.key === 'Enter') {
    event.preventDefault();
    saveNotebookDisplayName(notebookNameInput.value);
  }
});

async function loadDownloadLog(resetOffset) {
  if (resetOffset) logOffset = 0;
  logListEl.replaceChildren();
  const params = new URLSearchParams({
    limit:String(logLimit),
    offset:String(logOffset)
  });
  const result = await api('/api/sync-history?' + params.toString());
  const latest = result.rows[0];
  logSummaryEl.textContent = result.total === 0
    ? 'История синхронизаций'
    : 'История: ' + result.total + ' ' + pluralRu(result.total, 'запуск', 'запуска', 'запусков')
      + (latest?.startedAt ? ' · последняя ' + formatDate(latest.startedAt) : '');
  for (const item of result.rows) {
    const row = document.createElement('article');
    row.className = 'sync-history-row ' + item.status;
    const title = document.createElement('div');
    title.className = 'sync-history-title';
    const badge = document.createElement('span');
    badge.className = 'log-badge ' + item.status;
    const label = document.createElement('span');
    label.textContent = item.status === 'failed'
      ? 'Синхронизация не завершена'
      : item.status === 'completed_with_errors'
        ? 'Завершено с ошибками'
        : 'Синхронизация завершена';
    const date = document.createElement('time');
    date.dateTime = item.startedAt;
    date.textContent = formatDate(item.startedAt);
    title.append(badge, label, date);

    const context = document.createElement('div');
    context.className = 'sync-history-context';
    context.textContent = syncHistoryModeLabel(item.mode) + ' · ' + (item.scope || 'Все источники')
      + ' · ' + formatSyncDuration(item.startedAt, item.finishedAt);

    const metrics = document.createElement('div');
    metrics.className = 'sync-history-metrics';
    const values = item.result || {};
    const errorCount = Number(values.contentErrors || 0)
      + Number(values.sectionScanErrors || 0)
      + Number(values.bibleRefsParseErrors || 0);
    const metricValues = item.mode === 'bible-reparse'
      ? [
          ['обработано', values.bibleRefsPagesParsed || 0],
          ['без изменений', values.bibleRefsParseSkipped || 0],
          ['ссылок', values.bibleRefsRecognized || 0]
        ]
      : [
          ['проверено', values.pages || 0],
          ['загружено', values.contentDownloaded || 0],
          ['без изменений', values.contentSkipped || 0],
          ['ссылок', values.bibleRefsRecognized || 0]
        ];
    if (errorCount > 0 || item.status === 'failed') metricValues.push(['ошибок', errorCount || 1]);
    for (const [metricLabel, metricValue] of metricValues) {
      const metric = document.createElement('span');
      const value = document.createElement('strong');
      value.textContent = Number(metricValue).toLocaleString('ru-RU');
      metric.append(value, ' ' + metricLabel);
      metrics.append(metric);
    }

    row.append(title, context, metrics);
    if (item.error) {
      const error = document.createElement('div');
      error.className = 'sync-history-error';
      error.textContent = item.error;
      row.append(error);
    }
    logListEl.append(row);
  }
  if (result.rows.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'sync-state';
    empty.textContent = 'История пока пуста. Она появится после первой синхронизации.';
    logListEl.append(empty);
  }
  const first = result.total === 0 ? 0 : logOffset + 1;
  const last = Math.min(logOffset + result.rows.length, result.total);
  logPageEl.textContent = first + '–' + last + ' из ' + result.total;
  logPrevButton.disabled = logOffset === 0;
  logNextButton.disabled = logOffset + result.rows.length >= result.total;
}

function syncHistoryModeLabel(mode) {
  return ({
    quick:'Обновление изменений',
    full:'Проверка всех разделов',
    'full-reload':'Полная перезагрузка содержимого',
    rebuild:'Пересоздание локального кэша',
    metadata:'Обновление структуры',
    'bible-reparse':'Пересчёт библейских ссылок',
    page:'Обновление страницы',
    section:'Обновление раздела',
    unknown:'Синхронизация'
  })[mode] || 'Синхронизация';
}

function formatSyncDuration(startedAt, finishedAt) {
  const durationSeconds = Math.max(0, Math.round((Date.parse(finishedAt) - Date.parse(startedAt)) / 1000));
  if (!Number.isFinite(durationSeconds)) return 'длительность неизвестна';
  if (durationSeconds < 60) return durationSeconds + ' сек';
  const minutes = Math.floor(durationSeconds / 60);
  const seconds = durationSeconds % 60;
  if (minutes < 60) return minutes + ' мин' + (seconds ? ' ' + seconds + ' сек' : '');
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return hours + ' ч' + (remainingMinutes ? ' ' + remainingMinutes + ' мин' : '');
}

refreshLogButton.addEventListener('click', () => loadDownloadLog(false).catch(showError));
logPrevButton.addEventListener('click', () => {
  logOffset = Math.max(0, logOffset - logLimit);
  loadDownloadLog(false).catch(showError);
});
logNextButton.addEventListener('click', () => {
  logOffset += logLimit;
  loadDownloadLog(false).catch(showError);
});
