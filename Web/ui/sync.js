function activityToastTargets() {
  const targets = [activityToastEl];
  for (const dialog of document.querySelectorAll('dialog[open]')) {
    let mirror = dialog.querySelector(':scope > .dialog-activity-toast');
    if (!mirror) {
      mirror = document.createElement('div');
      mirror.className = 'activity-toast dialog-activity-toast';
      mirror.setAttribute('role', 'status');
      mirror.setAttribute('aria-live', 'polite');
      dialog.append(mirror);
    }
    targets.push(mirror);
  }
  document.querySelectorAll('.dialog-activity-toast').forEach(mirror => {
    if (!mirror.closest('dialog')?.open) mirror.remove();
  });
  return targets;
}

function setActivityToast(message, type, visible) {
  const className = 'activity-toast' + (type === 'running' ? '' : ' ' + type) + (visible ? ' show' : '');
  for (const toast of activityToastTargets()) {
    toast.textContent = message;
    toast.className = className + (toast === activityToastEl ? '' : ' dialog-activity-toast');
  }
}

function showActivity(message, type = 'running', sticky = false) {
  clearTimeout(activityToastTimer);
  setActivityToast(message, type, true);
  if (!sticky) {
    activityToastTimer = setTimeout(() => {
      setActivityToast(message, type, false);
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
    : 'Обновить изменения в выбранных блокнотах');
  quickSyncButton.title = running
    ? 'Синхронизация выполняется'
    : 'Проверить изменённые разделы и загрузить новые или изменённые страницы';
  updateSyncSettingsPresentation();
  document.querySelectorAll('.tree-sync').forEach(control => control.setAttribute('aria-disabled', String(running)));
  document.querySelectorAll('.title-sync').forEach(control => {
    control.disabled = running;
    control.classList.toggle('syncing', running && activeSyncContext?.pageId === selectedPageId);
  });
}

const syncModeLabels = {
  quick:'Обновить изменения',
  full:'Проверить все разделы',
  rebuild:'Пересоздать локальный кэш'
};
let lastFullContentPolicy = 'changed';
let lastSyncProgressPhase = 'starting';
const safeSyncConcurrency = 1;

function currentSyncMode() {
  return syncModeInputs.find(input => input.checked)?.value || 'quick';
}

function currentContentPolicy(mode = currentSyncMode()) {
  if (mode === 'quick') return 'changed';
  if (mode === 'rebuild') return 'all';
  return syncContentPolicyEl.value;
}

function currentSyncSettings() {
  const mode = currentSyncMode();
  const contentPolicy = currentContentPolicy(mode);
  const metadataOnly = false;
  const replaceAll = mode === 'rebuild';
  return {
    concurrency: safeSyncConcurrency,
    metadataOnly,
    replaceAll,
    forceContent: mode === 'full' && contentPolicy === 'all',
    includeHtml: document.getElementById('syncIncludeHtml').checked,
    parseBibleRefs: true,
    incrementalMetadata: mode === 'quick',
    bibleModule: currentBibleModule()
  };
}

function renderSyncPlan(settings, mode) {
  const selectedCount = selectedNotebookIds().length;
  const contentPolicy = currentContentPolicy(mode);
  const lines = [
    `${selectedCount} ${pluralRu(selectedCount, 'блокнот', 'блокнота', 'блокнотов')}`,
    mode === 'quick' ? 'Только изменённые разделы' : 'Все разделы',
    contentPolicy === 'all'
        ? 'Содержимое всех найденных страниц'
        : 'Только новое и изменённое содержимое',
    mode === 'rebuild' ? 'Локальный кэш будет удалён' : 'Локальный кэш будет сохранён',
    'Библейские ссылки будут обработаны автоматически'
  ];
  syncPlanSummaryEl.replaceChildren();
  for (const line of lines) {
    const item = document.createElement('span');
    item.textContent = line;
    syncPlanSummaryEl.append(item);
  }
}

function updateSyncSettingsPresentation() {
  const mode = currentSyncMode();
  if (mode === 'full') {
    syncContentPolicyEl.value = lastFullContentPolicy;
  } else {
    syncContentPolicyEl.value = mode === 'rebuild' ? 'all' : 'changed';
  }
  const settings = currentSyncSettings();
  for (const input of syncModeInputs) input.disabled = syncRunning;
  syncContentPolicyEl.disabled = syncRunning || mode !== 'full';
  document.getElementById('syncIncludeHtml').disabled = syncRunning || settings.metadataOnly;
  if (!syncRunning) syncButton.textContent = syncModeLabels[mode];
  renderSyncPlan(settings, mode);
}

function saveSyncSettings() {
  const mode = currentSyncMode();
  if (mode === 'full') lastFullContentPolicy = syncContentPolicyEl.value;
  localStorage.setItem('onenote.syncSettings', JSON.stringify({
    ...currentSyncSettings(),
    syncMode:mode === 'rebuild' ? 'full' : mode,
    contentPolicy:lastFullContentPolicy
  }));
  updateSyncSettingsPresentation();
}

function loadSyncSettings() {
  try {
    const rawSettings = localStorage.getItem('onenote.syncSettings');
    const settings = JSON.parse(rawSettings || '{}');
    const mode = ['quick', 'full', 'rebuild'].includes(settings.syncMode)
      ? settings.syncMode
      : rawSettings
        ? settings.replaceAll === true ? 'rebuild' : 'full'
        : 'quick';
    const contentPolicy = ['changed', 'all'].includes(settings.contentPolicy)
      ? settings.contentPolicy
      : settings.forceContent === true
          ? 'all'
          : 'changed';
    lastFullContentPolicy = contentPolicy;
    const modeInput = syncModeInputs.find(input => input.value === mode);
    if (modeInput) modeInput.checked = true;
    syncContentPolicyEl.value = mode === 'full' ? contentPolicy : mode === 'rebuild' ? 'all' : 'changed';
    if (!localStorage.getItem('onenote.syncSettings.defaultBibleParse')) {
      settings.includeHtml = true;
      localStorage.setItem('onenote.syncSettings.defaultBibleParse', 'true');
    }
    document.getElementById('syncIncludeHtml').checked = settings.includeHtml !== false;
    if (typeof settings.bibleModule === 'string' && settings.bibleModule.trim()) bibleModuleNameInput.value = settings.bibleModule.trim();
  } catch {
    localStorage.removeItem('onenote.syncSettings');
  }
  updateSyncSettingsPresentation();
}

for (const id of ['syncContentPolicy', 'syncIncludeHtml']) {
  document.getElementById(id).addEventListener('change', saveSyncSettings);
}
for (const input of syncModeInputs) input.addEventListener('change', saveSyncSettings);

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
  activeSyncContext = { ...context, label, payload };
  lastSyncProgressPhase = payload.localBibleReparse ? 'bible-parse-local' : 'starting';
  updateSyncControls(true);
  syncStateEl.classList.remove('has-result', 'warning', 'success');
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
  delete payload.incrementalMetadata;
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
  await submitSync(payload, 'обновление изменений', { notebookIds, syncMode:'quick', quick:true });
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
  const mode = currentSyncMode();
  const settings = currentSyncSettings();
  if (settings.replaceAll && !window.confirm(
    'Локальный кэш, история синхронизации, результаты разбора и локальные названия блокнотов будут удалены. Все выбранные страницы придётся скачать заново. Продолжить?'
  )) return;
  await submitSync({ ...settings, notebookIds }, syncModeLabels[mode].toLowerCase(), { notebookIds, syncMode:mode });
  if (mode === 'rebuild') {
    const fullModeInput = syncModeInputs.find(input => input.value === 'full');
    if (fullModeInput) fullModeInput.checked = true;
    saveSyncSettings();
  }
});

function syncProgressStages(payload = {}) {
  if (payload.localBibleReparse) return [{ phase:'bible-parse-local', title:'Пересчёт библейских ссылок' }];
  const stages = [{ phase:'structure', title:payload.replaceAll ? 'Пересоздание кэша и проверка структуры' : 'Проверка структуры' }];
  if (!payload.metadataOnly) stages.push({ phase:'content', title:'Загрузка содержимого' });
  if (!payload.metadataOnly && payload.parseBibleRefs !== false) stages.push({ phase:'bible-parse', title:'Обработка библейских ссылок' });
  return stages;
}

function normalizedSyncProgressPhase(phase) {
  if (phase === 'graph-retry') return lastSyncProgressPhase;
  if (phase === 'content') return 'content';
  if (phase === 'bible-parse' || phase === 'bible-parse-local') return phase;
  return 'structure';
}

function localizedSyncProgressMessage(progress) {
  const mode = activeSyncContext?.syncMode;
  switch (progress.phase) {
    case 'starting': return 'Подготовка';
    case 'reset-cache': return 'Пересоздание таблиц локального кэша';
    case 'notebooks': return 'Загрузка списка блокнотов';
    case 'sections': return 'Загрузка списка разделов';
    case 'section-groups': return 'Загрузка структуры групп разделов';
    case 'pages': return mode === 'quick' ? 'Проверка изменённых разделов' : 'Проверка всех разделов';
    case 'content': return 'Загрузка нового и изменённого содержимого';
    case 'bible-parse': return 'Обработка библейских ссылок с помощью BibleNote';
    case 'bible-parse-local': return 'Пересчёт ссылок по сохранённому тексту';
    case 'graph-retry': return progress.message?.replace('Microsoft Graph throttling: retry in', 'Microsoft Graph ограничил запросы; повтор через')
      .replace('Microsoft Graph temporary error', 'Временная ошибка Microsoft Graph') || 'Повтор запроса к Microsoft Graph';
    default: return progress.message || 'Синхронизация';
  }
}

function syncProgressDetails(progress) {
  const parts = [localizedSyncProgressMessage(progress)];
  if (progress.sectionGroups != null) parts.push('групп разделов: ' + progress.sectionGroups);
  if (progress.sections != null) parts.push('разделов: ' + (progress.sectionTotal ? progress.sections + '/' + progress.sectionTotal : progress.sections));
  if (progress.pages != null) parts.push('страниц: ' + progress.pages);
  if (progress.contentDone != null && progress.contentTotal != null) parts.push('содержимое: ' + progress.contentDone + '/' + progress.contentTotal);
  if (progress.contentSkipped != null) parts.push('без изменений: ' + progress.contentSkipped);
  if (progress.bibleParseDone != null && progress.bibleParseTotal != null) parts.push('BibleNote: ' + progress.bibleParseDone + '/' + progress.bibleParseTotal);
  if (progress.bibleParseSkipped != null) parts.push('актуальны: ' + progress.bibleParseSkipped);
  if (progress.bibleRefsRecognized != null) parts.push('ссылок: ' + progress.bibleRefsRecognized);
  if (progress.errors) parts.push('ошибок: ' + progress.errors);
  return parts;
}

function renderSyncProgress(progress) {
  if (progress.phase !== 'graph-retry') lastSyncProgressPhase = progress.phase || lastSyncProgressPhase;
  const stages = syncProgressStages(activeSyncContext?.payload);
  const phase = normalizedSyncProgressPhase(progress.phase);
  const stageIndex = Math.max(0, stages.findIndex(stage => stage.phase === phase));
  const stage = stages[stageIndex] || stages[0];
  const kicker = `Этап ${stageIndex + 1} из ${stages.length}`;
  const details = syncProgressDetails(progress);

  const box = document.createElement('div');
  box.className = 'sync-progress-box';
  const heading = document.createElement('div');
  heading.className = 'sync-progress-heading';
  const kickerEl = document.createElement('span');
  kickerEl.className = 'sync-progress-kicker';
  kickerEl.textContent = kicker;
  const title = document.createElement('strong');
  title.textContent = progress.phase === 'graph-retry' ? stage.title + ' · ожидание Microsoft Graph' : stage.title;
  heading.append(kickerEl, title);

  const track = document.createElement('div');
  track.className = 'sync-progress-track';
  track.setAttribute('aria-label', `${kicker}: ${stage.title}`);
  stages.forEach((item, index) => {
    const marker = document.createElement('span');
    marker.className = index < stageIndex ? 'done' : index === stageIndex ? 'current' : '';
    marker.title = item.title;
    track.append(marker);
  });

  const detail = document.createElement('div');
  detail.className = 'sync-progress-detail';
  detail.textContent = details.join(' · ') || 'Подготовка';
  box.append(heading, track, detail);
  syncStateEl.classList.remove('has-result', 'warning', 'success');
  syncStateEl.replaceChildren(box);
  return `${kicker} · ${stage.title}${details.length ? ' · ' + details.join(' · ') : ''}`;
}

function appendSyncResultMetric(container, label, value) {
  const item = document.createElement('span');
  const number = document.createElement('strong');
  number.textContent = String(value ?? 0);
  const caption = document.createElement('small');
  caption.textContent = label;
  item.append(number, caption);
  container.append(item);
}

function renderSyncResult(result, context) {
  const errorCount = (result.contentErrors || 0) + (result.sectionScanErrors || 0) + (result.bibleRefsParseErrors || 0);
  const targetedPageDeleted = Boolean(context?.pageId && result.deletedPagesMarked > 0 && result.pages === 0);
  const box = document.createElement('div');
  box.className = 'sync-result-box';
  const title = document.createElement('strong');
  title.className = 'sync-result-title';
  title.textContent = targetedPageDeleted
    ? 'Страница удалена из OneNote'
    : errorCount ? 'Завершено с ошибками' : 'Синхронизация завершена';
  const metrics = document.createElement('div');
  metrics.className = 'sync-result-metrics';
  if (targetedPageDeleted) {
    appendSyncResultMetric(metrics, 'убрано из BibleNote', result.deletedPagesMarked);
  } else if (context?.localBibleReparse) {
    appendSyncResultMetric(metrics, 'обработано страниц', result.bibleRefsPagesParsed);
    appendSyncResultMetric(metrics, 'распознано ссылок', result.bibleRefsRecognized);
    appendSyncResultMetric(metrics, 'ошибок', result.bibleRefsParseErrors);
  } else {
    appendSyncResultMetric(metrics, 'проверено страниц', result.pages);
    appendSyncResultMetric(metrics, 'загружено', result.contentDownloaded);
    appendSyncResultMetric(metrics, 'без изменений', result.contentSkipped);
    appendSyncResultMetric(metrics, 'ошибок загрузки', result.contentErrors);
    appendSyncResultMetric(metrics, 'ошибок разделов', result.sectionScanErrors);
    appendSyncResultMetric(metrics, 'ошибок BibleNote', result.bibleRefsParseErrors);
  }
  box.append(title, metrics);
  if (errorCount && typeof openDownloadLogDialog === 'function') {
    const openLog = document.createElement('button');
    openLog.className = 'small-button sync-result-action';
    openLog.type = 'button';
    openLog.textContent = 'Открыть журнал загрузки';
    openLog.addEventListener('click', openDownloadLogDialog);
    box.append(openLog);
  }
  syncStateEl.classList.add('has-result', errorCount ? 'warning' : 'success');
  syncStateEl.replaceChildren(box);
  return { errorCount, title:title.textContent };
}

async function refreshSyncState() {
  clearTimeout(syncPollTimer);
  const state = await api('/api/sync', { timeoutMs:120000 });
  const running = state.status === 'running';
  updateSyncControls(running);
  if (running) syncButton.textContent = 'Синхронизация выполняется…';
  if (running) {
    const progress = state.progress || {};
    const progressText = renderSyncProgress(progress);
    showActivity(progressText, 'running', true);
    if (Date.now() - lastSyncLogRefreshAt > 15000) {
      lastSyncLogRefreshAt = Date.now();
      loadDownloadLog(false).catch(error => console.warn(error));
    }
    syncPollTimer = setTimeout(() => refreshSyncState().catch(handleSyncPollError), 3000);
  } else if (state.status === 'success') {
    const result = state.result;
    const completedContext = activeSyncContext;
    const targetedPageDeleted = Boolean(
      completedContext?.pageId && result.deletedPagesMarked > 0 && result.pages === 0
    );
    const renderedResult = renderSyncResult(result, completedContext);
    const resultSummary = targetedPageDeleted
      ? 'Страница удалена из OneNote и убрана из BibleNote.'
      : completedContext?.localBibleReparse
      ? `${renderedResult.title}: обработано ${result.bibleRefsPagesParsed || 0}, ошибок ${renderedResult.errorCount}`
      : `${renderedResult.title}: проверено ${result.pages || 0}, загружено ${result.contentDownloaded || 0}, ошибок ${renderedResult.errorCount}`;
    showActivity(resultSummary, renderedResult.errorCount ? 'warning' : 'success');
    const status = await api('/api/status');
    statusEl.textContent = cacheStatusText(status);
    if (targetedPageDeleted) {
      if (selectedPageId === completedContext.pageId) {
        if (pageFocusMode) setPageFocusMode(false);
        selectedPageId = null;
        currentTargetParagraphIndex = undefined;
        currentTargetParagraphIndexes = [];
        currentTargetBibleOccurrences = [];
        history.replaceState(null, '', '/');
        renderEmptyPage();
      }
      await loadNotebookSelector();
      await loadDownloadLog(true);
      await renderNotesList();
    } else if (completedContext?.pageId && selectedPageId === completedContext.pageId) {
      loadDownloadLog(false).catch(error => console.warn(error));
      await openPage(completedContext.pageId, { updateUrl:false, paragraphIndex:currentTargetParagraphIndex });
      await renderNotesList();
    } else {
      await loadNotebookSelector();
      await loadDownloadLog(true);
      await renderNotesList();
    }
    activeSyncContext = null;
    updateSyncControls(false);
  } else if (state.status === 'failed') {
    syncStateEl.classList.remove('has-result', 'warning', 'success');
    syncStateEl.textContent = 'Ошибка: ' + state.error;
    showActivity('Ошибка синхронизации: ' + state.error, 'error');
    activeSyncContext = null;
    updateSyncControls(false);
  } else {
    syncStateEl.classList.remove('has-result', 'warning', 'success');
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
      await renderNotesList();
    } else if (initialBibleLocation) {
      await openBibleReaderLocation(initialBibleLocation, { replaceUrl:true, rememberHistory:false });
      await renderNotesList();
    } else {
      renderEmptyPage();
      await renderNotesList();
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
const bibleNoteInitialization = initializeApp().catch(showError);
