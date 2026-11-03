const token = new URLSearchParams(location.search).get('token') || '';
const apiHeaders = { 'X-BibleNote-Review-Token': token };
const state = { data: null, selectedId: null, groupPage: null, offset: 0, limit: 100 };

const ui = {
  modulePair: document.querySelector('#module-pair'),
  summary: document.querySelector('#summary'),
  groups: document.querySelector('#groups'),
  detail: document.querySelector('#detail'),
  search: document.querySelector('#search'),
  status: document.querySelector('#status-filter'),
  confidence: document.querySelector('#confidence-filter'),
  filterCount: document.querySelector('#filter-count'),
  validate: document.querySelector('#validate'),
  buildModule: document.querySelector('#build-module'),
  completion: document.querySelector('#completion'),
  toast: document.querySelector('#toast')
};

const labels = {
  candidate: 'Ожидает проверки', confirmed: 'Подтверждена', rejected: 'Отклонена',
  high: 'высокая', medium: 'средняя', low: 'низкая',
  identity: 'совпадение', renumbered: 'иная нумерация',
  'merged-in-module': 'объединение стихов', 'split-in-module': 'разделение стиха',
  'many-to-many': 'сложное соответствие', 'empty-placeholder-group': 'пустые строки'
};

function kindLabel(kind) {
  if (kind === 'unmatched-reference') return `Нет в модуле ${state.data.map.module.moduleId}`;
  if (kind === 'unmatched-module') return `Нет в модуле ${state.data.map.reference.moduleId}`;
  return labels[kind] || kind;
}

function reasonLabel(item) {
  if (item.kind === 'unmatched-reference' || item.kind === 'unmatched-module') return 'соответствие не найдено';
  if (item.kind === 'renumbered') return 'нумерация отличается';
  if (item.kind === 'merged-in-module' || item.kind === 'split-in-module' || item.kind === 'many-to-many') {
    return 'границы стихов отличаются';
  }
  if (item.kind === 'empty-placeholder-group') return 'обнаружен пустой стих';
  if (item.kind === 'identity') return 'координаты совпадают';
  return 'требуется проверка';
}

function evidenceLabel(evidence) {
  return ({
    'same-coordinate': 'одинаковая координата',
    'exact-text': 'точное совпадение текста',
    'exact-concatenated-text': 'точное совпадение объединённого текста',
    'known-versification': 'известное правило нумерации',
    'known-versification-skip-check': 'документированный перенос отрывка',
    'declared-verse-range': 'объединение указано в разметке модуля',
    'empty-placeholder-adjacency': 'соседняя пустая строка',
    unmatched: 'соответствие не найдено',
    'manual-review': 'решение принято вручную'
  })[evidence] || evidence;
}

function node(tag, className, value) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (value != null) element.textContent = value;
  return element;
}

function toast(message, isError = false) {
  ui.toast.textContent = message;
  ui.toast.className = `toast visible${isError ? ' error' : ''}`;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { ui.toast.className = 'toast'; }, 3500);
}

function savedToast(message, result) {
  toast(result.backupCreated
    ? `${message} Перед первым изменением сохранена резервная копия: ${result.backupPath}`
    : message);
}

async function api(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { ...apiHeaders, ...(options.headers || {}) }
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
  return body;
}

function metric(label, value, tone = '') {
  const card = node('div', `metric ${tone}`);
  card.append(node('strong', '', String(value)), node('span', '', label));
  return card;
}

function renderCompletion(title, message) {
  const copy = node('div', 'completion-copy');
  copy.append(node('strong', '', title), node('span', '', message));
  const controls = node('div', 'completion-controls');
  controls.id = 'group-decision-host';
  ui.completion.replaceChildren(copy, controls);
}

function renderSummary() {
  const data = state.data;
  const validation = data.validation.confirmedOnly;
  ui.modulePair.textContent = `Модуль сравнения: ${data.map.reference.moduleId} → ${data.map.module.moduleId}`;
  ui.summary.replaceChildren(
    metric('всего групп', data.counts.groups),
    metric('ожидают', data.counts.candidate, data.counts.candidate ? 'warning' : ''),
    metric('подтверждено', data.counts.confirmed, 'success'),
    metric('из них автоматически', data.counts.autoConfirmed, 'success'),
    metric('отклонено', data.counts.rejected),
    metric('покрытие модуля сравнения', `${validation.referenceCoverage.percent}%`),
    metric('покрытие модуля', `${validation.moduleCoverage.percent}%`),
    metric('неразрешённых переходов', validation.reverseOrderTransitions, validation.reverseOrderTransitions ? 'danger' : '')
  );
  const ready = data.counts.candidate === 0 && validation.isCompleteAndConsistent;
  ui.buildModule.hidden = !ready;
  ui.buildModule.disabled = !ready;
  ui.completion.hidden = false;
  ui.completion.className = `completion single${data.counts.candidate === 0 && !ready ? ' error' : ''}`;
  if (ready) {
    renderCompletion(
      'Карта полностью проверена.',
      'Следующий шаг — собрать готовый модуль BibleNote с нейтральными VerseId и подтверждёнными соответствиями.'
    );
  } else if (data.counts.candidate > 0) {
    renderCompletion(
      `Осталось проверить групп: ${data.counts.candidate}.`,
      'После принятия всех решений здесь появится кнопка сборки модуля.'
    );
  } else {
    renderCompletion(
      'Решения приняты, но карта пока неполна.',
      'Нажмите «Перепроверить карту» и исправьте указанные проблемы покрытия или порядка стихов.'
    );
  }
}

function filteredGroups() {
  const query = ui.search.value.trim().toLocaleLowerCase();
  return state.data.groups.filter(group => {
    if (ui.status.value && group.status !== ui.status.value) return false;
    if (ui.confidence.value && group.confidence !== ui.confidence.value) return false;
    if (!query) return true;
    const haystack = [group.id, group.bookIndex, group.kind, kindLabel(group.kind), group.referenceStart,
      group.referenceEnd, group.moduleStart, group.moduleEnd, ...(group.evidence || [])].join(' ').toLocaleLowerCase();
    return haystack.includes(query);
  });
}

function renderGroups() {
  const groups = filteredGroups();
  ui.filterCount.textContent = `Показано ${groups.length} из ${state.data.groups.length}`;
  const fragment = document.createDocumentFragment();
  for (const group of groups) {
    const button = node('button', `group-card ${group.status}${group.id === state.selectedId ? ' selected' : ''}`);
    button.type = 'button';
    button.dataset.groupId = group.id;
    const top = node('span', 'group-top');
    const statusLabel = group.status === 'confirmed' && group.autoConfirmed
      ? 'Подтверждена автоматически'
      : (labels[group.status] || group.status);
    top.append(node('strong', '', kindLabel(group.kind)), node('span', `badge ${group.status}`, statusLabel));
    const range = `${group.referenceStart || '—'}${group.referenceEnd && group.referenceEnd !== group.referenceStart ? ` – ${group.referenceEnd}` : ''}  →  ${group.moduleStart || '—'}${group.moduleEnd && group.moduleEnd !== group.moduleStart ? ` – ${group.moduleEnd}` : ''}`;
    button.append(top, node('span', 'range', range), node('span', 'group-meta', `${group.entryCount} записей · ${reasonLabel(group)}`));
    fragment.append(button);
  }
  ui.groups.replaceChildren(fragment);
}

function locationBlock(side, location) {
  const block = node('article', `verse ${side}`);
  block.append(node('h4', '', `${location.bookIndex} ${location.chapter}:${location.verse}${location.empty ? ' · пусто' : ''}`));
  block.append(node('pre', '', location.text || '∅'));
  return block;
}

function coordinatesText(locations) {
  return locations.map(location => `${location.bookIndex} ${location.chapter}:${location.verse}`).join(', ');
}

function contextSide(moduleId, locations) {
  const side = node('section', 'context-side');
  side.append(node('h4', '', moduleId));
  if (!locations.length) {
    side.append(node('p', 'context-empty', 'В этой главе нет стихов для показа.'));
    return side;
  }
  for (const location of locations) {
    const verse = node('article', `context-verse${location.affected ? ' affected' : ''}`);
    verse.append(
      node('code', '', `${location.bookIndex} ${location.chapter}:${location.verse}`),
      node('p', '', location.text || '∅')
    );
    side.append(verse);
  }
  return side;
}

function contextPanel(entry) {
  const panel = node('section', 'context-panel');
  panel.id = `verse-context-${entry.id}`;
  panel.hidden = true;
  panel.append(
    node('h3', '', 'Стихи в контексте'),
    node('p', 'context-help', 'Показаны соседние стихи. Стихи текущего соответствия выделены; если стих отсутствует, показано ближайшее место ожидаемой координаты.')
  );
  const grid = node('div', 'context-grid');
  grid.append(
    contextSide(state.data.map.reference.moduleId, entry.context?.reference || []),
    contextSide(state.data.map.module.moduleId, entry.context?.module || [])
  );
  panel.append(grid);
  return panel;
}

function renderDetail() {
  const page = state.groupPage;
  if (!page) return;
  const group = page.group;
  ui.detail.className = 'detail';
  const heading = node('div', 'detail-heading');
  const title = node('div');
  title.append(node('p', 'eyebrow', group.id), node('h2', '', kindLabel(group.kind)));
  const statusLabel = group.status === 'confirmed' && group.autoConfirmed
    ? 'Подтверждена автоматически'
    : labels[group.status];
  heading.append(title, node('span', `badge ${group.status}`, statusLabel));

  const groupRange = `${group.referenceStart || '—'}${group.referenceEnd && group.referenceEnd !== group.referenceStart ? ` – ${group.referenceEnd}` : ''} → ${group.moduleStart || '—'}${group.moduleEnd && group.moduleEnd !== group.moduleStart ? ` – ${group.moduleEnd}` : ''}`;
  const range = node('p', 'detail-range', groupRange);
  const evidence = node('ul', 'evidence');
  for (const item of group.evidence || []) evidence.append(node('li', '', evidenceLabel(item)));

  const entriesTitle = node('div', 'entries-title');
  entriesTitle.append(
    node('h3', '', `Соответствия в группе: ${page.total}`),
    node('span', '', group.status === 'candidate'
      ? 'Проверьте каждое соответствие; при необходимости исправьте координаты и нажмите «Сохранить соответствие». Решение по всей группе принимается в верхней панели.'
      : 'Группа уже решена. Чтобы изменить соответствия, верните группу на проверку в верхней панели.')
  );

  const decision = node('section', `group-decision ${group.status}`);
  decision.setAttribute('aria-label', 'Решение по группе');
  const decisionText = node('div', 'group-decision-text');
  decisionText.append(
    node('strong', '', `Решение по всей группе · ${page.total} ${pluralEntries(page.total)}`),
    node('span', '', group.status === 'candidate'
      ? `Подтверждение или отклонение относится сразу ко всем соответствиям группы ${groupRange}.`
      : `Группа ${statusLabel.toLocaleLowerCase()}. Возврат на проверку снова откроет редактирование всех её соответствий.`)
  );
  const actions = node('div', 'actions');
  const decisions = group.status === 'candidate'
    ? [['confirmed', 'Подтвердить всю группу'], ['rejected', 'Отклонить всю группу']]
    : [['candidate', 'Вернуть группу на проверку']];
  for (const [status, label] of decisions) {
    const button = node('button', status === 'confirmed' ? 'primary' : 'secondary', label);
    button.type = 'button';
    button.dataset.status = status;
    actions.append(button);
  }
  decision.append(decisionText);
  if (group.status === 'candidate') {
    const nonMonotonic = node('label', 'non-monotonic');
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.id = 'allow-non-monotonic';
    checkbox.checked = group.allowNonMonotonic;
    nonMonotonic.append(checkbox, document.createTextNode(' Разрешить перестановку стихов в этом отрывке (сохраняется сразу)'));
    decision.append(nonMonotonic);
  }
  decision.append(actions);
  const decisionHost = document.querySelector('#group-decision-host');
  decisionHost?.replaceChildren(decision);
  ui.completion.classList.remove('single');

  const rows = node('div', 'entry-list');
  for (const entry of page.entries) {
    const row = node('section', 'entry');
    const entryHeader = node('div', 'entry-header');
    const showContext = node('button', 'secondary compact entry-context-button', 'Показать контекст');
    showContext.type = 'button';
    showContext.dataset.toggleContext = entry.id;
    showContext.setAttribute('aria-expanded', 'false');
    entryHeader.append(
      node('code', '', entry.id),
      node('span', 'entry-kind', `${kindLabel(entry.kind)} · ${reasonLabel(entry)}`),
      showContext
    );
    const verses = node('div', 'verse-pair');
    const reference = node('div', 'verse-side');
    reference.append(node('h3', '', state.data.map.reference.moduleId));
    for (const location of entry.reference) reference.append(locationBlock('reference', location));
    const module = node('div', 'verse-side');
    module.append(node('h3', '', state.data.map.module.moduleId));
    for (const location of entry.module) module.append(locationBlock('module', location));
    verses.append(reference, module);
    const editor = node('div', 'mapping-editor');
    const referenceField = node('label', 'mapping-field');
    referenceField.append(node('span', '', `${state.data.map.reference.moduleId}: координаты`));
    const referenceInput = document.createElement('textarea');
    referenceInput.rows = 2;
    referenceInput.dataset.mappingSide = 'reference';
    referenceInput.value = coordinatesText(entry.reference);
    referenceField.append(referenceInput);
    const moduleField = node('label', 'mapping-field');
    moduleField.append(node('span', '', `${state.data.map.module.moduleId}: координаты`));
    const moduleInput = document.createElement('textarea');
    moduleInput.rows = 2;
    moduleInput.dataset.mappingSide = 'module';
    moduleInput.value = coordinatesText(entry.module);
    moduleField.append(moduleInput);
    const saveMapping = node('button', 'secondary compact', 'Сохранить соответствие');
    saveMapping.type = 'button';
    saveMapping.dataset.saveMapping = entry.id;
    editor.append(referenceField, moduleField, saveMapping,
      node('small', 'mapping-help', 'Формат: номер книги глава:стих. Диапазон записывайте через дефис (1 36:40-43), несколько мест — через запятую (57 1:23, 57 1:24). После сохранения проверьте карту и подтвердите группу.'));
    row.append(entryHeader, verses, contextPanel(entry));
    if (group.status === 'candidate') row.append(editor);
    rows.append(row);
  }

  const pager = node('div', 'pager');
  const from = page.total ? page.offset + 1 : 0;
  const to = Math.min(page.total, page.offset + page.entries.length);
  pager.append(node('span', '', `${from}–${to} из ${page.total}`));
  const previous = node('button', 'secondary compact', '← Назад');
  previous.type = 'button';
  previous.dataset.page = 'previous';
  previous.disabled = page.offset === 0;
  const next = node('button', 'secondary compact', 'Далее →');
  next.type = 'button';
  next.dataset.page = 'next';
  next.disabled = page.offset + page.entries.length >= page.total;
  pager.append(previous, next);
  if (group.status === 'candidate') {
    ui.detail.replaceChildren(heading, range, evidence, entriesTitle, pager, rows, pager.cloneNode(true));
    return;
  }

  const resolvedEntries = document.createElement('details');
  resolvedEntries.className = 'resolved-entries';
  const resolvedSummary = document.createElement('summary');
  resolvedSummary.textContent = `Показать сопоставленные стихи (${page.total})`;
  resolvedEntries.append(resolvedSummary, pager, rows, pager.cloneNode(true));
  ui.detail.replaceChildren(heading, range, evidence, resolvedEntries);
}

function pluralEntries(count) {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return 'соответствие';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'соответствия';
  return 'соответствий';
}

async function loadState() {
  state.data = await api('/api/state');
  renderSummary();
  renderGroups();
}

async function selectGroup(groupId, offset = 0) {
  state.selectedId = groupId;
  state.offset = offset;
  renderGroups();
  document.querySelector('#group-decision-host')?.replaceChildren();
  ui.completion.classList.add('single');
  ui.detail.className = 'detail loading';
  ui.detail.textContent = 'Загрузка стихов…';
  state.groupPage = await api(`/api/groups/${encodeURIComponent(groupId)}?offset=${offset}&limit=${state.limit}`);
  renderDetail();
}

async function saveGroup(status) {
  const checkbox = document.querySelector('#allow-non-monotonic');
  const body = {};
  if (checkbox) body.allowNonMonotonic = Boolean(checkbox.checked);
  if (status) body.status = status;
  const result = await api(`/api/groups/${encodeURIComponent(state.selectedId)}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
  });
  savedToast(status ? 'Решение по группе сохранено.' : 'Настройка группы сохранена.', result);
  await loadState();
  await selectGroup(state.selectedId, state.offset);
}

async function saveMapping(button) {
  const entry = button.closest('.entry');
  const referenceCoordinates = entry.querySelector('[data-mapping-side="reference"]')?.value || '';
  const moduleCoordinates = entry.querySelector('[data-mapping-side="module"]')?.value || '';
  const result = await api(`/api/groups/${encodeURIComponent(state.selectedId)}/entries/${encodeURIComponent(button.dataset.saveMapping)}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ referenceCoordinates, moduleCoordinates })
  });
  savedToast(adjustmentsMessage(result.adjustments), result);
  await loadState();
  await selectGroup(state.selectedId, state.offset);
}

function adjustmentsMessage(adjustments) {
  const parts = [];
  if (adjustments?.trimmedEntries) parts.push(`укорочено записей: ${adjustments.trimmedEntries}`);
  if (adjustments?.removedEntries) parts.push(`удалено записей: ${adjustments.removedEntries}`);
  if (adjustments?.removedGroups) parts.push(`удалено групп: ${adjustments.removedGroups}`);
  if (parts.length === 0) return 'Соответствие сохранено.';
  return `Соответствие сохранено. Указанные стихи забраны у других записей (${parts.join(', ')}); затронутые группы возвращены на проверку.`;
}

ui.groups.addEventListener('click', event => {
  const card = event.target.closest('[data-group-id]');
  if (card) selectGroup(card.dataset.groupId).catch(error => toast(error.message, true));
});
for (const control of [ui.search, ui.status, ui.confidence]) control.addEventListener('input', renderGroups);
ui.detail.addEventListener('click', event => {
  const contextButton = event.target.closest('[data-toggle-context]');
  if (contextButton) {
    const panel = document.querySelector(`#verse-context-${contextButton.dataset.toggleContext}`);
    panel.hidden = !panel.hidden;
    contextButton.textContent = panel.hidden ? 'Показать контекст' : 'Скрыть контекст';
    contextButton.setAttribute('aria-expanded', String(!panel.hidden));
  }
  const mappingButton = event.target.closest('[data-save-mapping]');
  if (mappingButton) saveMapping(mappingButton).catch(error => toast(error.message, true));
  const direction = event.target.closest('[data-page]')?.dataset.page;
  if (direction) {
    const offset = direction === 'next' ? state.offset + state.limit : Math.max(0, state.offset - state.limit);
    selectGroup(state.selectedId, offset).catch(error => toast(error.message, true));
  }
});
ui.completion.addEventListener('click', event => {
  const status = event.target.closest('[data-status]')?.dataset.status;
  if (status) saveGroup(status).catch(error => toast(error.message, true));
});
ui.completion.addEventListener('change', event => {
  if (event.target.id === 'allow-non-monotonic') saveGroup().catch(error => toast(error.message, true));
});
ui.validate.addEventListener('click', async () => {
  const label = ui.validate.textContent;
  ui.validate.disabled = true;
  ui.validate.textContent = 'Проверяем…';
  try {
    const result = await api('/api/validate', { method: 'POST' });
    savedToast('Карта проверена.', result);
    await loadState();
    if (state.selectedId) await selectGroup(state.selectedId, state.offset);
  } catch (error) {
    toast(error.message, true);
  } finally {
    ui.validate.disabled = false;
    ui.validate.textContent = label;
  }
});

ui.buildModule.addEventListener('click', async () => {
  const label = ui.buildModule.textContent;
  let completed = false;
  ui.buildModule.disabled = true;
  ui.validate.disabled = true;
  ui.buildModule.textContent = 'Собираем…';
  try {
    const result = await api('/api/build-module', { method: 'POST' });
    completed = true;
    ui.completion.hidden = false;
    ui.completion.className = 'completion';
    ui.completion.replaceChildren(
      node('strong', '', 'Модуль BibleNote собран.'),
      node('span', '', 'Файл: '),
      node('code', '', result.module.outputPath),
      node('span', '', ` · стихов: ${result.module.verses} · сносок с текстом: ${result.module.footnotesEmbedded}`)
    );
    toast('Модуль готов к установке через Параметры → Модули → Загрузить модули.');
  } catch (error) {
    ui.completion.hidden = false;
    ui.completion.className = 'completion error';
    ui.completion.replaceChildren(node('strong', '', 'Не удалось собрать модуль.'), node('span', '', error.message));
    toast(error.message, true);
  } finally {
    ui.buildModule.disabled = completed;
    ui.validate.disabled = false;
    ui.buildModule.textContent = completed ? 'Модуль собран' : label;
  }
});

loadState().catch(error => {
  ui.detail.className = 'detail error-panel';
  ui.detail.textContent = `Не удалось открыть карту: ${error.message}`;
});
