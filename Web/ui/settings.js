function setupSettingsDialog() {
  for (const selector of ['.notebook-panel', '.settings-panel', '.sync-panel']) {
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
  return [module.shortName, module.displayName].filter(Boolean).join(' · ') || '(без имени)';
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
  refreshRuntimeSettings().catch(error => {
    verboseLoggingStatusEl.textContent = 'Не удалось загрузить параметры диагностики: ' + error.message;
  });
  refreshOneNoteAccessSettings().catch(error => {
    oneNoteAccessStatusEl.textContent = 'Не удалось загрузить параметры OneNote: ' + error.message;
  });
  refreshBibleNoteSettings().catch(error => {
    bibleNoteStatusEl.textContent = 'Не удалось проверить BibleNote: ' + error.message;
  });
  refreshProtocolSettings().catch(error => {
    protocolStatusEl.textContent = 'Не удалось проверить обработчик ссылок: ' + error.message;
  });
}

async function refreshOneNoteAccessSettings() {
  const result = await api('/api/onenote/access-settings');
  oneNoteClientIdInput.value = result.clientId || '';
  oneNoteTenantIdInput.value = result.tenantId || 'common';
  oneNoteScopesInput.value = result.scopes || 'Notes.Read User.Read offline_access';
  oneNoteTokenCacheInput.value = result.tokenCache || '';
  oneNoteAccessStatusEl.textContent = oneNoteClientIdConfigured(result.clientId)
    ? 'Доступ к OneNote настроен.'
    : 'Укажите Azure Client ID для доступа к OneNote.';
  return result;
}

async function saveOneNoteAccessSettings() {
  if (saveOneNoteAccessButton) saveOneNoteAccessButton.disabled = true;
  oneNoteAccessStatusEl.textContent = 'Сохранение параметров OneNote...';
  try {
    const result = await api('/api/onenote/access-settings', {
      method:'PUT',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        clientId:oneNoteClientIdInput.value,
        tenantId:oneNoteTenantIdInput.value,
        scopes:oneNoteScopesInput.value,
        tokenCache:oneNoteTokenCacheInput.value
      })
    });
    oneNoteClientIdInput.value = result.clientId || '';
    oneNoteTenantIdInput.value = result.tenantId || 'common';
    oneNoteScopesInput.value = result.scopes || 'Notes.Read User.Read offline_access';
    oneNoteTokenCacheInput.value = result.tokenCache || '';
    oneNoteAccessStatusEl.textContent = 'Доступ к OneNote сохранен.';
    return result;
  } finally {
    if (saveOneNoteAccessButton) saveOneNoteAccessButton.disabled = false;
  }
}

function oneNoteClientIdConfigured(value) {
  const clientId = String(value || '').trim();
  return Boolean(clientId) && clientId !== '00000000-0000-0000-0000-000000000000';
}

function setupWizardCompleted() {
  return localStorage.getItem('biblenote.setupWizardDone') === 'true';
}

function setupWizardSteps() {
  return [...setupWizardDialog.querySelectorAll('[data-setup-step]')];
}

function setupBibleModuleSelected() {
  return Boolean(String(setupBibleModuleInput.value || '').trim());
}

function updateSetupWizard() {
  const steps = setupWizardSteps();
  for (const step of steps) step.hidden = Number(step.dataset.setupStep) !== setupWizardStep;
  setupWizardDialog.querySelectorAll('.setup-wizard-dot').forEach((dot, index) => {
    dot.classList.toggle('active', index <= setupWizardStep);
  });
  setupWizardBackButton.disabled = setupWizardStep === 0;
  setupWizardNextButton.textContent = setupWizardStep === steps.length - 1 ? 'Сохранить' : 'Далее';
  setupWizardStatusEl.textContent = '';
  setupWizardStatusEl.classList.remove('error');
  if (setupWizardStep === 2) {
    setupWizardSummaryEl.textContent = [
      'OneNote Client ID: ' + (setupOneNoteClientIdInput.value.trim() || 'не указан'),
      'Модуль BibleNote: ' + ((setupBibleModuleInput.value || 'rst').trim() || 'rst')
    ].join('\n');
  }
}

async function openSetupWizardIfNeeded() {
  const settings = await api('/api/onenote/access-settings');
  const shouldOpen = !setupWizardCompleted() || !oneNoteClientIdConfigured(settings.clientId);
  if (!shouldOpen || setupWizardDialog.open) return;
  if (settingsDialog.open) settingsDialog.close();
  setupWizardCanClose = false;
  setupOneNoteClientIdInput.value = settings.clientId || '';
  await refreshBibleNoteSettings().catch(error => {
    setupBibleModuleStatusEl.textContent = 'Не удалось получить список модулей BibleNote: ' + (error?.message || String(error));
  });
  setupWizardStep = 0;
  updateSetupWizard();
  setupWizardDialog.showModal();
  setupOneNoteClientIdInput.focus();
}

async function finishSetupWizard() {
  const clientId = setupOneNoteClientIdInput.value.trim();
  if (!oneNoteClientIdConfigured(clientId)) {
    setupWizardStep = 0;
    updateSetupWizard();
    setupWizardStatusEl.textContent = 'Укажите корректный Azure Client ID.';
    setupWizardStatusEl.classList.add('error');
    setupOneNoteClientIdInput.focus();
    return;
  }
  if (!setupBibleModuleSelected()) {
    setupWizardStep = 1;
    updateSetupWizard();
    setupWizardStatusEl.textContent = 'Выберите загруженный модуль BibleNote или сначала загрузите модуль.';
    setupWizardStatusEl.classList.add('error');
    return;
  }
  setupWizardNextButton.disabled = true;
  setupWizardStatusEl.textContent = 'Сохранение параметров...';
  try {
    oneNoteClientIdInput.value = clientId;
    await saveOneNoteAccessSettings();
    bibleModuleNameInput.value = setupBibleModuleInput.value;
    saveBibleModuleSetting();
    localStorage.setItem('biblenote.setupWizardDone', 'true');
    setupWizardCanClose = true;
    setupWizardDialog.close();
    showActivity('Первичная настройка сохранена.', 'success');
    refreshBibleNoteSettings().catch(error => console.warn(error));
  } catch (error) {
    setupWizardStatusEl.textContent = 'Не удалось сохранить настройки: ' + (error?.message || String(error));
    setupWizardStatusEl.classList.add('error');
  } finally {
    setupWizardNextButton.disabled = false;
  }
}

function nextSetupWizardStep() {
  if (setupWizardStep === 0 && !oneNoteClientIdConfigured(setupOneNoteClientIdInput.value)) {
    setupWizardStatusEl.textContent = 'Укажите Azure Client ID.';
    setupWizardStatusEl.classList.add('error');
    setupOneNoteClientIdInput.focus();
    return;
  }
  if (setupWizardStep === 1 && !setupBibleModuleSelected()) {
    setupWizardStatusEl.textContent = 'Выберите загруженный модуль BibleNote или сначала загрузите модуль.';
    setupWizardStatusEl.classList.add('error');
    return;
  }
  const lastStep = setupWizardSteps().length - 1;
  if (setupWizardStep >= lastStep) {
    finishSetupWizard().catch(showError);
    return;
  }
  setupWizardStep += 1;
  updateSetupWizard();
}

async function refreshBibleNoteSettings() {
  const result = await api('/api/biblenote/health');
  if (!result.available) {
    bibleNoteStatusEl.textContent = 'BibleNote пока недоступен: ' + (result.error || 'нет ответа');
    bibleModulesListEl.replaceChildren();
    return;
  }
  bibleNoteStatusEl.textContent = [
    'Статус: ' + result.status,
    'Модуль: ' + [result.module, result.moduleName].filter(Boolean).join(' · '),
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
  registerBibleProtocolButton.disabled = result.available && result.registered;
  protocolStatusEl.textContent = result.available
    ? (result.registered ? 'Обработчик isbtBibleVerse зарегистрирован.' : 'Обработчик isbtBibleVerse пока не зарегистрирован.')
    : 'Регистрация доступна только в Electron-сборке.';
}

async function registerBibleProtocol() {
  registerBibleProtocolButton.disabled = true;
  protocolStatusEl.textContent = 'Регистрация обработчика isbtBibleVerse...';
  let refreshed = false;
  try {
    const result = await api('/api/system/protocol/register', { method:'POST' });
    protocolStatusEl.textContent = result.registered
      ? 'Обработчик isbtBibleVerse зарегистрирован.'
      : 'Electron не подтвердил регистрацию обработчика.';
    await refreshProtocolSettings();
    refreshed = true;
  } catch (error) {
    protocolStatusEl.textContent = 'Не удалось зарегистрировать обработчик: ' + error.message;
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
  oneNoteAccessStatusEl.textContent = 'Не удалось сохранить параметры OneNote: ' + error.message;
  saveOneNoteAccessButton.disabled = false;
}));
oneNoteClientIdInput.addEventListener('change', () => saveOneNoteAccessSettings().catch(error => {
  oneNoteAccessStatusEl.textContent = 'Не удалось сохранить параметры OneNote: ' + error.message;
}));
oneNoteClientIdInput.addEventListener('keydown', event => {
  if (event.key === 'Enter') {
    event.preventDefault();
    oneNoteClientIdInput.blur();
  }
});
setupWizardBackButton.addEventListener('click', () => {
  setupWizardStep = Math.max(0, setupWizardStep - 1);
  updateSetupWizard();
});
setupWizardNextButton.addEventListener('click', nextSetupWizardStep);
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
pageViewModeSelect.addEventListener('change', savePageViewSettings);
defaultHtmlZoomInput.addEventListener('change', savePageViewSettings);
showAuxBibleRefsInput.addEventListener('change', saveBibleDisplaySettings);
verboseLoggingInput.addEventListener('change', () => saveRuntimeSettings().catch(error => {
  verboseLoggingStatusEl.textContent = 'Не удалось сохранить параметры диагностики: ' + error.message;
}));
statusEl.addEventListener('click', openDownloadLogDialog);
closeDownloadLogButton.addEventListener('click', () => downloadLogDialog.close());
downloadLogDialog.addEventListener('cancel', () => downloadLogDialog.close());
