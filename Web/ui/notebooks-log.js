function loadHiddenNotebookIds() {
  try {
    const value = JSON.parse(localStorage.getItem('onenote.hiddenNotebookIds') || '[]');
    return Array.isArray(value) ? value.filter(id => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

function selectedNotebookIds() {
  return notebooksCache.filter(notebook => !hiddenNotebookIds.has(notebook.id)).map(notebook => notebook.id);
}

function saveNotebookSelection() {
  localStorage.setItem('onenote.hiddenNotebookIds', JSON.stringify([...hiddenNotebookIds]));
  const selected = selectedNotebookIds();
  notebookSummaryEl.textContent = 'Записные книжки: ' + selected.length + '/' + notebooksCache.length;
  syncNotebookSelectionEl.textContent = selected.length
    ? 'Будут синхронизированы выбранные блокноты: ' + selected.length
    : 'Выберите хотя бы один блокнот';
  syncButton.disabled = syncRunning || selected.length === 0;
  quickSyncButton.disabled = syncRunning || selected.length === 0;
}

async function loadNotebookSelector() {
  notebooksCache = await api('/api/notebooks');
  notebookListEl.replaceChildren();
  for (const notebook of notebooksCache) {
    const item = document.createElement('div');
    item.className = 'notebook-option';
    const choice = document.createElement('label');
    choice.className = 'notebook-choice';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = !hiddenNotebookIds.has(notebook.id);
    checkbox.dataset.notebookId = notebook.id;
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) hiddenNotebookIds.delete(notebook.id); else hiddenNotebookIds.add(notebook.id);
      saveNotebookSelection();
      if (activeSearchQuery) renderSearch(activeSearchQuery).catch(showError); else renderTree().catch(showError);
      loadDownloadLog(true).catch(showError);
    });
    const text = document.createElement('span');
    text.className = 'notebook-name';
    text.textContent = notebook.displayName + ' (' + notebook.pageCount + ')';
    if (notebook.customDisplayName) text.title = 'Исходное имя OneNote: ' + notebook.originalDisplayName;
    const rename = document.createElement('button');
    rename.className = 'notebook-rename';
    rename.type = 'button';
    rename.textContent = '\u270E';
    rename.title = 'Изменить отображаемое имя';
    rename.setAttribute('aria-label', 'Изменить отображаемое имя «' + notebook.displayName + '»');
    rename.addEventListener('click', () => openNotebookNameDialog(notebook));
    choice.append(checkbox, text);
    item.append(choice, rename);
    notebookListEl.append(item);
  }
  saveNotebookSelection();
}

function openNotebookNameDialog(notebook) {
  editingNotebookId = notebook.id;
  notebookNameOriginalEl.textContent = 'Исходное имя в OneNote: ' + notebook.originalDisplayName;
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
    else if (activeSearchQuery) await renderSearch(activeSearchQuery);
    else await renderTree();
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
showBibleTextParallelButton.addEventListener('click', () => {
  if (currentBibleTextRef) loadParallelRefs(currentBibleTextRef, bibleTextParallelPanel).catch(showError);
});
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

selectAllNotebooksButton.addEventListener('click', () => {
  hiddenNotebookIds.clear();
  loadNotebookSelector().then(async () => {
    await (activeSearchQuery ? renderSearch(activeSearchQuery) : renderTree());
    await loadDownloadLog(true);
  }).catch(showError);
});

clearAllNotebooksButton.addEventListener('click', () => {
  for (const notebook of notebooksCache) hiddenNotebookIds.add(notebook.id);
  loadNotebookSelector().then(async () => {
    await (activeSearchQuery ? renderSearch(activeSearchQuery) : renderTree());
    await loadDownloadLog(true);
  }).catch(showError);
});

async function loadDownloadLog(resetOffset) {
  if (resetOffset) logOffset = 0;
  const selectedIds = selectedNotebookIds();
  logListEl.replaceChildren();
  if (selectedIds.length === 0) {
    logSummaryEl.textContent = 'Журнал загрузки: нет выбранных блокнотов';
    logPageEl.textContent = '0 из 0';
    logPrevButton.disabled = true;
    logNextButton.disabled = true;
    return;
  }
  const params = new URLSearchParams({
    filter:logFilterEl.value,
    limit:String(logLimit),
    offset:String(logOffset)
  });
  for (const notebookId of selectedIds) params.append('notebookId', notebookId);
  const result = await api('/api/download-log?' + params.toString());
  logSummaryEl.textContent = 'Журнал: ' + result.counts.downloaded + ' загружено · ' + result.counts.missing + ' не загружено · ' + result.counts.errors + ' ' + pluralRu(result.counts.errors, 'ошибка', 'ошибки', 'ошибок');
  for (const item of result.rows) {
    const button = document.createElement('button');
    button.className = 'log-row';
    button.type = 'button';
    button.onclick = () => openPage(item.id);
    const title = document.createElement('div');
    title.className = 'log-title';
    const badge = document.createElement('span');
    badge.className = 'log-badge ' + item.status;
    const label = document.createElement('span');
    label.textContent = item.title || '(без названия)';
    title.append(badge, label);
    const path = document.createElement('div');
    path.className = 'log-path';
    path.textContent = [item.notebook, item.section].filter(Boolean).join(' / ');
    const detail = document.createElement('div');
    detail.className = 'log-detail' + (item.status === 'error' ? ' error' : '');
    detail.textContent = item.error || (item.contentSyncedAt ? 'Загружено: ' + formatDate(item.contentSyncedAt) : 'Контент не загружен');
    button.append(title, path, detail);
    logListEl.append(button);
  }
  if (result.rows.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'sync-state';
    empty.textContent = 'Нет страниц для выбранного фильтра';
    logListEl.append(empty);
  }
  const first = result.total === 0 ? 0 : logOffset + 1;
  const last = Math.min(logOffset + result.rows.length, result.total);
  logPageEl.textContent = first + '–' + last + ' из ' + result.total;
  logPrevButton.disabled = logOffset === 0;
  logNextButton.disabled = logOffset + result.rows.length >= result.total;
}

logFilterEl.addEventListener('change', () => loadDownloadLog(true).catch(showError));
refreshLogButton.addEventListener('click', () => loadDownloadLog(false).catch(showError));
logPrevButton.addEventListener('click', () => {
  logOffset = Math.max(0, logOffset - logLimit);
  loadDownloadLog(false).catch(showError);
});
logNextButton.addEventListener('click', () => {
  logOffset += logLimit;
  loadDownloadLog(false).catch(showError);
});
