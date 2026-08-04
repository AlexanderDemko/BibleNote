function setupSettingsDialog() {
  for (const selector of ['.notebook-panel', '.sync-panel']) {
    const panel = document.querySelector(selector);
    if (panel) {
      panel.removeAttribute('open');
      settingsMovedPanels.append(panel);
    }
  }
  if (!localStorage.getItem('onenote.defaultHtmlZoom.100Default')) {
    localStorage.setItem('onenote.defaultHtmlZoom', '100');
    localStorage.setItem('onenote.defaultHtmlZoom.100Default', 'true');
  }
  bibleModuleNameInput.value = localStorage.getItem('onenote.bibleModule') || 'rst';
  pageViewModeSelect.value = defaultPageViewMode();
  defaultHtmlZoomInput.value = String(defaultHtmlZoom());
  showAuxBibleRefsInput.checked = showAuxBibleRefs();
  updateBibleModuleUploadState();
}

function setupDownloadLogDialog() {
  const logPanel = document.querySelector('.log-panel');
  if (logPanel) {
    logPanel.setAttribute('open', '');
    downloadLogDialogContent.append(logPanel);
  }
}

function openDownloadLogDialog() {
  uiLog('ui.openDownloadLog', {});
  if (!downloadLogDialog.open) downloadLogDialog.showModal();
  loadDownloadLog(false).catch(showError);
}

function currentBibleModule() {
  return (bibleModuleNameInput.value || 'rst').trim() || 'rst';
}

function saveBibleModuleSetting() {
  localStorage.setItem('onenote.bibleModule', currentBibleModule());
}

function moduleDisplayName(module) {
  return module.displayName || module.shortName || '(без имени)';
}

function fillBibleModuleSelect(select, modules, selectedModule) {
  select.replaceChildren();
  const selected = String(selectedModule || '').trim();
  for (const module of modules) {
    if (!module.shortName) continue;
    const option = document.createElement('option');
    option.value = module.shortName;
    option.textContent = moduleDisplayName(module);
    option.selected = module.shortName === selected || (!selected && module.isCurrent);
    select.append(option);
  }
  if (select.options.length === 0) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = 'Нет загруженных модулей';
    select.append(option);
  }
  select.disabled = select.options.length === 0 || select.options[0].value === '';
}

function defaultPageViewMode() {
  return localStorage.getItem('onenote.pageViewMode') === 'text' ? 'text' : 'html';
}

function defaultHtmlZoom() {
  return clampHtmlZoom(localStorage.getItem('onenote.defaultHtmlZoom'));
}

function showAuxBibleRefs() {
  return localStorage.getItem('onenote.showAuxBibleRefs') === 'true';
}

function addBibleDisplayParams(params = new URLSearchParams()) {
  if (showAuxBibleRefs()) params.set('includeAux', '1');
  return params;
}

function clampHtmlZoom(value) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) return 100;
  return Math.max(50, Math.min(200, Math.round(numberValue / 10) * 10));
}

function savePageViewSettings() {
  localStorage.setItem('onenote.pageViewMode', pageViewModeSelect.value === 'html' ? 'html' : 'text');
  const zoom = clampHtmlZoom(defaultHtmlZoomInput.value);
  defaultHtmlZoomInput.value = String(zoom);
  localStorage.setItem('onenote.defaultHtmlZoom', String(zoom));
}

function saveBibleDisplaySettings() {
  localStorage.setItem('onenote.showAuxBibleRefs', String(showAuxBibleRefsInput.checked));
  if (activeSearchQuery) renderSearch(activeSearchQuery).catch(showError);
  if (selectedPageId) openPage(selectedPageId, { updateUrl:false, paragraphIndex:currentTargetParagraphIndex }).catch(showError);
}

function renderRuntimeSettings(settings) {
  verboseLoggingEnabled = settings.verboseLogging === true;
  verboseLoggingInput.checked = verboseLoggingEnabled;
  verboseLoggingStatusEl.textContent = verboseLoggingEnabled
    ? 'Расширенное логирование включено. Файл: ' + (settings.logPath || '')
    : 'Расширенное логирование выключено. Файл: ' + (settings.logPath || '');
}

async function refreshRuntimeSettings() {
  renderRuntimeSettings(await api('/api/runtime-settings'));
}

async function saveRuntimeSettings() {
  renderRuntimeSettings(await api('/api/runtime-settings', {
    method:'PUT',
    headers:{ 'Content-Type':'application/json' },
    body:JSON.stringify({ verboseLogging:verboseLoggingInput.checked })
  }));
  uiLog('settings.verboseLoggingChanged', { enabled:verboseLoggingEnabled });
}

function openSettingsDialog() {
  uiLog('ui.openSettings', {});
  if (!settingsDialog.open) settingsDialog.showModal();
  openOneNoteBibleLinksInReaderInput.checked = localStorage.getItem('biblenote.onenoteLinksOpenInBible') === 'true';
  refreshRuntimeSettings().catch(error => {
    verboseLoggingStatusEl.textContent = 'Не удалось загрузить параметры диагностики: ' + error.message;
  });
  refreshOneNoteAccessSettings().catch(error => {
    oneNoteAccessStatusEl.textContent = 'Не удалось загрузить источники данных: ' + error.message;
  });
  refreshOneNoteIntegration().catch(error => {
    if (oneNoteIntegrationSettingsEl && !oneNoteIntegrationSettingsEl.hidden) {
      oneNoteIntegrationStatusEl.hidden = false;
      oneNoteIntegrationStatusEl.textContent = 'Не удалось проверить интеграцию с OneNote: ' + error.message;
    }
  });
  refreshBibleNoteSettings().catch(error => {
    bibleNoteStatusEl.textContent = 'Не удалось проверить BibleNote: ' + error.message;
  });
  refreshProtocolSettings().catch(error => {
    protocolStatusEl.textContent = 'Не удалось проверить обработчик ссылок: ' + error.message;
  });
}

function renderOneNoteIntegration(result) {
  if (!oneNoteIntegrationSettingsEl) return;
  const windowsBuild = result?.platform === 'win32';
  oneNoteIntegrationEnabled = windowsBuild && result?.enabled === true;
  updateOneNoteOpenButtons();
  oneNoteIntegrationSettingsEl.hidden = !windowsBuild || !configuredDataSourcesValue.some(source => source.type === 'com');
  if (!windowsBuild) return;

  const programs = Array.isArray(result.installedPrograms) ? result.installedPrograms : [];
  oneNoteInstalledProgramsEl.replaceChildren();
  for (const program of programs) {
    const card = document.createElement('div');
    card.className = 'onenote-program-card';
    const name = document.createElement('strong');
    name.textContent = program.name || 'Microsoft OneNote';
    const details = document.createElement('span');
    details.textContent = [
      program.productVersion ? 'версия ' + program.productVersion : '',
      program.architecture || ''
    ].filter(Boolean).join(' · ');
    const installPath = document.createElement('small');
    installPath.textContent = program.path || '';
    card.append(name, details, installPath);
    oneNoteInstalledProgramsEl.append(card);
  }

  enableOneNoteRibbonLabelEl.textContent = programs.length > 1
    ? 'Добавить вкладку BibleNote во все найденные версии OneNote'
    : 'Добавить вкладку BibleNote в OneNote';
  enableOneNoteRibbonInput.checked = result.enabled === true;
  enableOneNoteRibbonInput.disabled = programs.length === 0 || Boolean(result.error);
  if (result.error) {
    oneNoteIntegrationStatusEl.hidden = false;
    oneNoteIntegrationStatusEl.textContent = result.error;
  } else if (programs.length === 0) {
    oneNoteIntegrationStatusEl.hidden = false;
    oneNoteIntegrationStatusEl.textContent = 'Классическая настольная версия OneNote не найдена.';
  } else {
    oneNoteIntegrationStatusEl.hidden = true;
    oneNoteIntegrationStatusEl.textContent = '';
  }
}

async function refreshOneNoteIntegration() {
  const result = await api('/api/system/onenote-integration');
  renderOneNoteIntegration(result);
  return result;
}

async function setOneNoteRibbonEnabled(enabled) {
  enableOneNoteRibbonInput.disabled = true;
  oneNoteIntegrationStatusEl.hidden = false;
  oneNoteIntegrationStatusEl.textContent = enabled
    ? 'Добавление вкладки BibleNote...'
    : 'Удаление вкладки BibleNote...';
  try {
    const result = await api(
      '/api/system/onenote-integration/' + (enabled ? 'enable' : 'disable'),
      { method:'POST' }
    );
    renderOneNoteIntegration(result);
  } catch (error) {
    await refreshOneNoteIntegration().catch(() => undefined);
    throw error;
  }
}

async function refreshOneNoteAccessSettings() {
  const result = await api('/api/onenote/access-settings');
  configuredDataSourcesValue = Array.isArray(result.sources) ? result.sources : [];
  renderConfiguredDataSources();
  closeDataSourceEditors();
  oneNoteAccessStatusEl.textContent = configuredDataSourcesValue.length
    ? `Настроено источников: ${configuredDataSourcesValue.length}. Они синхронизируются независимо и объединяются только в результатах поиска.`
    : 'Добавьте хотя бы один источник данных.';
  return result;
}

function renderOneNoteDataSource(dataSource) {
  oneNoteDataSourceValue = dataSource === 'com' || dataSource === 'folder' ? dataSource : 'graph';
  oneNoteDataSourceSelect.value = oneNoteDataSourceValue;
  folderSourceSettingsEl.hidden = true;
  oneNoteSourceSettingsEl.hidden = true;
  if (!configuredDataSourcesValue.some(source => source.type === 'com')) oneNoteIntegrationSettingsEl.hidden = true;
}

function dataSourceTypeLabel(source) {
  if (source.type === 'graph') return 'Заметки OneNote из Microsoft Cloud';
  if (source.type === 'com') return 'Классический OneNote на этом компьютере';
  return 'Файлы из локальных папок';
}

function folderPathsOf(source) {
  return Array.isArray(source?.folderPaths)
    ? source.folderPaths
    : source?.folderPath ? [source.folderPath] : [];
}

function resetFolderSourceEditor() {
  editingFolderSourceId = null;
  folderSourceNameInput.value = '';
  folderSourcePathsInput.value = '';
  folderSourceDeduplicateFilesInput.checked = false;
  folderSourceStatusEl.textContent = '';
  saveFolderSourceButton.textContent = 'Сохранить источник';
  cancelFolderSourceEditButton.hidden = true;
}

function resetOneNoteSourceEditor() {
  editingOneNoteSourceId = null;
  editingOneNoteSourceType = null;
  oneNoteSourceRemoteNotebooks = [];
  oneNoteSourceSelectedNotebookIds = new Set();
  oneNoteSourceSelectAllByDefault = true;
  oneNoteSourceNotebookListEl.replaceChildren();
  oneNoteSourceStatusEl.textContent = '';
  oneNoteSourceSettingsEl.hidden = true;
  saveOneNoteSourceButton.textContent = 'Сохранить источник';
}

function closeDataSourceEditors() {
  resetFolderSourceEditor();
  resetOneNoteSourceEditor();
  folderSourceSettingsEl.hidden = true;
  dataSourceOverviewEl.hidden = false;
}

function renderOneNoteSourceNotebooks() {
  oneNoteSourceNotebookListEl.replaceChildren();
  for (const notebook of oneNoteSourceRemoteNotebooks) {
    const option = document.createElement('label');
    option.className = 'setup-notebook-option';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = oneNoteSourceSelectedNotebookIds.has(notebook.id);
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) oneNoteSourceSelectedNotebookIds.add(notebook.id);
      else oneNoteSourceSelectedNotebookIds.delete(notebook.id);
      oneNoteSourceStatusEl.textContent = `Выбрано записных книжек: ${oneNoteSourceSelectedNotebookIds.size}`;
    });
    const name = document.createElement('span');
    name.textContent = notebook.displayName || 'Без названия';
    option.append(checkbox, name);
    oneNoteSourceNotebookListEl.append(option);
  }
  if (oneNoteSourceRemoteNotebooks.length === 0) {
    oneNoteSourceNotebookListEl.textContent = 'Записные книжки не найдены.';
  }
}

async function waitForOneNoteSourceMicrosoftLogin(initialState) {
  let state = initialState;
  if (state.verificationUri) {
    const code = state.userCode ? ` Код: ${state.userCode}.` : '';
    oneNoteSourceStatusEl.textContent = `Завершите вход в Microsoft.${code}`;
    await api('/api/system/open-external', {
      method:'POST',
      headers:{ 'Content-Type':'application/json' },
      body:JSON.stringify({ url:state.verificationUri })
    }).catch(() => undefined);
  }
  while (state.status === 'starting' || state.status === 'waiting') {
    await new Promise(resolve => setTimeout(resolve, 1500));
    state = await api('/api/onenote/login/status?source=graph');
    if (state.status === 'waiting') {
      oneNoteSourceStatusEl.textContent = `Завершите вход в Microsoft. Код: ${state.userCode || '—'}`;
    }
  }
  if (state.status !== 'success') throw new Error(state.error || 'Не удалось войти в Microsoft.');
}

async function loadOneNoteSourceNotebooks(authenticate = false) {
  if (!editingOneNoteSourceType) return;
  refreshOneNoteSourceNotebooksButton.disabled = true;
  oneNoteSourceStatusEl.textContent = 'Загрузка списка записных книжек…';
  try {
    if (authenticate && editingOneNoteSourceType === 'graph') {
      const state = await api('/api/onenote/login/start', { method:'POST', timeoutMs:120000 });
      await waitForOneNoteSourceMicrosoftLogin(state);
    }
    const result = await api(`/api/onenote/remote-notebooks?source=${encodeURIComponent(editingOneNoteSourceType)}`, { timeoutMs:120000 });
    oneNoteSourceRemoteNotebooks = Array.isArray(result.notebooks) ? result.notebooks : [];
    if (oneNoteSourceSelectAllByDefault) {
      oneNoteSourceSelectedNotebookIds = new Set(oneNoteSourceRemoteNotebooks.map(notebook => notebook.id));
      oneNoteSourceSelectAllByDefault = false;
    }
    renderOneNoteSourceNotebooks();
    oneNoteSourceStatusEl.textContent = `Выбрано записных книжек: ${oneNoteSourceSelectedNotebookIds.size}`;
    refreshOneNoteSourceNotebooksButton.textContent = 'Обновить список';
  } catch (error) {
    oneNoteSourceStatusEl.textContent = 'Не удалось получить список: ' + error.message;
    if (editingOneNoteSourceType === 'graph') refreshOneNoteSourceNotebooksButton.textContent = 'Войти в Microsoft';
  } finally {
    refreshOneNoteSourceNotebooksButton.disabled = false;
  }
}

function editConfiguredOneNoteSource(source = { type:oneNoteDataSourceSelect.value }) {
  editingOneNoteSourceId = source.id || null;
  editingOneNoteSourceType = source.type;
  oneNoteSourceSelectAllByDefault = !Array.isArray(source.notebooks);
  oneNoteSourceSelectedNotebookIds = new Set((source.notebooks || []).map(notebook => notebook.id));
  oneNoteSourceRemoteNotebooks = Array.isArray(source.notebooks) ? [...source.notebooks] : [];
  oneNoteDataSourceSelect.value = source.type;
  oneNoteDataSourceValue = source.type;
  folderSourceSettingsEl.hidden = true;
  oneNoteSourceSettingsEl.hidden = false;
  dataSourceOverviewEl.hidden = true;
  oneNoteSourceTitleEl.textContent = source.type === 'graph' ? 'OneNote Cloud: записные книжки' : 'OneNote Local: записные книжки';
  saveOneNoteSourceButton.textContent = source.id ? 'Сохранить изменения' : 'Сохранить источник';
  refreshOneNoteSourceNotebooksButton.textContent = 'Обновить список';
  renderOneNoteSourceNotebooks();
  oneNoteSourceSettingsEl.scrollIntoView({ block:'nearest', behavior:'smooth' });
  loadOneNoteSourceNotebooks(false).catch(() => undefined);
}

async function saveConfiguredOneNoteSource() {
  if (!editingOneNoteSourceType) return;
  const notebooks = oneNoteSourceRemoteNotebooks.filter(notebook => oneNoteSourceSelectedNotebookIds.has(notebook.id));
  if (notebooks.length === 0) throw new Error('Выберите хотя бы одну записную книжку.');
  const existing = configuredDataSourcesValue.find(source => source.id === editingOneNoteSourceId);
  const updated = { ...(existing || {}), type:editingOneNoteSourceType, notebooks };
  const sources = existing
    ? configuredDataSourcesValue.map(source => source.id === existing.id ? updated : source)
    : [...configuredDataSourcesValue, updated];
  await saveOneNoteAccessSettings(sources);
  closeDataSourceEditors();
}

function editConfiguredFolderSource(source) {
  editingFolderSourceId = source.id;
  oneNoteDataSourceSelect.value = 'folder';
  renderOneNoteDataSource('folder');
  dataSourceOverviewEl.hidden = true;
  folderSourceSettingsEl.hidden = false;
  folderSourceNameInput.value = source.displayName || '';
  folderSourcePathsInput.value = folderPathsOf(source).join('\n');
  folderSourceDeduplicateFilesInput.checked = source.deduplicateFilesByName === true;
  folderSourceStatusEl.textContent = '';
  saveFolderSourceButton.textContent = 'Сохранить изменения';
  cancelFolderSourceEditButton.hidden = false;
  folderSourceSettingsEl.scrollIntoView({ block:'nearest', behavior:'smooth' });
  folderSourceNameInput.focus();
}

function renderConfiguredDataSources() {
  dataSourceListEl.replaceChildren();
  if (configuredDataSourcesValue.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'data-source-empty';
    empty.textContent = 'Источники пока не добавлены.';
    dataSourceListEl.append(empty);
  }
  for (const source of configuredDataSourcesValue) {
    const card = document.createElement('div');
    card.className = 'data-source-card';
    const text = document.createElement('div');
    text.className = 'data-source-card-text';
    const title = document.createElement('strong');
    title.textContent = source.displayName || (source.type === 'graph' ? 'OneNote Cloud' : source.type === 'com' ? 'OneNote Local' : 'Папка');
    text.append(title);
    if (source.type === 'folder') {
      const paths = folderPathsOf(source);
      const count = document.createElement('span');
      count.className = 'data-source-folder-count';
      count.textContent = `Папок: ${paths.length}`;
      const list = document.createElement('ul');
      list.className = 'data-source-folder-list';
      for (const folderPath of paths) {
        const item = document.createElement('li');
        item.textContent = folderPath;
        list.append(item);
      }
      text.append(count, list);
      if (source.deduplicateFilesByName === true) {
        const deduplication = document.createElement('small');
        deduplication.textContent = 'Одинаковые имена: DOCX → DOC → HTML → TXT → PDF';
        text.append(deduplication);
      }
    } else {
      const details = document.createElement('small');
      details.textContent = dataSourceTypeLabel(source);
      text.append(details);
      const notebooks = document.createElement('ul');
      notebooks.className = 'data-source-folder-list';
      if (Array.isArray(source.notebooks)) {
        for (const notebook of source.notebooks) {
          const item = document.createElement('li');
          item.textContent = notebook.displayName || 'Без названия';
          notebooks.append(item);
        }
      } else {
        const item = document.createElement('li');
        item.textContent = 'Все записные книжки';
        notebooks.append(item);
      }
      text.append(notebooks);
    }
    const actions = document.createElement('div');
    actions.className = 'data-source-card-actions';
    if (source.type === 'folder') {
      const edit = document.createElement('button');
      edit.type = 'button';
      edit.className = 'small-button';
      edit.textContent = 'Изменить';
      edit.setAttribute('aria-label', `Изменить источник «${title.textContent}»`);
      edit.onclick = () => editConfiguredFolderSource(source);
      actions.append(edit);
    } else {
      const edit = document.createElement('button');
      edit.type = 'button';
      edit.className = 'small-button';
      edit.textContent = 'Изменить';
      edit.setAttribute('aria-label', `Изменить источник «${title.textContent}»`);
      edit.onclick = () => editConfiguredOneNoteSource(source);
      actions.append(edit);
    }
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'small-button danger-button';
    remove.textContent = 'Удалить';
    remove.setAttribute('aria-label', `Удалить источник «${title.textContent}»`);
    remove.onclick = () => removeConfiguredDataSource(source.id).catch(error => {
      oneNoteAccessStatusEl.textContent = 'Не удалось удалить источник: ' + error.message;
    });
    actions.append(remove);
    card.append(text, actions);
    dataSourceListEl.append(card);
  }
  if (!configuredDataSourcesValue.some(source => source.type === 'com')) oneNoteIntegrationSettingsEl.hidden = true;
}

function configuredFolderPaths() {
  return String(folderSourcePathsInput.value || '')
    .split(/\r?\n/)
    .map(value => value.trim())
    .filter(Boolean);
}

async function saveOneNoteAccessSettings(sources = configuredDataSourcesValue) {
  oneNoteAccessStatusEl.textContent = 'Сохранение источников данных...';
  const result = await api('/api/onenote/access-settings', {
    method:'PUT',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({ sources })
  });
  configuredDataSourcesValue = Array.isArray(result.sources) ? result.sources : [];
  renderConfiguredDataSources();
  oneNoteAccessStatusEl.textContent = configuredDataSourcesValue.length
    ? `Настроено источников: ${configuredDataSourcesValue.length}.`
    : 'Источники данных не настроены.';
  await refreshOneNoteIntegration().catch(() => undefined);
  await loadNotebookSelector().then(() => renderNotesList()).catch(() => undefined);
  return result;
}

async function addConfiguredDataSource() {
  const type = oneNoteDataSourceSelect.value;
  if (type === 'folder') {
    closeDataSourceEditors();
    dataSourceOverviewEl.hidden = true;
    folderSourceSettingsEl.hidden = false;
    cancelFolderSourceEditButton.hidden = false;
    folderSourceNameInput.focus();
    return;
  }
  if (configuredDataSourcesValue.some(source => source.type === type)) {
    oneNoteAccessStatusEl.textContent = type === 'graph' ? 'OneNote Cloud уже добавлен.' : 'OneNote Local уже добавлен.';
    return;
  }
  editConfiguredOneNoteSource({ type });
}

async function addConfiguredFolders(paths) {
  const displayName = String(folderSourceNameInput.value || '').replace(/[\r\n]+/g, ' ').trim();
  if (!displayName) throw new Error('Введите название источника данных.');
  if (paths.length === 0) throw new Error('Добавьте хотя бы одну папку.');
  const configuredPaths = new Set(configuredDataSourcesValue.flatMap(source =>
    source.type === 'folder' && source.id !== editingFolderSourceId ? folderPathsOf(source) : []
  ).map(value => String(value).toLocaleLowerCase()));
  const duplicate = paths.find(folderPath => configuredPaths.has(folderPath.toLocaleLowerCase()));
  if (duplicate) throw new Error(`Папка уже добавлена в другой источник: ${duplicate}`);
  const existing = configuredDataSourcesValue.find(source => source.id === editingFolderSourceId);
  const folderSource = {
    ...(existing || {}),
    type:'folder',
    displayName,
    folderPaths:paths,
    deduplicateFilesByName:folderSourceDeduplicateFilesInput.checked
  };
  const sources = existing
    ? configuredDataSourcesValue.map(source => source.id === existing.id ? folderSource : source)
    : [...configuredDataSourcesValue, folderSource];
  folderSourceStatusEl.textContent = 'Сохранение источника данных…';
  await saveOneNoteAccessSettings(sources);
  closeDataSourceEditors();
}

async function removeConfiguredDataSource(sourceId) {
  if (editingFolderSourceId === sourceId) resetFolderSourceEditor();
  if (editingOneNoteSourceId === sourceId) resetOneNoteSourceEditor();
  await saveOneNoteAccessSettings(configuredDataSourcesValue.filter(source => source.id !== sourceId));
}

async function selectFolderSource() {
  const result = await api('/api/system/select-folder', { method:'POST' });
  if (!result.available) throw new Error('Выбор папки доступен в desktop-приложении. Введите путь вручную.');
  if (result.canceled) return;
  if (!result.folderPath) throw new Error('Windows не вернул путь выбранной папки. Введите путь вручную.');
  const paths = configuredFolderPaths();
  if (!paths.some(folderPath => folderPath.toLocaleLowerCase() === result.folderPath.toLocaleLowerCase())) {
    paths.push(result.folderPath);
  }
  folderSourcePathsInput.value = paths.join('\n');
}

function setupWizardCompleted() {
  return localStorage.getItem('biblenote.setupWizardDone') === 'true';
}

const microsoftScopeVersion = 'notes-read-all-v1';

function setupUsesLocalOneNote() {
  return setupOneNoteDataSourceSelect.value === 'com';
}

function setupUsesFolder() {
  return setupOneNoteDataSourceSelect.value === 'folder';
}

function renderSetupOneNoteSource() {
  const local = setupUsesLocalOneNote();
  const folder = setupUsesFolder();
  setupMicrosoftLoginButton.textContent = folder ? 'Выбрать папку' : local ? 'Проверить OneNote Local' : 'Войти в Microsoft';
  setupOneNoteSourceDescriptionEl.textContent = folder
    ? 'BibleNote прочитает .html, .htm, .txt и .docx из выбранной папки. PDF поддерживается экспериментально без OCR.'
    : local
      ? 'OneNote Local прочитает открытые заметки через COM. Вход в Microsoft не требуется.'
      : 'OneNote Cloud загрузит заметки из вашей учётной записи Microsoft.';
}

function setupWizardSteps() {
  return [...setupWizardDialog.querySelectorAll('[data-setup-step]')];
}

function setupBibleModuleSelected() {
  return Boolean(String(setupBibleModuleInput.value || '').trim());
}

function clearSetupWizardStatus() {
  setupWizardStatusEl.textContent = '';
  setupWizardStatusEl.classList.remove('error');
}

function showSetupWizardError(message) {
  setupWizardStatusEl.textContent = message;
  setupWizardStatusEl.classList.add('error');
}

function setupSelectedNotebookIds() {
  return [...setupNotebookListEl.querySelectorAll('input[data-notebook-id]:checked')]
    .map(input => input.dataset.notebookId);
}

function setupSyncProgressText(progress = {}, startedAt) {
  const phaseNames = {
    starting:'Подготовка',
    notebooks:'Загрузка структуры коллекций',
    sections:'Загрузка разделов',
    'section-groups':'Загрузка структуры',
    pages:'Проверка страниц',
    content:'Загрузка содержимого заметок',
    'bible-parse':'Распознавание библейских ссылок',
    'graph-retry':'Microsoft временно ограничил запросы — ожидаем'
  };
  const parts = [phaseNames[progress.phase] || progress.message || 'Синхронизация'];
  const currentNotebook = typeof progress.message === 'string'
    ? progress.message.match(/(?:Loading (?:section groups|sections|pages) in )(.+)$/)?.[1]
    : '';
  if (currentNotebook) parts.push('коллекция: ' + currentNotebook);
  if (progress.sectionGroups != null) parts.push('групп разделов: ' + progress.sectionGroups);
  if (progress.sections != null) parts.push('разделов: ' + progress.sections);
  if (progress.pages != null) parts.push('страниц: ' + progress.pages);
  if (progress.contentDone != null && progress.contentTotal != null) {
    parts.push('загружено: ' + progress.contentDone + '/' + progress.contentTotal);
  }
  if (progress.bibleParseDone != null && progress.bibleParseTotal != null) {
    parts.push('распознано: ' + progress.bibleParseDone + '/' + progress.bibleParseTotal);
  }
  let elapsedText = '';
  const startedTime = Date.parse(startedAt || '');
  if (Number.isFinite(startedTime)) {
    const elapsedSeconds = Math.max(0, Math.floor((Date.now() - startedTime) / 1000));
    const minutes = Math.floor(elapsedSeconds / 60);
    const seconds = elapsedSeconds % 60;
    elapsedText = 'прошло: ' + (minutes ? minutes + ' мин ' : '') + seconds + ' сек';
  }
  return parts.join(' · ') + (elapsedText ? '\n' + elapsedText : '');
}

function renderSetupWizardSummary() {
  const result = setupInitialSyncResult || {};
  const cacheStatus = result.status || {};
  const account = setupMicrosoftAccountEl.dataset.account || '';
  const notebookCount = setupSelectedNotebookIds().length;
  const errorCount = Number(result.contentErrors || 0)
    + Number(result.sectionScanErrors || 0)
    + Number(result.bibleRefsParseErrors || 0);
  setupWizardFinishedMarkEl.textContent = errorCount ? '!' : '✓';
  setupWizardFinishedMarkEl.classList.toggle('warning', errorCount > 0);
  setupWizardFinishedTitleEl.textContent = errorCount
    ? 'Обновление завершено с предупреждениями'
    : 'Всё готово';
  setupWizardFinishedTextEl.textContent = setupCacheHasPages
    ? (errorCount
        ? 'Основные данные обновлены, но некоторые страницы или разделы проверить не удалось. Подробности доступны в журнале загрузки.'
        : 'Изменения в источниках данных проверены. Страницы без актуального результата распознавания обработаны.')
    : (errorCount
        ? 'Первая загрузка завершена, но некоторые страницы или разделы проверить не удалось. Их можно повторно обновить позже.'
        : setupUsesFolder()
          ? 'Папка подключена. Поддерживаемые файлы загружены, библейские ссылки распознаны.'
          : 'BibleNote подключён к OneNote. Библейские ссылки в загруженных заметках распознаны.');
  setupWizardSummaryEl.replaceChildren();
  const rows = [
    [setupUsesFolder() ? 'Папка' : 'Учётная запись', account || (setupUsesFolder() ? 'Folder подключён' : 'Microsoft подключён')],
    ['Коллекций', notebookCount],
    ['Всего страниц в локальном кеше', cacheStatus.pages || 0],
    [setupCacheHasPages ? 'Проверено при этом обновлении' : 'Страниц найдено', result.pages || 0],
    ['Содержимое обновлено', result.contentDownloaded || 0],
    ['Заново обработано страниц', result.bibleRefsPagesParsed || 0],
    ['Ссылок найдено на них', result.bibleRefsRecognized || 0]
  ];
  if (result.contentErrors) rows.push(['Ошибок загрузки страниц', result.contentErrors]);
  if (result.sectionScanErrors) rows.push(['Непроверенных разделов', result.sectionScanErrors]);
  if (result.bibleRefsParseErrors) rows.push(['Ошибок распознавания ссылок', result.bibleRefsParseErrors]);
  for (const [label, value] of rows) {
    const row = document.createElement('div');
    const caption = document.createElement('span');
    caption.textContent = label;
    const data = document.createElement('strong');
    data.textContent = typeof value === 'number' ? value.toLocaleString('ru-RU') : String(value);
    row.append(caption, data);
    setupWizardSummaryEl.append(row);
  }
}

function updateSetupWizard() {
  const steps = setupWizardSteps();
  for (const step of steps) step.hidden = Number(step.dataset.setupStep) !== setupWizardStep;
  setupWizardDialog.querySelectorAll('.setup-wizard-dot').forEach((dot, index) => {
    dot.classList.toggle('active', index <= setupWizardStep);
  });
  setupWizardBackButton.hidden = setupWizardStep === steps.length - 1;
  setupWizardBackButton.disabled = setupWizardStep === 0 || setupWizardBusy;
  setupWizardNextButton.disabled = setupWizardBusy
    || (setupWizardStep === 0 && !setupMicrosoftConnected)
    || (setupWizardStep === 1 && !setupBibleModuleSelected());
  setupWizardNextButton.textContent = setupWizardStep === 3
    ? (setupWizardBusy
        ? (setupCacheHasPages ? 'Обновление…' : 'Загрузка…')
        : setupInitialSyncFinished
          ? 'Далее'
          : setupCacheHasPages ? 'Обновить заметки' : 'Загрузить заметки')
    : setupWizardStep === steps.length - 1 ? 'Начать работу' : 'Далее';
  if (setupWizardStep === 4) renderSetupWizardSummary();
}

function renderSetupMicrosoftLogin(state) {
  const waiting = state?.status === 'starting' || state?.status === 'waiting';
  const connected = state?.status === 'success';
  setupMicrosoftConnectionControlsEl.hidden = connected;
  setupChangeMicrosoftAccountButton.hidden = !connected;
  setupMicrosoftLoginButton.disabled = waiting;
  setupMicrosoftLoginButton.textContent = waiting
    ? 'Ожидание входа…'
    : setupUsesFolder() ? 'Выбрать папку' : setupUsesLocalOneNote() ? 'Проверить классический OneNote' : 'Войти в Microsoft';
  if (state?.status === 'waiting' && state.userCode) {
    setupMicrosoftLoginUrl = state.verificationUri || 'https://microsoft.com/devicelogin';
    setupMicrosoftUserCodeEl.textContent = state.userCode;
    setupMicrosoftDeviceCodeEl.hidden = false;
    setupMicrosoftAccountEl.textContent = 'Откройте страницу входа, введите код и подтвердите доступ к OneNote.';
  } else {
    setupMicrosoftDeviceCodeEl.hidden = true;
  }
  if (state?.status === 'success') {
    setupMicrosoftConnected = true;
    setupMicrosoftDeviceCodeEl.hidden = true;
    const account = state.account?.username || state.account?.name || '';
    setupMicrosoftAccountEl.dataset.account = account;
    setupMicrosoftAccountEl.textContent = account
      ? (setupUsesFolder() ? 'Папка подключена: ' : setupUsesLocalOneNote() ? 'Классический OneNote подключён: ' : 'OneNote подключён: ') + account
      : setupUsesFolder() ? 'Папка подключена.' : 'OneNote подключён.';
    setupMicrosoftAccountEl.classList.add('success');
    clearInterval(setupMicrosoftLoginTimer);
    setupMicrosoftLoginTimer = undefined;
  } else if (state?.status === 'failed') {
    setupMicrosoftConnected = false;
    setupMicrosoftAccountEl.textContent = 'Не удалось войти: ' + (state.error || 'неизвестная ошибка');
    setupMicrosoftAccountEl.classList.remove('success');
    clearInterval(setupMicrosoftLoginTimer);
    setupMicrosoftLoginTimer = undefined;
  }
  updateSetupWizard();
}

async function verifySetupMicrosoftAccess(loginState) {
  try {
    const result = await api('/api/onenote/remote-notebooks', { timeoutMs:120000 });
    setupRemoteNotebooks = Array.isArray(result.notebooks) ? result.notebooks : [];
    renderSetupMicrosoftLogin({ ...loginState, status:'success' });
    return true;
  } catch (error) {
    setupMicrosoftConnected = false;
    setupMicrosoftConnectionControlsEl.hidden = false;
    setupChangeMicrosoftAccountButton.hidden = true;
    setupMicrosoftAccountEl.classList.remove('success');
    setupMicrosoftAccountEl.textContent = setupUsesFolder()
      ? 'Не удалось прочитать выбранную папку. Проверьте путь и права доступа.'
      : setupUsesLocalOneNote()
        ? 'Не удалось прочитать локальные данные OneNote. Откройте классический OneNote и повторите проверку.'
        : 'Нужно войти в Microsoft, чтобы BibleNote мог прочитать заметки OneNote.';
    updateSetupWizard();
    return false;
  }
}

async function pollSetupMicrosoftLogin() {
  const state = await api('/api/onenote/login/status');
  if (state.status === 'success') {
    clearInterval(setupMicrosoftLoginTimer);
    setupMicrosoftLoginTimer = undefined;
    await verifySetupMicrosoftAccess(state);
    return;
  }
  renderSetupMicrosoftLogin(state);
}

async function startSetupMicrosoftLogin() {
  clearSetupWizardStatus();
  const local = setupUsesLocalOneNote();
  const folder = setupUsesFolder();
  setupMicrosoftLoginButton.disabled = true;
  setupMicrosoftAccountEl.textContent = folder ? 'Выбор папки…' : local ? 'Проверка классического OneNote…' : 'Подготовка входа…';
  try {
    setupHasConfiguredNotebookSelection = false;
    setupConfiguredNotebookIds.clear();
    if (folder) {
      const selection = await api('/api/system/select-folder', { method:'POST' });
      if (!selection.available) throw new Error('Выбор папки доступен только в desktop-приложении.');
      if (selection.canceled) {
        setupMicrosoftLoginButton.disabled = false;
        return;
      }
      if (!selection.folderPath) throw new Error('Windows не вернул путь выбранной папки.');
      await api('/api/onenote/access-settings', {
        method:'PUT',
        headers:{ 'Content-Type':'application/json' },
        body:JSON.stringify({ dataSource:'folder', folderPaths:[selection.folderPath] })
      });
      folderSourcePathsInput.value = selection.folderPath;
      renderOneNoteDataSource('folder');
      await verifySetupMicrosoftAccess({
        status:'success',
        account:{ username:selection.folderPath, name:'Folder' }
      });
      return;
    }
    await api('/api/onenote/access-settings', {
      method:'PUT',
      headers:{ 'Content-Type':'application/json' },
      body:JSON.stringify({ dataSource:local ? 'com' : 'graph' })
    });
    renderOneNoteDataSource(local ? 'com' : 'graph');
    if (local) {
      const verified = await verifySetupMicrosoftAccess({
        status:'success',
        account:{ username:'Классический OneNote' }
      });
      if (!verified) return;
      return;
    }
    const state = await api('/api/onenote/login/start', { method:'POST', timeoutMs:120000 });
    renderSetupMicrosoftLogin(state);
    clearInterval(setupMicrosoftLoginTimer);
    setupMicrosoftLoginTimer = setInterval(() => {
      pollSetupMicrosoftLogin().catch(error => {
        setupMicrosoftAccountEl.textContent = 'Не удалось проверить вход: ' + error.message;
      });
    }, 1500);
    await pollSetupMicrosoftLogin();
  } catch (error) {
    setupMicrosoftLoginButton.disabled = false;
    showSetupWizardError('Не удалось начать вход: ' + (error?.message || String(error)));
  }
}

function renderSetupOneNoteIntegration(result) {
  const programs = Array.isArray(result?.installedPrograms) ? result.installedPrograms : [];
  setupOneNoteProgramsEl.replaceChildren();
  for (const program of programs) {
    const card = document.createElement('div');
    card.className = 'onenote-program-card';
    const name = document.createElement('strong');
    name.textContent = program.name || 'Microsoft OneNote';
    const details = document.createElement('span');
    details.textContent = [program.productVersion ? 'версия ' + program.productVersion : '', program.architecture || '']
      .filter(Boolean).join(' · ');
    card.append(name, details);
    setupOneNoteProgramsEl.append(card);
  }
  setupEnableOneNoteRibbonInput.checked = result?.enabled === true
    || (!setupWizardCompleted() && programs.length > 0);
  setupEnableOneNoteRibbonInput.disabled = programs.length === 0 || Boolean(result?.error);
  if (result?.platform !== 'win32') {
    setupOneNoteProgramsEl.textContent = 'Интеграция с классическим OneNote доступна в Windows.';
  } else if (programs.length === 0) {
    setupOneNoteProgramsEl.textContent = 'Классическая версия OneNote не найдена. Этот шаг можно пропустить.';
  }
}

async function loadSetupIntegration() {
  try {
    renderSetupOneNoteIntegration(await api('/api/system/onenote-integration'));
    const protocol = await api('/api/system/protocol');
    setupRegisterBibleProtocolInput.checked = protocol.available !== false;
    setupRegisterBibleProtocolInput.disabled = protocol.available === false;
  } catch (error) {
    setupIntegrationStatusEl.textContent = 'Дополнительная интеграция сейчас недоступна. Можно продолжить настройку.';
  }
}

async function applySetupIntegration() {
  setupWizardBusy = true;
  updateSetupWizard();
  setupIntegrationStatusEl.textContent = 'Настройка интеграции…';
  try {
    if (!setupEnableOneNoteRibbonInput.disabled) {
      await api('/api/system/onenote-integration/' + (setupEnableOneNoteRibbonInput.checked ? 'enable' : 'disable'), {
        method:'POST',
        timeoutMs:120000
      });
    }
    if (setupRegisterBibleProtocolInput.checked && !setupRegisterBibleProtocolInput.disabled) {
      await api('/api/system/protocol/register', { method:'POST' });
    }
    setupIntegrationStatusEl.textContent = 'Интеграция настроена.';
    setupIntegrationStatusEl.classList.add('success');
  } catch (error) {
    setupIntegrationStatusEl.textContent = 'Не всё удалось настроить: ' + (error?.message || String(error))
      + '. Это можно изменить позже в параметрах.';
  } finally {
    setupWizardBusy = false;
    updateSetupWizard();
  }
}

function renderSetupNotebooks() {
  setupNotebookListEl.replaceChildren();
  setupSelectAllNotebooksButton.parentElement.hidden = setupUsesFolder();
  if (setupUsesFolder()) {
    setupNotebookListEl.textContent = 'Папка уже выбрана в источнике данных и будет синхронизирована целиком.';
    updateSetupWizard();
    return;
  }
  for (const notebook of setupRemoteNotebooks) {
    const option = document.createElement('label');
    option.className = 'setup-notebook-option';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = setupHasConfiguredNotebookSelection
      ? setupConfiguredNotebookIds.has(notebook.id)
      : true;
    checkbox.dataset.notebookId = notebook.id;
    checkbox.addEventListener('change', updateSetupWizard);
    const name = document.createElement('span');
    name.textContent = notebook.displayName || 'Без названия';
    option.append(checkbox, name);
    setupNotebookListEl.append(option);
  }
  if (setupRemoteNotebooks.length === 0) {
    setupNotebookListEl.textContent = setupUsesFolder()
      ? 'В выбранной папке не найдено поддерживаемых документов.'
      : 'В этой учётной записи не найдено заметок OneNote.';
  }
  updateSetupWizard();
}

async function loadSetupNotebooks() {
  setupInitialSyncStatusEl.textContent = 'Загрузка структуры коллекций…';
  const [result, cacheStatus] = await Promise.all([
    api(`/api/onenote/remote-notebooks?source=${encodeURIComponent(setupOneNoteDataSourceSelect.value)}`, { timeoutMs:120000 }),
    api('/api/status', { timeoutMs:120000 })
  ]);
  setupRemoteNotebooks = Array.isArray(result.notebooks) ? result.notebooks : [];
  setupCachedPageCount = Number(cacheStatus.pages) || 0;
  setupCacheHasPages = Number(cacheStatus.notebooks) > 0 && setupCachedPageCount > 0;
  setupCacheSourceMismatch = setupCacheHasPages
    && Boolean(cacheStatus.cacheDataSource)
    && cacheStatus.cacheDataSource !== setupOneNoteDataSourceSelect.value;
  setupNotebookStepTitleEl.textContent = setupUsesFolder()
    ? 'Первая загрузка'
    : setupCacheHasPages
    ? 'Коллекции и обновление'
    : 'Коллекции и первая загрузка';
  setupNotebookStepDescriptionEl.textContent = setupUsesFolder()
    ? 'Все поддерживаемые файлы из выбранной папки будут доступны в BibleNote.'
    : setupCacheHasPages
    ? 'Кеш уже создан. Выберите коллекции, в которых нужно быстро проверить изменения.'
    : 'Выберите коллекции заметок, которые должны быть доступны в BibleNote.';
  renderSetupNotebooks();
  setupInitialSyncStatusEl.textContent = setupRemoteNotebooks.length
    ? (setupCacheHasPages
        ? 'В кеше уже ' + setupCachedPageCount + ' страниц. Будут проверены только изменения и необработанные библейские ссылки.'
        : 'Выбрано коллекций: ' + setupSelectedNotebookIds().length)
    : '';
}

async function waitForSetupInitialSync() {
  while (true) {
    const state = await api('/api/sync', { timeoutMs:120000 });
    if (state.status === 'running') {
      setupInitialSyncStatusEl.textContent = setupSyncProgressText(state.progress, state.startedAt);
      await new Promise(resolve => setTimeout(resolve, 1500));
      continue;
    }
    if (state.status === 'failed') throw new Error(state.error || 'Синхронизация не завершена.');
    if (state.status !== 'success') throw new Error('Синхронизация неожиданно остановилась.');
    return state.result || {};
  }
}

async function runSetupInitialSync() {
  const notebookIds = setupUsesFolder() ? undefined : setupSelectedNotebookIds();
  if (!setupUsesFolder() && notebookIds.length === 0) {
    showSetupWizardError('Выберите хотя бы одну коллекцию.');
    return false;
  }
  clearSetupWizardStatus();
  setupWizardBusy = true;
  updateSetupWizard();
  setupInitialSyncStatusEl.classList.remove('success');
  setupInitialSyncStatusEl.classList.add('running');
  setupInitialSyncStatusEl.textContent = setupCacheHasPages
    ? 'Запуск быстрой синхронизации…'
    : 'Запуск первой синхронизации…';
  try {
    if (!setupUsesFolder()) {
      const accessSettings = await api('/api/onenote/access-settings');
      const notebooks = setupRemoteNotebooks
        .filter(notebook => notebookIds.includes(notebook.id))
        .map(notebook => ({ id:notebook.id, displayName:notebook.displayName || 'Без названия' }));
      const sourceType = setupOneNoteDataSourceSelect.value;
      const sources = (accessSettings.sources || []).map(source => source.type === sourceType ? { ...source, notebooks } : source);
      await api('/api/onenote/access-settings', {
        method:'PUT',
        headers:{ 'Content-Type':'application/json' },
        body:JSON.stringify({ sources })
      });
    }
    bibleModuleNameInput.value = setupBibleModuleInput.value;
    saveBibleModuleSetting();
    await api('/api/sync', {
      method:'POST',
      headers:{ 'Content-Type':'application/json' },
      body:JSON.stringify({
        concurrency:1,
        metadataOnly:false,
        forceContent:false,
        parseBibleRefs:true,
        forceBibleParse:false,
        incrementalMetadata:setupCacheHasPages && !setupCacheSourceMismatch,
        replaceAll:setupCacheSourceMismatch || undefined,
        bibleModule:currentBibleModule(),
        ...(notebookIds ? { notebookIds } : {})
      }),
      timeoutMs:180000
    });
    setupInitialSyncResult = await waitForSetupInitialSync();
    setupInitialSyncFinished = true;
    setupInitialSyncStatusEl.textContent = setupCacheHasPages
      ? 'Изменения проверены.'
      : 'Первая синхронизация завершена.';
    setupInitialSyncStatusEl.classList.remove('running');
    setupInitialSyncStatusEl.classList.add('success');
    return true;
  } catch (error) {
    setupInitialSyncStatusEl.classList.remove('running');
    showSetupWizardError('Не удалось завершить первую синхронизацию: ' + (error?.message || String(error)));
    return false;
  } finally {
    setupWizardBusy = false;
    updateSetupWizard();
  }
}

async function openSetupWizardIfNeeded() {
  const settings = await api('/api/onenote/access-settings');
  const requiresMicrosoftScopeUpgrade = settings.dataSource === 'graph'
    && localStorage.getItem('biblenote.microsoftScopeVersion') !== microsoftScopeVersion;
  const shouldOpen = !setupWizardCompleted() || requiresMicrosoftScopeUpgrade;
  if (!shouldOpen || setupWizardDialog.open) return;
  if (settingsDialog.open) settingsDialog.close();
  setupWizardCanClose = false;
  setupMicrosoftConnected = false;
  setupCacheHasPages = false;
  setupCachedPageCount = 0;
  setupInitialSyncFinished = false;
  setupInitialSyncResult = undefined;
  setupOneNoteDataSourceSelect.value = ['graph', 'com', 'folder'].includes(settings.dataSource) ? settings.dataSource : 'graph';
  const configuredSource = (settings.sources || []).find(source => source.type === setupOneNoteDataSourceSelect.value);
  setupHasConfiguredNotebookSelection = Array.isArray(configuredSource?.notebooks);
  setupConfiguredNotebookIds = new Set((configuredSource?.notebooks || []).map(notebook => notebook.id));
  renderSetupOneNoteSource();
  await refreshBibleNoteSettings().catch(error => {
    setupBibleModuleStatusEl.textContent = 'Не удалось получить список переводов Библии: ' + (error?.message || String(error));
  });
  await loadSetupIntegration();
  setupWizardStep = 0;
  clearSetupWizardStatus();
  updateSetupWizard();
  setupWizardDialog.showModal();
  try {
    const loginState = await api('/api/onenote/login/status');
    if (loginState.status === 'success') await verifySetupMicrosoftAccess(loginState);
    else renderSetupMicrosoftLogin(loginState);
  } catch {
    renderSetupMicrosoftLogin({ status:'idle' });
  }
}

async function finishSetupWizard() {
  localStorage.setItem('biblenote.setupWizardDone', 'true');
  if (!setupUsesLocalOneNote() && !setupUsesFolder()) {
    localStorage.setItem('biblenote.microsoftScopeVersion', microsoftScopeVersion);
  }
  setupWizardCanClose = true;
  setupWizardDialog.close();
  await loadNotebookSelector().catch(error => console.warn(error));
  await renderNotesList().catch(error => console.warn(error));
  showActivity('BibleNote готов к работе.', 'success');
}

async function nextSetupWizardStep() {
  if (setupWizardBusy) return;
  clearSetupWizardStatus();
  if (setupWizardStep === 0 && !setupMicrosoftConnected) {
    showSetupWizardError(setupUsesFolder() ? 'Сначала выберите папку.' : 'Сначала подключите источник заметок.');
    return;
  }
  if (setupWizardStep === 1 && !setupBibleModuleSelected()) {
    showSetupWizardError('Выберите перевод Библии или сначала добавьте его.');
    return;
  }
  const lastStep = setupWizardSteps().length - 1;
  if (setupWizardStep >= lastStep) {
    await finishSetupWizard();
    return;
  }
  if (setupWizardStep === 1) {
    bibleModuleNameInput.value = setupBibleModuleInput.value;
    saveBibleModuleSetting();
    if (setupUsesFolder()) {
      setupWizardStep = 3;
      updateSetupWizard();
      try {
        await loadSetupNotebooks();
      } catch (error) {
        showSetupWizardError('Не удалось получить список папок: ' + (error?.message || String(error)));
      }
      return;
    }
  }
  if (setupWizardStep === 2) await applySetupIntegration();
  if (setupWizardStep === 3) {
    if (!setupInitialSyncFinished && !await runSetupInitialSync()) return;
  }
  setupWizardStep += 1;
  updateSetupWizard();
  if (setupWizardStep === 3 && setupNotebookListEl.children.length === 0) {
    try {
      await loadSetupNotebooks();
    } catch (error) {
      showSetupWizardError('Не удалось получить структуру коллекций: ' + (error?.message || String(error)));
    }
  }
}

async function refreshBibleNoteSettings() {
  const result = await api('/api/biblenote/health');
  if (!result.available) {
    bibleNoteStatusEl.textContent = 'BibleNote пока недоступен: ' + (result.error || 'нет ответа');
    bibleModulesListEl.replaceChildren();
    return;
  }
  bibleNoteStatusEl.textContent = [
    'Каталог модулей: ' + (result.modulesDirectory || 'не указан')
  ].join('\n');
  await refreshBibleModulesList();
}

async function refreshBibleModulesList() {
  const result = await api('/api/biblenote/modules');
  bibleModulesListEl.replaceChildren();
  if (!result.available) {
    fillBibleModuleSelect(bibleModuleNameInput, [], '');
    fillBibleModuleSelect(setupBibleModuleInput, [], '');
    bibleModulesListEl.textContent = result.error || 'Не удалось получить список модулей.';
    return;
  }
  const modules = Array.isArray(result.modules) ? result.modules : [];
  fillBibleModuleSelect(bibleModuleNameInput, modules, localStorage.getItem('onenote.bibleModule') || result.module);
  fillBibleModuleSelect(setupBibleModuleInput, modules, localStorage.getItem('onenote.bibleModule') || result.module);
  if (modules.length === 0) {
    bibleModulesListEl.textContent = 'Установленные модули не найдены.';
    return;
  }
  const currentModule = currentBibleModule();
  for (const module of modules) {
    const option = document.createElement('label');
    option.className = 'settings-module-option';
    const input = document.createElement('input');
    input.type = 'radio';
    input.name = 'bibleModuleChoice';
    input.value = module.shortName || '';
    input.checked = module.shortName === currentModule || (!currentModule && module.isCurrent);
    input.addEventListener('change', () => {
      if (!input.checked) return;
      bibleModuleNameInput.value = module.shortName || '';
      saveBibleModuleSetting();
    });
    const body = document.createElement('div');
    const title = document.createElement('div');
    title.className = 'settings-module-name';
    title.textContent = moduleDisplayName(module);
    const meta = document.createElement('div');
    meta.className = 'settings-module-meta';
    meta.textContent = [module.type, module.locale, module.isCurrent ? 'текущий в BibleNote' : ''].filter(Boolean).join(' · ');
    body.append(title, meta);
    option.append(input, body);
    bibleModulesListEl.append(option);
  }
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = '';
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
}

function updateBibleModuleUploadState() {
  uploadBibleModuleButton.disabled = !bibleModuleFileInput.files || bibleModuleFileInput.files.length === 0;
}

function updateSetupBibleModuleUploadState() {
  setupUploadBibleModuleButton.disabled = !setupBibleModuleFileInput.files || setupBibleModuleFileInput.files.length === 0;
}

async function uploadBibleModuleFiles(fileInput, uploadButton, statusElement, moduleInput, saveModule) {
  const files = [...(fileInput.files || [])];
  if (files.length === 0) {
    statusElement.textContent = 'Выберите файл модуля .bnm или .zip.';
    uploadButton.disabled = true;
    return;
  }
  uploadButton.disabled = true;
  statusElement.textContent = 'Загрузка модулей: 0/' + files.length;
  try {
    const installed = [];
    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      statusElement.textContent = 'Загрузка модулей: ' + index + '/' + files.length + ' · ' + file.name;
      const contentBase64 = arrayBufferToBase64(await file.arrayBuffer());
      const result = await api('/api/biblenote/modules/upload', {
        method:'POST',
        headers:{ 'Content-Type':'application/json' },
        body:JSON.stringify({ fileName:file.name, contentBase64 })
      });
      if (result.moduleName) installed.push(result.moduleName);
    }
    if (installed.length > 0) {
      moduleInput.value = installed[installed.length - 1];
      if (saveModule) saveBibleModuleSetting();
    }
    statusElement.textContent = 'Загружено модулей: ' + installed.length + '/' + files.length;
    fileInput.value = '';
    await refreshBibleNoteSettings();
    if (installed.length > 0) moduleInput.value = installed[installed.length - 1];
  } catch (error) {
    statusElement.textContent = 'Не удалось загрузить модуль: ' + error.message;
  } finally {
    uploadButton.disabled = true;
  }
}

async function uploadBibleModule() {
  await uploadBibleModuleFiles(bibleModuleFileInput, uploadBibleModuleButton, bibleModuleStatusEl, bibleModuleNameInput, true);
  updateBibleModuleUploadState();
}

async function uploadSetupBibleModule() {
  await uploadBibleModuleFiles(setupBibleModuleFileInput, setupUploadBibleModuleButton, setupBibleModuleStatusEl, setupBibleModuleInput, false);
  updateSetupBibleModuleUploadState();
  updateSetupWizard();
}

async function refreshProtocolSettings() {
  const result = await api('/api/system/protocol');
  registerBibleProtocolButton.hidden = result.available && result.registered;
  registerBibleProtocolButton.disabled = false;
  protocolStatusEl.textContent = result.available
    ? (result.registered ? 'Библейские ссылки открываются в BibleNote.' : 'Разрешите Windows открывать библейские ссылки в BibleNote.')
    : 'Настройка доступна только в установленной версии BibleNote.';
}

async function registerBibleProtocol() {
  registerBibleProtocolButton.hidden = false;
  registerBibleProtocolButton.disabled = true;
  protocolStatusEl.textContent = 'Настройка открытия библейских ссылок...';
  let refreshed = false;
  try {
    const result = await api('/api/system/protocol/register', { method:'POST' });
    protocolStatusEl.textContent = result.registered
      ? 'Библейские ссылки открываются в BibleNote.'
      : 'Windows не подтвердила настройку открытия ссылок.';
    await refreshProtocolSettings();
    refreshed = true;
  } catch (error) {
    protocolStatusEl.textContent = 'Не удалось настроить открытие ссылок: ' + error.message;
    registerBibleProtocolButton.disabled = false;
  } finally {
    if (!refreshed) registerBibleProtocolButton.disabled = false;
  }
}

setupSettingsDialog();
setupDownloadLogDialog();

themeSelect.value = document.documentElement.dataset.theme || 'a';
themeSelect.addEventListener('change', () => {
  const theme = ['a', 'b', 'c'].includes(themeSelect.value) ? themeSelect.value : 'a';
  document.documentElement.dataset.theme = theme;
  localStorage.setItem('onenote.theme', theme);
});

openSettingsButton.addEventListener('click', openSettingsDialog);
closeSettingsButton.addEventListener('click', () => settingsDialog.close());
if (saveOneNoteAccessButton) saveOneNoteAccessButton.addEventListener('click', () => saveOneNoteAccessSettings().catch(error => {
  oneNoteAccessStatusEl.textContent = 'Не удалось сохранить источник данных: ' + error.message;
  saveOneNoteAccessButton.disabled = false;
}));
addDataSourceButton.addEventListener('click', () => addConfiguredDataSource().catch(error => {
  oneNoteAccessStatusEl.textContent = 'Не удалось добавить источник: ' + error.message;
}));
selectFolderSourceButton.addEventListener('click', () => selectFolderSource().catch(error => {
  folderSourceStatusEl.textContent = 'Не удалось выбрать папку: ' + error.message;
}));
saveFolderSourceButton.addEventListener('click', () => addConfiguredFolders(configuredFolderPaths()).catch(error => {
  folderSourceStatusEl.textContent = 'Не удалось сохранить папки: ' + error.message;
}));
cancelFolderSourceEditButton.addEventListener('click', closeDataSourceEditors);
refreshOneNoteSourceNotebooksButton.addEventListener('click', () => {
  const authenticate = editingOneNoteSourceType === 'graph'
    && refreshOneNoteSourceNotebooksButton.textContent.startsWith('Войти');
  loadOneNoteSourceNotebooks(authenticate).catch(error => {
    oneNoteSourceStatusEl.textContent = error.message;
  });
});
selectAllOneNoteSourceNotebooksButton.addEventListener('click', () => {
  oneNoteSourceSelectedNotebookIds = new Set(oneNoteSourceRemoteNotebooks.map(notebook => notebook.id));
  renderOneNoteSourceNotebooks();
  oneNoteSourceStatusEl.textContent = `Выбрано записных книжек: ${oneNoteSourceSelectedNotebookIds.size}`;
});
clearAllOneNoteSourceNotebooksButton.addEventListener('click', () => {
  oneNoteSourceSelectedNotebookIds.clear();
  renderOneNoteSourceNotebooks();
  oneNoteSourceStatusEl.textContent = 'Выерано записных книжек: 0';
});
saveOneNoteSourceButton.addEventListener('click', () => saveConfiguredOneNoteSource().catch(error => {
  oneNoteSourceStatusEl.textContent = 'Не удалось сохранить источник: ' + error.message;
}));
cancelOneNoteSourceEditButton.addEventListener('click', closeDataSourceEditors);
oneNoteDataSourceSelect.addEventListener('change', () => {
  closeDataSourceEditors();
  renderOneNoteDataSource(oneNoteDataSourceSelect.value);
});
setupWizardBackButton.addEventListener('click', () => {
  setupWizardStep = setupUsesFolder() && setupWizardStep === 3
    ? 1
    : Math.max(0, setupWizardStep - 1);
  clearSetupWizardStatus();
  updateSetupWizard();
});
setupWizardNextButton.addEventListener('click', () => nextSetupWizardStep().catch(error => {
  showSetupWizardError(error?.message || String(error));
  setupWizardBusy = false;
  updateSetupWizard();
}));
setupMicrosoftLoginButton.addEventListener('click', () => startSetupMicrosoftLogin().catch(error => {
  showSetupWizardError(error?.message || String(error));
}));
setupOneNoteDataSourceSelect.addEventListener('change', () => {
  renderSetupOneNoteSource();
  setupMicrosoftConnected = false;
  setupRemoteNotebooks = [];
  setupMicrosoftConnectionControlsEl.hidden = false;
  setupChangeMicrosoftAccountButton.hidden = true;
  setupMicrosoftAccountEl.classList.remove('success');
  setupMicrosoftAccountEl.textContent = '';
  updateSetupWizard();
});
setupOpenMicrosoftLoginButton.addEventListener('click', () => {
  api('/api/system/open-external', {
    method:'POST',
    headers:{ 'Content-Type':'application/json' },
    body:JSON.stringify({ url:setupMicrosoftLoginUrl })
  }).catch(error => showSetupWizardError('Не удалось открыть страницу входа: ' + error.message));
});
setupChangeMicrosoftAccountButton.addEventListener('click', () => {
  setupMicrosoftConnected = false;
  setupMicrosoftConnectionControlsEl.hidden = false;
  setupMicrosoftDeviceCodeEl.hidden = true;
  setupChangeMicrosoftAccountButton.hidden = true;
  setupMicrosoftAccountEl.classList.remove('success');
  setupMicrosoftAccountEl.textContent = 'Войдите в другую учётную запись Microsoft.';
  updateSetupWizard();
});
setupSelectAllNotebooksButton.addEventListener('click', () => {
  setupNotebookListEl.querySelectorAll('input[data-notebook-id]').forEach(input => { input.checked = true; });
  setupInitialSyncStatusEl.textContent = 'Выбрано коллекций: ' + setupSelectedNotebookIds().length;
});
setupClearAllNotebooksButton.addEventListener('click', () => {
  setupNotebookListEl.querySelectorAll('input[data-notebook-id]').forEach(input => { input.checked = false; });
  setupInitialSyncStatusEl.textContent = 'Выберите хотя бы одну коллекцию.';
});
setupWizardDialog.addEventListener('cancel', event => {
  if (!setupWizardCanClose) {
    event.preventDefault();
    setupWizardStatusEl.textContent = 'Сначала завершите первичную настройку.';
    setupWizardStatusEl.classList.add('error');
  }
});
setupWizardDialog.addEventListener('keydown', event => {
  if (event.key === 'Escape' && !setupWizardCanClose) {
    event.preventDefault();
    event.stopPropagation();
    setupWizardStatusEl.textContent = 'Сначала завершите первичную настройку.';
    setupWizardStatusEl.classList.add('error');
  }
}, true);
setupWizardDialog.addEventListener('close', () => {
  clearInterval(setupMicrosoftLoginTimer);
  setupMicrosoftLoginTimer = undefined;
  if (setupWizardCanClose) return;
  setTimeout(() => {
    if (!setupWizardDialog.open) setupWizardDialog.showModal();
  }, 0);
});
settingsDialog.addEventListener('cancel', event => {
  if (event.target !== settingsDialog) {
    event.stopPropagation();
    return;
  }
  settingsDialog.close();
});
bibleModuleNameInput.addEventListener('change', saveBibleModuleSetting);
bibleModuleFileInput.addEventListener('click', () => {
  bibleModuleFileInput.value = '';
  updateBibleModuleUploadState();
});
bibleModuleFileInput.addEventListener('change', updateBibleModuleUploadState);
uploadBibleModuleButton.addEventListener('click', () => uploadBibleModule().catch(showError));
setupBibleModuleFileInput.addEventListener('click', () => {
  setupBibleModuleFileInput.value = '';
  updateSetupBibleModuleUploadState();
});
setupBibleModuleFileInput.addEventListener('change', updateSetupBibleModuleUploadState);
setupUploadBibleModuleButton.addEventListener('click', () => uploadSetupBibleModule().catch(showError));
registerBibleProtocolButton.addEventListener('click', () => registerBibleProtocol().catch(showError));
openOneNoteBibleLinksInReaderInput.addEventListener('change', () => {
  localStorage.setItem('biblenote.onenoteLinksOpenInBible', String(openOneNoteBibleLinksInReaderInput.checked));
});
if (enableOneNoteRibbonInput) enableOneNoteRibbonInput.addEventListener('change', () => {
  setOneNoteRibbonEnabled(enableOneNoteRibbonInput.checked).catch(error => {
    oneNoteIntegrationStatusEl.textContent = 'Не удалось изменить интеграцию с OneNote: ' + error.message;
  });
});
pageViewModeSelect.addEventListener('change', savePageViewSettings);
defaultHtmlZoomInput.addEventListener('change', savePageViewSettings);
showAuxBibleRefsInput.addEventListener('change', saveBibleDisplaySettings);
verboseLoggingInput.addEventListener('change', () => saveRuntimeSettings().catch(error => {
  verboseLoggingStatusEl.textContent = 'Не удалось сохранить параметры диагностики: ' + error.message;
}));
statusEl.addEventListener('click', openDownloadLogDialog);
closeDownloadLogButton.addEventListener('click', () => downloadLogDialog.close());
downloadLogDialog.addEventListener('cancel', () => downloadLogDialog.close());
