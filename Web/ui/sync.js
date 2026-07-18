function showActivity(message, type = 'running', sticky = false) {
  clearTimeout(activityToastTimer);
  activityToastEl.textContent = message;
  activityToastEl.className = 'activity-toast show' + (type === 'running' ? '' : ' ' + type);
  if (!sticky) {
    activityToastTimer = setTimeout(() => {
      activityToastEl.className = 'activity-toast';
    }, type === 'error' ? 9000 : 5000);
  }
}

function updateSyncControls(running) {
  syncRunning = running;
  syncButton.disabled = running || selectedNotebookIds().length === 0;
  reparseBibleCacheButton.disabled = running;
  quickSyncButton.disabled = running || selectedNotebookIds().length === 0;
  quickSyncButton.textContent = running ? '…' : '↻';
  quickSyncButton.setAttribute('aria-label', running
    ? 'Синхронизация выполняется'
    : 'Быстрая синхронизация выбранных блокнотов');
  quickSyncButton.title = running
    ? 'Синхронизация выполняется'
    : 'Быстрая синхронизация: загрузить только новые и изменённые страницы';
  updateSyncSettingsPresentation();
  document.querySelectorAll('.tree-sync').forEach(control => control.setAttribute('aria-disabled', String(running)));
  document.querySelectorAll('.title-sync').forEach(control => {
    control.disabled = running;
    control.classList.toggle('syncing', running && activeSyncContext?.pageId === selectedPageId);
  });
}

function currentSyncSettings() {
  const maxPagesValue = document.getElementById('syncMaxPages').value;
  const refreshValue = document.getElementById('syncRefreshHours').value;
  const metadataOnly = document.getElementById('syncMetadataOnly').checked;
  const replaceAll = !metadataOnly && document.getElementById('syncReplaceAll').checked;
  return {
    maxPages: !replaceAll && maxPagesValue ? Number(maxPagesValue) : undefined,
    concurrency: Number(document.getElementById('syncConcurrency').value),
    refreshOlderThanHours: !replaceAll && refreshValue ? Number(refreshValue) : undefined,
    metadataOnly,
    replaceAll,
    forceContent: !replaceAll && document.getElementById('syncForceContent').checked,
    includeHtml: document.getElementById('syncIncludeHtml').checked,
    parseBibleRefs: document.getElementById('syncParseBibleRefs').checked,
    forceBibleParse: document.getElementById('syncForceBibleParse').checked,
    bibleModule: currentBibleModule()
  };
}

function updateSyncSettingsPresentation() {
  const settings = currentSyncSettings();
  for (const id of ['syncConcurrency', 'syncMetadataOnly']) {
    document.getElementById(id).disabled = syncRunning;
  }
  document.getElementById('syncMaxPages').disabled = syncRunning || settings.replaceAll;
  document.getElementById('syncRefreshHours').disabled = syncRunning || settings.replaceAll;
  document.getElementById('syncReplaceAll').disabled = syncRunning || settings.metadataOnly;
  document.getElementById('syncForceContent').disabled = syncRunning || settings.metadataOnly || settings.replaceAll;
  document.getElementById('syncIncludeHtml').disabled = syncRunning || settings.metadataOnly;
  document.getElementById('syncParseBibleRefs').disabled = syncRunning || settings.metadataOnly;
  document.getElementById('syncForceBibleParse').disabled = syncRunning || settings.metadataOnly || !settings.parseBibleRefs;
  syncSettingsSummaryEl.textContent = settings.metadataOnly
    ? 'Параметры синхронизации · только метаданные'
    : settings.replaceAll
      ? 'Параметры синхронизации · полная перезапись'
    : settings.parseBibleRefs
      ? 'Параметры синхронизации'
      : settings.includeHtml
        ? 'Параметры синхронизации · с HTML'
        : 'Параметры синхронизации';
  syncSettingsNoteEl.textContent = settings.metadataOnly
    ? 'Контент и HTML не скачиваются. Настройка применяется ко всем вариантам синхронизации.'
    : settings.replaceAll
      ? 'Перед полной синхронизацией все таблицы локального кэша будут удалены и созданы заново. Точечные кнопки ↻ эту настройку не используют.'
    : settings.includeHtml
      ? 'HTML будет сохранён при полной и точечной синхронизации. На странице появится кнопка «Показать HTML».'
      : 'Применяются к полной синхронизации и ко всем кнопкам ↻ в дереве.';
}

function saveSyncSettings() {
  localStorage.setItem('onenote.syncSettings', JSON.stringify(currentSyncSettings()));
  updateSyncSettingsPresentation();
}

function loadSyncSettings() {
  try {
    const rawSettings = localStorage.getItem('onenote.syncSettings');
    const settings = JSON.parse(rawSettings || '{}');
    if (!localStorage.getItem('onenote.syncSettings.defaultBibleParse')) {
      settings.includeHtml = true;
      settings.parseBibleRefs = true;
      settings.forceBibleParse = false;
      localStorage.setItem('onenote.syncSettings.defaultBibleParse', 'true');
    }
    if (!localStorage.getItem('onenote.syncSettings.incrementalBibleParseDefault')) {
      settings.forceBibleParse = false;
      localStorage.setItem('onenote.syncSettings.incrementalBibleParseDefault', 'true');
    }
    if (!localStorage.getItem('onenote.syncSettings.defaultConcurrency1')) {
      settings.concurrency = 1;
      localStorage.setItem('onenote.syncSettings.defaultConcurrency1', 'true');
    }
    if (Number.isInteger(settings.maxPages) && settings.maxPages > 0) document.getElementById('syncMaxPages').value = String(settings.maxPages);
    if ([1, 2, 3].includes(settings.concurrency)) document.getElementById('syncConcurrency').value = String(settings.concurrency);
    if (Number.isInteger(settings.refreshOlderThanHours) && settings.refreshOlderThanHours >= 0) document.getElementById('syncRefreshHours').value = String(settings.refreshOlderThanHours);
    document.getElementById('syncMetadataOnly').checked = settings.metadataOnly === true;
    document.getElementById('syncReplaceAll').checked = settings.replaceAll === true;
    document.getElementById('syncForceContent').checked = settings.forceContent === true;
    document.getElementById('syncIncludeHtml').checked = settings.includeHtml !== false;
    document.getElementById('syncParseBibleRefs').checked = settings.parseBibleRefs !== false;
    document.getElementById('syncForceBibleParse').checked = settings.forceBibleParse === true;
    if (typeof settings.bibleModule === 'string' && settings.bibleModule.trim()) bibleModuleNameInput.value = settings.bibleModule.trim();
  } catch {
    localStorage.removeItem('onenote.syncSettings');
  }
  updateSyncSettingsPresentation();
}

for (const id of ['syncMaxPages', 'syncConcurrency', 'syncRefreshHours', 'syncMetadataOnly', 'syncReplaceAll', 'syncForceContent', 'syncIncludeHtml', 'syncParseBibleRefs', 'syncForceBibleParse']) {
  document.getElementById(id).addEventListener('change', saveSyncSettings);
}

function errorMessage(error) {
  return error?.message || String(error);
}

function handleSyncStartError(error) {
  const message = errorMessage(error);
  updateSyncControls(false);
  activeSyncContext = null;
  syncStateEl.textContent = 'Ошибка синхронизации: ' + message;
  showActivity('Ошибка синхронизации: ' + message, 'error');
}

function handleSyncPollError(error) {
  const message = errorMessage(error);
  syncStateEl.textContent = 'Ожидание ответа синхронизации: ' + message;
  showActivity('Ожидание ответа синхронизации: ' + message, 'running', true);
  if (syncRunning || activeSyncContext) {
    clearTimeout(syncPollTimer);
    syncPollTimer = setTimeout(() => refreshSyncState().catch(handleSyncPollError), 3000);
  }
}

async function submitSync(payload, label, context = {}) {
  if (syncRunning) return;
  uiLog('ui.submitSync', { label, context, payload });
  activeSyncContext = { ...context, label };
  updateSyncControls(true);
  syncStateEl.textContent = 'Запуск: ' + label;
  showActivity('Синхронизация: ' + label + '…', 'running', true);
  let started = false;
  try {
    await api('/api/sync', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify(payload),
      timeoutMs:180000
    });
    started = true;
    await refreshSyncState();
  } catch (error) {
    if (started) handleSyncPollError(error);
    else handleSyncStartError(error);
  }
}

function startTargetedSync(scope, label) {
  const payload = { ...currentSyncSettings(), ...scope };
  delete payload.replaceAll;
  if (scope.pageId) {
    delete payload.maxPages;
    if (!payload.metadataOnly) payload.forceContent = true;
  }
  return submitSync(payload, label, scope);
}

quickSyncButton.addEventListener('click', async () => {
  const notebookIds = selectedNotebookIds();
  if (notebookIds.length === 0) {
    syncStateEl.textContent = 'Выберите хотя бы один блокнот';
    return;
  }
  const settings = currentSyncSettings();
  const payload = {
    concurrency: settings.concurrency,
    metadataOnly: false,
    forceContent: false,
    includeHtml: settings.includeHtml,
    parseBibleRefs: settings.parseBibleRefs,
    forceBibleParse: false,
    incrementalMetadata: true,
    bibleModule: settings.bibleModule,
    notebookIds
  };
  await submitSync(payload, 'выбранные блокноты · только изменения', { notebookIds, quick:true });
});

reparseBibleCacheButton.addEventListener('click', async () => {
  const settings = currentSyncSettings();
  await submitSync({
    localBibleReparse: true,
    concurrency: settings.concurrency,
    bibleModule: settings.bibleModule
  }, 'локальный перерасчёт библейских ссылок', { localBibleReparse: true });
});

syncButton.addEventListener('click', async () => {
  const notebookIds = selectedNotebookIds();
  if (notebookIds.length === 0) {
    syncStateEl.textContent = 'Выберите хотя бы один блокнот';
    return;
  }
  const settings = currentSyncSettings();
  if (settings.replaceAll && !window.confirm(
    'Все таблицы локального кэша, история синхронизации, результаты разбора и локальные названия блокнотов будут удалены. Продолжить?'
  )) return;
  if (settings.replaceAll) {
    document.getElementById('syncReplaceAll').checked = false;
    saveSyncSettings();
  }
  await submitSync({ ...settings, notebookIds }, 'выбранные блокноты', { notebookIds });
});

async function refreshSyncState() {
  clearTimeout(syncPollTimer);
  const state = await api('/api/sync', { timeoutMs:120000 });
  const running = state.status === 'running';
  updateSyncControls(running);
  syncButton.textContent = running ? 'Синхронизация выполняется…' : 'Запустить синхронизацию';
  if (running) {
    const progress = state.progress || {};
    const parts = [progress.message || progress.phase || 'Подготовка'];
    if (progress.sectionGroups != null) parts.push('групп разделов: ' + progress.sectionGroups);
    if (progress.sections != null) parts.push('разделов: ' + (progress.sectionTotal ? progress.sections + '/' + progress.sectionTotal : progress.sections));
    if (progress.pages != null) parts.push('страниц: ' + progress.pages);
    if (progress.contentDone != null && progress.contentTotal != null) parts.push('контент: ' + progress.contentDone + '/' + progress.contentTotal);
    if (progress.bibleParseDone != null && progress.bibleParseTotal != null) parts.push('BibleNote: ' + progress.bibleParseDone + '/' + progress.bibleParseTotal);
    if (progress.bibleRefsRecognized != null) parts.push('ссылок: ' + progress.bibleRefsRecognized);
    if (progress.errors) parts.push('ошибок: ' + progress.errors);
    syncStateEl.textContent = parts.join(' · ');
    showActivity(parts.join(' · '), 'running', true);
    if (Date.now() - lastSyncLogRefreshAt > 15000) {
      lastSyncLogRefreshAt = Date.now();
      loadDownloadLog(false).catch(error => console.warn(error));
    }
    syncPollTimer = setTimeout(() => refreshSyncState().catch(handleSyncPollError), 3000);
  } else if (state.status === 'success') {
    const result = state.result;
    const completedContext = activeSyncContext;
    const successMessage = completedContext?.localBibleReparse
      ? 'Готово: локально перепарсено ' + result.bibleRefsPagesParsed + ' из ' + result.pages + ' ' + pluralRu(result.pages, 'страницы', 'страниц', 'страниц') + ', распознано ссылок ' + (result.bibleRefsRecognized || 0) + ', ошибок ' + (result.bibleRefsParseErrors || 0)
      : 'Готово: групп разделов ' + (result.sectionGroups || 0) + ', разделов ' + result.sections + ', ' + result.pages + ' ' + pluralRu(result.pages, 'страница', 'страницы', 'страниц') + ', загружено ' + result.contentDownloaded + ', пропущено ' + result.contentSkipped + ', распознано ссылок ' + (result.bibleRefsRecognized || 0) + ', ошибок ' + result.contentErrors;
    syncStateEl.textContent = successMessage;
    showActivity(successMessage, 'success');
    const status = await api('/api/status');
    statusEl.textContent = cacheStatusText(status);
    if (completedContext?.pageId && selectedPageId === completedContext.pageId) {
      loadDownloadLog(false).catch(error => console.warn(error));
      await openPage(completedContext.pageId, { updateUrl:false, paragraphIndex:currentTargetParagraphIndex });
    } else if (activeSearchQuery) {
      await loadNotebookSelector();
      await loadDownloadLog(true);
      await renderSearch(activeSearchQuery);
    } else {
      await loadNotebookSelector();
      await loadDownloadLog(true);
      await renderTree();
    }
    activeSyncContext = null;
    updateSyncControls(false);
  } else if (state.status === 'failed') {
    syncStateEl.textContent = 'Ошибка: ' + state.error;
    showActivity('Ошибка синхронизации: ' + state.error, 'error');
    activeSyncContext = null;
    updateSyncControls(false);
  } else {
    syncStateEl.textContent = 'Синхронизация не запущена';
  }
}

function showError(error) {
  content.innerHTML = '';
  content.removeAttribute('aria-busy');
  const box = document.createElement('div');
  box.className = 'error-box';
  box.textContent = error.message;
  content.append(box);
  refreshPageFind();
}

function showStartupWait() {
  content.innerHTML = '';
  const box = document.createElement('div');
  box.className = 'empty-state';
  box.textContent = 'Локальный кэш открывается... Обычно это занимает несколько секунд.';
  content.append(box);
  refreshPageFind();
}

async function initializeApp() {
  try {
    await refreshRuntimeSettings().catch(error => console.warn(error));
    if (bibleVersePopupMode) {
      bibleTextTitle.textContent = 'Библейский текст';
      bibleTextMeta.textContent = 'BibleNote';
      bibleTextContent.textContent = 'Загрузка...';
      showBibleTextContextButton.disabled = true;
      showBibleTextParallelButton.disabled = true;
      if (!bibleTextDialog.open) bibleTextDialog.showModal();
      try {
        await openExternalBibleRefFromUrl();
      } catch (error) {
        bibleTextContent.textContent = 'Не удалось открыть библейскую ссылку: ' + (error?.message || String(error));
      }
      return;
    }
    const [status] = await Promise.all([api('/api/status'), loadNotebookSelector()]);
    refreshSyncState().catch(handleSyncPollError);
    const initialBibleLocation = bibleLocationFromUrl();
    const loadBibleModules = refreshBibleReaderModules().catch(error => {
      console.warn(error);
      bibleReaderStatusEl.textContent = error?.message || String(error);
    });
    if (initialBibleLocation) await loadBibleModules;
    statusEl.textContent = cacheStatusText(status);
    const initialPageId = pageIdFromUrl();
    if (initialPageId) {
      await openPage(initialPageId, { replaceUrl:true });
      if (activeSearchQuery) await renderSearch(activeSearchQuery);
      else await renderTree();
    } else if (initialBibleLocation) {
      await openBibleReaderLocation(initialBibleLocation, { replaceUrl:true, rememberHistory:false });
      await renderTree();
    } else {
      renderEmptyPage();
      await renderTree();
    }
    loadDownloadLog(true).catch(error => console.warn(error));
    await openExternalBibleRefFromUrl();
    openSetupWizardIfNeeded().catch(error => console.warn(error));
  } catch (error) {
    if (error && error.status === 503) {
      showStartupWait();
      setTimeout(() => initializeApp().catch(showError), 500);
      return;
    }
    showError(error);
  }
}

hiddenNotebookIds = new Set(loadHiddenNotebookIds());
searchOptions = loadSearchOptions();
searchHistory = loadSearchHistory();
updateSearchOptionButtons();
updateBibleTextHistoryButtons();
loadSyncSettings();
initializeApp().catch(showError);
