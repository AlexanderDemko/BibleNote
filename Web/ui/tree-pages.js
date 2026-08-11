function sourceTypeIcon(value) {
  const sourceIcon = document.createElement('span');
  const sourceType = ['graph', 'com', 'folder'].includes(value) ? value : 'folder';
  sourceIcon.className = 'source-type-icon ' + sourceType;
  sourceIcon.setAttribute('aria-hidden', 'true');
  sourceIcon.title = sourceType === 'graph'
    ? 'OneNote Cloud'
    : (sourceType === 'com' ? 'OneNote Local' : 'Папка');
  sourceIcon.innerHTML = sourceType === 'folder'
    ? '<svg viewBox="0 0 20 20"><path d="M2.5 5.5h5l1.7 2h8.3v7.5a1.5 1.5 0 0 1-1.5 1.5H4A1.5 1.5 0 0 1 2.5 15z"/></svg>'
    : sourceType === 'com'
      ? '<svg viewBox="0 0 20 20"><rect x="3" y="4" width="14" height="12" rx="2"/><path d="M6.5 13V7l4 6V7M13.5 7v6"/></svg>'
      : '<svg viewBox="0 0 20 20"><path d="M6.2 15.5h8.2a3.1 3.1 0 0 0 .3-6.2A4.8 4.8 0 0 0 5.5 8a3.8 3.8 0 0 0 .7 7.5Z"/></svg>';
  return sourceIcon;
}

function fileTypeIcon(extension, sourceType) {
  const fileType = fileTypeDescriptor(extension, sourceType);
  if (!fileType) return null;
  const icon = document.createElement('span');
  icon.className = 'status-dot placeholder file-type-icon ' + fileType.key;
  icon.textContent = fileType.label;
  icon.title = fileType.title;
  icon.setAttribute('aria-hidden', 'true');
  return icon;
}

function row(label, level, options = {}) {
  const button = document.createElement('button');
  button.className = 'tree-row level-' + level
    + (options.source ? ' source-row' : '')
    + (options.page ? ' page-row' : '')
    + (options.section ? ' section-row' : '')
    + (options.search ? ' search-result-row' : '')
    + (options.selected ? ' selected' : '');
  button.style.setProperty('--tree-level', String(level));
  button.type = 'button';
  if (options.title) button.title = options.title;
  const chev = document.createElement('span');
  chev.className = options.page
    ? 'chevron placeholder'
    : 'chevron ' + (options.expandable ? 'expandable' : 'leaf') + (options.open ? ' open' : '');
  chev.setAttribute('aria-hidden', 'true');
  button.append(chev);
  if (options.source) {
    button.append(sourceTypeIcon(options.sourceType));
  }
  if (level > 0 && !options.page && options.folder) {
    const nodeIcon = document.createElement('span');
    nodeIcon.className = 'group-icon';
    nodeIcon.setAttribute('aria-hidden', 'true');
    button.append(nodeIcon);
  }
  if (options.status || options.page) {
    const dot = document.createElement('span');
    dot.className = 'status-dot ' + (options.status || 'placeholder');
    const fileType = options.page ? fileTypeDescriptor(options.fileExtension, options.sourceType) : null;
    if (fileType) {
      dot.classList.add('file-type-icon', fileType.key);
      dot.textContent = fileType.label;
      dot.title = fileType.title;
    }
    dot.setAttribute('aria-hidden', 'true');
    button.append(dot);
  }
  const text = document.createElement('span');
  text.className = 'label';
  text.textContent = label || '(без названия)';
  button.append(text);
  if (options.count != null) {
    const count = document.createElement('span');
    count.className = 'count';
    count.textContent = options.count;
    button.append(count);
  }
  if (options.onRename) {
    const rename = document.createElement('span');
    rename.className = 'tree-rename';
    rename.setAttribute('role', 'button');
    rename.setAttribute('tabindex', '0');
    rename.setAttribute('aria-label', options.renameLabel || 'Изменить отображаемое имя');
    rename.setAttribute('title', options.renameLabel || 'Изменить отображаемое имя');
    rename.textContent = '\u270E';
    const activateRename = event => {
      event.preventDefault();
      event.stopPropagation();
      options.onRename();
    };
    rename.addEventListener('click', activateRename);
    rename.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') activateRename(event);
    });
    button.append(rename);
  }
  if (options.onSync) {
    const sync = document.createElement('span');
    sync.className = 'tree-sync';
    sync.setAttribute('role', 'button');
    sync.setAttribute('tabindex', '0');
    sync.setAttribute('aria-label', options.syncLabel || 'Синхронизировать');
    sync.setAttribute('title', options.syncLabel || 'Синхронизировать');
    sync.setAttribute('aria-disabled', String(syncRunning));
    sync.textContent = '↻';
    const activate = event => {
      event.preventDefault();
      event.stopPropagation();
      if (!syncRunning) options.onSync();
    };
    sync.addEventListener('click', activate);
    sync.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') activate(event);
    });
    button.append(sync);
  }
  return button;
}

function compareOneNoteOrder(left, right) {
  const leftOrder = Number.isFinite(left.orderIndex) ? left.orderIndex : null;
  const rightOrder = Number.isFinite(right.orderIndex) ? right.orderIndex : null;
  if (leftOrder != null && rightOrder != null && leftOrder !== rightOrder) return leftOrder - rightOrder;
  if (leftOrder != null && rightOrder == null) return -1;
  if (leftOrder == null && rightOrder != null) return 1;
  return String(left.displayName ?? left.title ?? '').localeCompare(
    String(right.displayName ?? right.title ?? ''),
    undefined,
    { numeric:true, sensitivity:'base' }
  );
}

function compareOneNotePageOrder(left, right) {
  const leftOrder = Number.isFinite(left.orderIndex) ? left.orderIndex : null;
  const rightOrder = Number.isFinite(right.orderIndex) ? right.orderIndex : null;
  if (leftOrder != null && rightOrder != null && leftOrder !== rightOrder) return leftOrder - rightOrder;
  if (leftOrder != null && rightOrder == null) return -1;
  if (leftOrder == null && rightOrder != null) return 1;
  return String(left.title ?? '').localeCompare(
    String(right.title ?? ''),
    undefined,
    { numeric:true, sensitivity:'base' }
  );
}

const defaultNotesSearchPlaceholder = searchInput.placeholder;
let notesScope = null;

function updateNotesSearchScope() {
  searchInput.placeholder = notesScope
    ? `Поиск в ${notesScope.type === 'group' ? 'папке' : 'разделе'} «${notesScope.displayName}»...`
    : defaultNotesSearchPlaceholder;
}

function notesScopeBanner() {
  const banner = document.createElement('div');
  banner.className = 'notes-scope-banner';
  const label = document.createElement('span');
  label.textContent = `${notesScope.type === 'group' ? 'Папка' : 'Раздел'}: ${notesScope.displayName}`;
  const clear = document.createElement('button');
  clear.type = 'button';
  clear.textContent = 'Вся структура';
  clear.addEventListener('click', () => clearNotesScope().catch(showError));
  banner.append(label, clear);
  return banner;
}

async function clearNotesScope() {
  notesScope = null;
  updateNotesSearchScope();
  tree.scrollTop = 0;
  await renderNotesList();
}

async function applyNotesScope(info, focusSearch = false) {
  notesScope = {
    ...info,
    type:info.type === 'group' ? 'group' : 'section'
  };
  notesListView = 'structure';
  localStorage.setItem('onenote.notesListView', notesListView);
  searchInput.value = '';
  activeSearchQuery = '';
  hideSearchHistory();
  searchHistoryIndex = -1;
  if (notesScope.type === 'group') expanded.add('g:' + notesScope.id);
  else expanded.add('s:' + notesScope.id);
  updateNotesSearchScope();
  updateNotesListViewControls();
  tree.scrollTop = 0;
  await renderNotesList();
  if (focusSearch) searchInput.focus();
}

function updateNotesListViewControls() {
  const structureSelected = notesListView === 'structure';
  notesViewSwitch.hidden = Boolean(activeSearchQuery);
  notesStructureViewButton.setAttribute('aria-selected', String(structureSelected));
  notesRecentViewButton.setAttribute('aria-selected', String(!structureSelected));
  notesStructureViewButton.tabIndex = structureSelected ? 0 : -1;
  notesRecentViewButton.tabIndex = structureSelected ? -1 : 0;
  tree.setAttribute('aria-label', structureSelected ? 'Структура заметок' : 'Последние заметки');
}

let recentPagesSnapshot = null;
let recentPagesSnapshotKey = '';

async function activateNotesListView(view) {
  if (!['structure', 'recent'].includes(view)) return;
  if (view === 'recent') {
    recentPagesSnapshot = null;
    recentPagesSnapshotKey = '';
  }
  clearTimeout(searchTimer);
  notesScope = null;
  updateNotesSearchScope();
  notesListView = view;
  localStorage.setItem('onenote.notesListView', view);
  hideSearchHistory();
  searchHistoryIndex = -1;
  searchInput.value = '';
  activeSearchQuery = '';
  updateNotesListViewControls();
  updateOpenPageSearchMatches(null, '');
  tree.scrollTop = 0;
  await renderNotesList();
}

function recentDateKey(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return [date.getFullYear(), date.getMonth() + 1, date.getDate()].join('-');
}

function recentGroupLabel(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Без даты';
  const today = new Date();
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  if (recentDateKey(date) === recentDateKey(today)) return 'Сегодня';
  if (recentDateKey(date) === recentDateKey(yesterday)) return 'Вчера';
  return date.toLocaleDateString('ru-RU', { day:'numeric', month:'long', year:date.getFullYear() === today.getFullYear() ? undefined : 'numeric' });
}

function recentTimeLabel(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleTimeString('ru-RU', { hour:'2-digit', minute:'2-digit' });
}

async function renderRecentPages() {
  const renderToken = ++treeRenderToken;
  const savedScrollTop = tree.scrollTop;
  const selectedIds = selectedNotebookIds();
  const fragment = document.createDocumentFragment();
  if (selectedIds.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'recent-empty';
    empty.textContent = 'Выберите хотя бы одну коллекцию.';
    fragment.append(empty);
  } else {
    const params = new URLSearchParams({ limit:'100' });
    for (const notebookId of selectedIds) params.append('notebookId', notebookId);
    const snapshotKey = JSON.stringify(selectedIds);
    if (!recentPagesSnapshot || recentPagesSnapshotKey !== snapshotKey) {
      recentPagesSnapshot = await api('/api/recent-pages?' + params.toString());
      recentPagesSnapshotKey = snapshotKey;
    }
    const pages = recentPagesSnapshot;
    let currentGroup = null;
    for (const page of pages) {
      const group = recentDateKey(page.recentAt);
      if (group !== currentGroup) {
        currentGroup = group;
        const heading = document.createElement('div');
        heading.className = 'recent-heading';
        heading.textContent = recentGroupLabel(page.recentAt);
        fragment.append(heading);
      }
      const button = document.createElement('button');
      button.className = 'tree-row recent-page-row' + (page.id === selectedPageId ? ' selected' : '');
      button.type = 'button';
      button.dataset.pageId = page.id;
      button.title = [page.notebook, page.sectionGroupPath, page.section, page.title].filter(Boolean).join(' / ');
      button.onclick = async () => {
        if (page.id === selectedPageId) return;
        await openPage(page.id);
      };

      const sourceType = sourceTypeForNotebook(page.notebookId);
      const typeIcons = document.createElement('span');
      typeIcons.className = 'recent-page-type-icons';
      typeIcons.append(sourceTypeIcon(sourceType));
      const documentIcon = fileTypeIcon(page.fileExtension, sourceType);
      if (documentIcon) typeIcons.append(documentIcon);
      const main = document.createElement('span');
      main.className = 'recent-page-main';
      const title = document.createElement('span');
      title.className = 'recent-page-title';
      title.textContent = page.title || '(без названия)';
      const meta = document.createElement('span');
      meta.className = 'recent-page-meta';
      const path = document.createElement('span');
      path.className = 'recent-page-path';
      path.textContent = [page.notebook, page.sectionGroupPath, page.section].filter(Boolean).join(' / ');
      const time = document.createElement('span');
      time.className = 'recent-page-time';
      time.textContent = (page.recentReason === 'opened' ? 'открыта здесь ' : 'изменена ') + recentTimeLabel(page.recentAt);
      meta.append(path, time);
      main.append(title, meta);
      button.append(typeIcons, main);
      fragment.append(button);
    }
    if (pages.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'recent-empty';
      empty.textContent = 'В выбранных коллекциях пока нет заметок.';
      fragment.append(empty);
    }
  }
  if (renderToken !== treeRenderToken) return;
  tree.replaceChildren(fragment);
  tree.scrollTop = savedScrollTop;
}

async function renderScopedTree() {
  const renderToken = ++treeRenderToken;
  const fragment = document.createDocumentFragment();
  fragment.append(notesScopeBanner());
  if (notesScope.type === 'group') {
    await renderSections(notesScope.notebookId, fragment, 0, {
      onlyGroupId:notesScope.id,
      flattenFileSections:notesScope.sourceType === 'folder'
    });
  } else {
    const key = 's:' + notesScope.id;
    const open = expanded.has(key);
    const button = row(notesScope.displayName, 0, {
      expandable:true,
      section:true,
      open,
      count:notesScope.pageCount || (notesScope.scanComplete === 1 ? 'пустая' : null),
      title:'Раздел «' + notesScope.displayName + '»',
      syncLabel:'Синхронизировать раздел «' + notesScope.displayName + '»',
      onSync:() => startTargetedSync({ sectionId:notesScope.id }, 'раздел «' + notesScope.displayName + '»')
    });
    button.dataset.sectionId = notesScope.id;
    button.dataset.notebookId = notesScope.notebookId;
    button.onclick = () => { open ? expanded.delete(key) : expanded.add(key); renderNotesList(); };
    fragment.append(button);
    if (open) await renderPages(notesScope.id, fragment, 1);
  }
  if (renderToken !== treeRenderToken) return;
  tree.replaceChildren(fragment);
  tree.scrollTop = 0;
}

function renderNotesList() {
  updateNotesListViewControls();
  if (activeSearchQuery) return renderSearch(activeSearchQuery);
  if (notesScope) return renderScopedTree();
  return notesListView === 'recent' ? renderRecentPages() : renderTree();
}

function normalizedStructureLabel(value) {
  return String(value || '')
    .normalize('NFKC')
    .toLocaleLowerCase('ru-RU')
    .replace(/[^\p{L}\p{N}]+/gu, '');
}

function structureLabelsMatch(left, right) {
  const normalizedLeft = normalizedStructureLabel(left);
  return Boolean(normalizedLeft) && normalizedLeft === normalizedStructureLabel(right);
}

function fileTypeDescriptor(extension, sourceType) {
  switch (String(extension || '').toLocaleLowerCase('en-US')) {
    case '.pdf': return { key:'pdf', label:'P', title:'PDF' };
    case '.doc': return { key:'word', label:'W', title:'Word DOC' };
    case '.docx': return { key:'word', label:'W', title:'Word DOCX' };
    case '.html':
    case '.htm': return { key:'html', label:'H', title:'HTML' };
    case '.txt': return { key:'text', label:'T', title:'Текстовый файл' };
    default: return ['graph', 'com'].includes(sourceType)
      ? { key:'onenote', label:'N', title:'OneNote' }
      : null;
  }
}

function sourceTypeForNotebook(notebookId) {
  const notebook = notebooksCache.find(item => String(item.id) === String(notebookId));
  return notebook?.sourceType
    || (String(notebookId).startsWith('folder:notebook:')
      ? 'folder'
      : (String(notebookId).trim().startsWith('{') ? 'com' : 'graph'));
}

async function renderTree() {
  const renderToken = ++treeRenderToken;
  const savedScrollTop = tree.scrollTop;
  const fragment = document.createDocumentFragment();
  const sourceGroups = new Map();
  for (const source of dataSourcesCache) {
    sourceGroups.set(source.id, {
      id:source.id,
      type:source.type,
      displayName:source.displayName,
      notebooks:[]
    });
  }
  for (const notebook of notebooksCache) {
    const sourceType = notebook.sourceType || (String(notebook.id).startsWith('folder:notebook:') ? 'folder' : String(notebook.id).trim().startsWith('{') ? 'com' : 'graph');
    const sourceId = notebook.sourceId || (sourceType === 'folder' ? 'source:' + notebook.id : 'source:' + sourceType);
    if (!sourceGroups.has(sourceId)) {
      sourceGroups.set(sourceId, {
        id:sourceId,
        type:sourceType,
        displayName:notebook.sourceDisplayName || (sourceType === 'graph' ? 'OneNote Cloud' : sourceType === 'com' ? 'OneNote Local' : notebook.displayName),
        notebooks:[]
      });
    }
    sourceGroups.get(sourceId).notebooks.push(notebook);
  }
  const sources = [...sourceGroups.values()].sort((left, right) => {
    const order = { graph:0, com:1, folder:2 };
    return (order[left.type] ?? 3) - (order[right.type] ?? 3)
      || String(left.displayName).localeCompare(String(right.displayName), undefined, { numeric:true, sensitivity:'base' });
  });
  for (const source of sources) {
    const sourceKey = 'src:' + source.id;
    const sourceOpen = expanded.has(sourceKey);
    const notebookIds = source.notebooks.map(notebook => notebook.id);
    const pageCount = source.notebooks.reduce((total, notebook) => total + Number(notebook.pageCount || 0), 0);
    const sourceButton = row(source.displayName, 0, {
      source:true,
      sourceType:source.type,
      expandable:true,
      open:sourceOpen,
      count:pageCount,
      syncLabel:'Синхронизировать источник «' + source.displayName + '»',
      onSync:notebookIds.length ? () => startTargetedSync({ notebookIds }, 'источник «' + source.displayName + '»') : undefined
    });
    sourceButton.onclick = () => { sourceOpen ? expanded.delete(sourceKey) : expanded.add(sourceKey); renderNotesList(); };
    fragment.append(sourceButton);
    if (!sourceOpen) continue;

    for (const notebook of source.notebooks) {
      const matchingFolderRoot = source.type === 'folder'
        && structureLabelsMatch(source.displayName, notebook.displayName);
      if (source.type === 'folder' && (source.notebooks.length === 1 || matchingFolderRoot)) {
        await renderSections(notebook.id, fragment, 1, {
          flattenRootSectionLabel:notebook.displayName,
          flattenFileSections:true
        });
        continue;
      }
      const key = 'n:' + notebook.id;
      const open = expanded.has(key);
      const button = row(notebook.displayName, 1, {
        expandable:true,
        open,
        count:notebook.pageCount,
        syncLabel:'Синхронизировать коллекцию «' + notebook.displayName + '»',
        onSync:() => startTargetedSync(
          { notebookIds:[notebook.id] },
          'коллекцию «' + notebook.displayName + '»'
        )
      });
      button.onclick = () => { open ? expanded.delete(key) : expanded.add(key); renderNotesList(); };
      fragment.append(button);
      if (open) await renderSections(notebook.id, fragment, 2, source.type === 'folder' ? {
        flattenRootSectionLabel:notebook.displayName,
        flattenFileSections:true
      } : {});
    }
  }
  if (renderToken !== treeRenderToken) return;
  tree.replaceChildren(fragment);
  tree.scrollTop = savedScrollTop;
}

async function revealPageInTree(page) {
  const notebookId = page?.parentNotebook?.id;
  const sectionId = page?.parentSection?.id;
  if (!page?.id || !notebookId || !sectionId) {
    showActivity('Не удалось определить положение страницы в дереве.', 'error');
    return;
  }

  hideSearchHistory();
  searchHistoryIndex = -1;
  searchInput.value = '';
  activeSearchQuery = '';
  notesScope = null;
  updateNotesSearchScope();
  notesListView = 'structure';
  localStorage.setItem('onenote.notesListView', notesListView);
  updateNotesListViewControls();
  clearPageTargetHighlight(page.id);

  const notesPanel = document.querySelector('.notes-panel');
  if (notesPanel) notesPanel.setAttribute('open', '');

  expanded.add('n:' + notebookId);
  const notebook = notebooksCache.find(item => item.id === notebookId);
  if (notebook) {
    const sourceType = notebook.sourceType || (String(notebook.id).startsWith('folder:notebook:') ? 'folder' : String(notebook.id).trim().startsWith('{') ? 'com' : 'graph');
    const sourceId = notebook.sourceId || (sourceType === 'folder' ? 'source:' + notebook.id : 'source:' + sourceType);
    expanded.add('src:' + sourceId);
  }
  const [sections, groups] = await Promise.all([
    api('/api/sections?notebookId=' + encodeURIComponent(notebookId)),
    api('/api/section-groups?notebookId=' + encodeURIComponent(notebookId))
  ]);
  const section = sections.find(item => item.id === sectionId);
  const groupsById = new Map(groups.map(group => [group.id, group]));
  let groupId = section?.parentGroupId || '';
  const visited = new Set();
  while (groupId && !visited.has(groupId)) {
    visited.add(groupId);
    expanded.add('g:' + groupId);
    groupId = groupsById.get(groupId)?.parentGroupId || '';
  }
  expanded.add('s:' + sectionId);

  await renderTree();
  updateTreeSelection(page.id);
  requestAnimationFrame(() => {
    updateTreeScrollbar();
    scrollTreeSelectionIntoView('smooth');
  });
}

notesStructureViewButton.addEventListener('click', () => activateNotesListView('structure').catch(showError));
notesRecentViewButton.addEventListener('click', () => activateNotesListView('recent').catch(showError));
notesStructureViewButton.addEventListener('keydown', event => {
  if (event.key === 'ArrowRight') {
    event.preventDefault();
    notesRecentViewButton.focus();
    activateNotesListView('recent').catch(showError);
  }
});
notesRecentViewButton.addEventListener('keydown', event => {
  if (event.key === 'ArrowLeft') {
    event.preventDefault();
    notesStructureViewButton.focus();
    activateNotesListView('structure').catch(showError);
  }
});
updateNotesListViewControls();

function clearPageTargetHighlight(pageId) {
  currentTargetParagraphIndex = undefined;
  currentTargetParagraphIndexes = [];
  currentTargetBibleOccurrences = [];
  if (viewHistoryIndex >= 0 && viewHistory[viewHistoryIndex]?.type === 'page' && viewHistory[viewHistoryIndex]?.pageId === pageId) {
    viewHistory[viewHistoryIndex] = { type:'page', pageId };
  }
  history.replaceState({ pageId }, '', pageUrl(pageId));
  content.querySelector('.match-nav')?.remove();
  content.querySelectorAll('.current-match').forEach(match => match.classList.remove('current-match'));
  content.querySelectorAll('.bible-paragraph-target').forEach(target => target.classList.remove('bible-paragraph-target'));
  for (const mark of [...content.querySelectorAll('mark:not(.page-find-match)')]) {
    const parent = mark.parentNode;
    mark.replaceWith(...mark.childNodes);
    parent?.normalize();
  }
  const frame = content.querySelector('.html-frame');
  frame?.contentWindow?.postMessage({ type:'onenote-clear-target-paragraphs' }, '*');
}

async function renderSections(notebookId, target, baseLevel = 1, options = {}) {
  const sections = await api('/api/sections?notebookId=' + encodeURIComponent(notebookId));
  const groups = await api('/api/section-groups?notebookId=' + encodeURIComponent(notebookId));
  const sectionsByGroup = new Map();
  const groupsByParent = new Map();
  for (const section of sections) {
    const parentId = section.parentGroupId || '';
    if (!sectionsByGroup.has(parentId)) sectionsByGroup.set(parentId, []);
    sectionsByGroup.get(parentId).push(section);
  }
  for (const group of groups) {
    const parentId = group.parentGroupId || '';
    if (!groupsByParent.has(parentId)) groupsByParent.set(parentId, []);
    groupsByParent.get(parentId).push(group);
  }
  for (const items of sectionsByGroup.values()) items.sort(compareOneNoteOrder);
  for (const items of groupsByParent.values()) items.sort(compareOneNoteOrder);

  const renderSection = async (section, level) => {
    const key = 's:' + section.id;
    const open = expanded.has(key);
    const complete = section.scanComplete === 1;
    const countLabel = complete
      ? section.pageCount === 0 ? 'пустая' : section.pageCount
      : section.pageCount === 0 ? 'не загружена' : section.pageCount + ' · частично';
    const sectionStatus = complete ? section.pageCount === 0 ? 'empty' : '' : 'pending';
    const scanTitle = complete
      ? 'Секция полностью просканирована' + (section.scannedAt ? ': ' + formatDate(section.scannedAt) : '')
      : 'Метаданные страниц секции ещё не загружены полностью';
    const button = row(section.displayName, level, {
      expandable:true,
      section:true,
      open,
      count:countLabel,
      status:sectionStatus,
      title:(section.groupPath ? 'Группа: ' + section.groupPath + '\n' : '') + scanTitle,
      syncLabel:'Синхронизировать секцию «' + section.displayName + '»',
      onSync:() => startTargetedSync({ sectionId:section.id }, 'секцию «' + section.displayName + '»')
    });
    button.dataset.sectionId = section.id;
    button.dataset.notebookId = notebookId;
    button.onclick = () => { open ? expanded.delete(key) : expanded.add(key); renderNotesList(); };
    target.append(button);
    if (open) await renderPages(section.id, target, level + 1);
  };

  const renderLevel = async (parentGroupId, level) => {
    for (const group of groupsByParent.get(parentGroupId) || []) {
      const key = 'g:' + group.id;
      const open = expanded.has(key);
      const button = row(group.displayName, level, {
        expandable:true,
        open,
        folder:true,
        count:group.sectionCount || null,
        title:'Группа разделов'
      });
      button.dataset.groupId = group.id;
      button.dataset.notebookId = notebookId;
      button.onclick = () => { open ? expanded.delete(key) : expanded.add(key); renderNotesList(); };
      target.append(button);
      if (open) await renderLevel(group.id, level + 1);
    }
    for (const section of sectionsByGroup.get(parentGroupId) || []) {
      const flattenRootSection = !parentGroupId
        && options.flattenRootSectionLabel
        && structureLabelsMatch(options.flattenRootSectionLabel, section.displayName);
      const flattenFolderFileSection = options.flattenFileSections
        && structureLabelsMatch('Файлы', section.displayName);
      if (flattenRootSection || flattenFolderFileSection) await renderPages(section.id, target, level);
      else await renderSection(section, level);
    }
  };

  if (options.onlyGroupId) {
    const rootGroup = groups.find(group => group.id === options.onlyGroupId);
    if (!rootGroup) return;
    const rootParentId = rootGroup.parentGroupId || '';
    groupsByParent.set(rootParentId, [rootGroup]);
    await renderLevel(rootParentId, baseLevel);
  } else {
    await renderLevel('', baseLevel);
  }
}

async function renderPages(sectionId, target = tree, level = 2) {
  const pages = (await api('/api/pages?sectionId=' + encodeURIComponent(sectionId)))
    .filter(page => !String(page.title || '').startsWith('~$'));
  pages.sort(compareOneNotePageOrder);
  for (const page of pages) {
    const state = page.fetchError ? 'error' : page.hasContent ? 'ok' : '';
    const rawPageLevel = Number(page.pageLevel);
    const pageLevel = Number.isInteger(rawPageLevel) && rawPageLevel > 0
      ? Math.min(rawPageLevel, 32)
      : 0;
    const button = row(page.title, level + pageLevel, {
      page:true,
      status:state,
      fileExtension:page.fileExtension,
      selected:page.id === selectedPageId,
      title:page.title,
      syncLabel:'Синхронизировать страницу «' + page.title + '»',
      onSync:() => startTargetedSync({ pageId:page.id }, 'страницу «' + page.title + '»')
    });
    button.dataset.pageId = page.id;
    button.onclick = () => openPage(page.id);
    target.append(button);
  }
}

let noteContextMenu;
let noteContextMenuOwner;
let noteContextMenuRequest = 0;

function closeNoteContextMenu(restoreFocus = false) {
  noteContextMenuRequest += 1;
  noteContextMenu?.remove();
  noteContextMenu = undefined;
  const owner = noteContextMenuOwner;
  noteContextMenuOwner = undefined;
  if (restoreFocus && owner?.isConnected) owner.focus({ preventScroll:true });
}

function noteContextSeparator() {
  const separator = document.createElement('div');
  separator.className = 'note-context-separator';
  separator.setAttribute('role', 'separator');
  return separator;
}

function noteContextItem(label, action, options = {}) {
  const button = document.createElement('button');
  button.className = 'note-context-item';
  button.type = 'button';
  button.setAttribute('role', 'menuitem');
  button.textContent = label;
  button.disabled = options.disabled === true;
  if (options.title) button.title = options.title;
  button.addEventListener('click', () => {
    closeNoteContextMenu();
    Promise.resolve(action()).catch(showError);
  });
  return button;
}

function pageInfoRow(label, value) {
  if (value == null || value === '') return undefined;
  const row = document.createElement('div');
  const term = document.createElement('dt');
  const description = document.createElement('dd');
  term.textContent = label;
  description.textContent = String(value);
  row.append(term, description);
  return row;
}

function showNoteInfo(page) {
  document.querySelector('.note-info-dialog')?.remove();
  const dialog = document.createElement('dialog');
  dialog.className = 'note-info-dialog';
  dialog.setAttribute('aria-labelledby', 'noteInfoTitle');
  const body = document.createElement('div');
  body.className = 'note-info-body';
  const header = document.createElement('header');
  const heading = document.createElement('h2');
  heading.id = 'noteInfoTitle';
  heading.textContent = page.title || '(без названия)';
  const pathLabel = document.createElement('p');
  pathLabel.textContent = pagePathLabel(page) || 'Расположение не указано';
  header.append(heading, pathLabel);
  const details = document.createElement('dl');
  details.className = 'note-info-list';
  const folderInfo = page.links?.folder;
  const originalKind = folderInfo
    ? 'Файл' + (folderInfo.extension ? ` (${String(folderInfo.extension).replace(/^\./, '').toUpperCase()})` : '')
    : (oneNoteClientPageUrl(page) || /^\{[0-9A-F-]+\}/i.test(String(page.id || '')) ? 'OneNote' : 'Не указан');
  const rows = [
    pageInfoRow('Источник', page.parentNotebook?.displayName),
    pageInfoRow('Раздел', [page.sectionGroupPath, page.parentSection?.displayName].filter(Boolean).join(' / ')),
    pageInfoRow('Оригинал', originalKind),
    pageInfoRow('Путь к файлу', folderInfo?.path),
    pageInfoRow('Создана', formatDate(page.createdDateTime)),
    pageInfoRow('Изменена', formatDate(page.lastModifiedDateTime)),
    pageInfoRow('Синхронизирована', formatDate(page.contentSyncedAt)),
    pageInfoRow('Ошибка загрузки', page.fetchError)
  ].filter(Boolean);
  details.append(...rows);
  const footer = document.createElement('footer');
  const closeButton = document.createElement('button');
  closeButton.className = 'dialog-button primary';
  closeButton.type = 'button';
  closeButton.textContent = 'Закрыть';
  closeButton.addEventListener('click', () => dialog.close());
  footer.append(closeButton);
  body.append(header, details, footer);
  dialog.append(body);
  dialog.addEventListener('close', () => dialog.remove(), { once:true });
  document.body.append(dialog);
  dialog.showModal();
  closeButton.focus();
}

function showHierarchyInfo(info) {
  document.querySelector('.note-info-dialog')?.remove();
  const dialog = document.createElement('dialog');
  dialog.className = 'note-info-dialog';
  dialog.setAttribute('aria-labelledby', 'hierarchyInfoTitle');
  const body = document.createElement('div');
  body.className = 'note-info-body';
  const header = document.createElement('header');
  const heading = document.createElement('h2');
  heading.id = 'hierarchyInfoTitle';
  heading.textContent = info.displayName || (info.type === 'group' ? '(папка без названия)' : '(раздел без названия)');
  const pathLabel = document.createElement('p');
  pathLabel.textContent = [info.notebookName, info.groupPath].filter(Boolean).join(' / ') || 'Расположение не указано';
  header.append(heading, pathLabel);
  const details = document.createElement('dl');
  details.className = 'note-info-list';
  const sourceLabel = info.sourceType === 'folder'
    ? 'Папка на компьютере'
    : info.sourceType === 'com' ? 'OneNote Local' : 'OneNote Cloud';
  const rows = [
    pageInfoRow('Тип', info.type === 'group' ? 'Папка' : 'Раздел'),
    pageInfoRow('Источник', sourceLabel),
    pageInfoRow('Коллекция', info.notebookName),
    pageInfoRow('Путь', info.links?.folderPath || info.groupPath),
    info.type === 'group' ? pageInfoRow('Вложенных папок', info.childGroupCount) : undefined,
    info.type === 'group' ? pageInfoRow('Разделов', info.sectionCount) : undefined,
    pageInfoRow('Заметок', info.pageCount),
    pageInfoRow('Изменён', formatDate(info.lastModifiedDateTime)),
    pageInfoRow('Синхронизирован', formatDate(info.syncedAt)),
    info.type === 'section' ? pageInfoRow('Структура проверена', formatDate(info.scannedAt)) : undefined,
    info.type === 'section' ? pageInfoRow('Ошибка проверки', info.scanError) : undefined
  ].filter(Boolean);
  details.append(...rows);
  const footer = document.createElement('footer');
  const closeButton = document.createElement('button');
  closeButton.className = 'dialog-button primary';
  closeButton.type = 'button';
  closeButton.textContent = 'Закрыть';
  closeButton.addEventListener('click', () => dialog.close());
  footer.append(closeButton);
  body.append(header, details, footer);
  dialog.append(body);
  dialog.addEventListener('close', () => dialog.remove(), { once:true });
  document.body.append(dialog);
  dialog.showModal();
  closeButton.focus();
}

async function openOneNoteOriginal(page) {
  const target = oneNoteClientPageUrl(page);
  const localPageId = /^\{[0-9A-F-]+\}/i.test(String(page?.id || '')) ? page.id : '';
  await api('/api/system/open-onenote-page', {
    method:'POST',
    headers:{ 'Content-Type':'application/json' },
    body:JSON.stringify({ url:target, pageId:localPageId })
  });
}

async function openFolderOriginal(page, reveal = false) {
  await api('/api/system/open-folder-page', {
    method:'POST',
    headers:{ 'Content-Type':'application/json' },
    body:JSON.stringify({ pageId:page.id, reveal })
  });
}

async function openHierarchyOriginal(info) {
  if (info.links?.folderPath) {
    await api('/api/system/open-folder-hierarchy', {
      method:'POST',
      headers:{ 'Content-Type':'application/json' },
      body:JSON.stringify({ kind:info.type, id:info.id })
    });
    return;
  }
  await openOneNoteOriginal(info);
}

function positionNoteContextMenu(menu, x, y) {
  const bounds = menu.getBoundingClientRect();
  const left = Math.max(8, Math.min(x, window.innerWidth - bounds.width - 8));
  const top = Math.max(8, Math.min(y, window.innerHeight - bounds.height - 8));
  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;
}

function mountNoteContextMenu(menu, owner, x, y) {
  menu.addEventListener('keydown', event => {
    const items = [...menu.querySelectorAll('.note-context-item:not(:disabled)')];
    const index = items.indexOf(document.activeElement);
    let nextIndex;
    if (event.key === 'ArrowDown') nextIndex = (index + 1) % items.length;
    else if (event.key === 'ArrowUp') nextIndex = (index - 1 + items.length) % items.length;
    else if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = items.length - 1;
    else if (event.key === 'Escape') {
      event.preventDefault();
      closeNoteContextMenu(true);
      return;
    }
    if (nextIndex == null) return;
    event.preventDefault();
    items[nextIndex]?.focus();
  });
  document.body.append(menu);
  noteContextMenu = menu;
  noteContextMenuOwner = owner;
  positionNoteContextMenu(menu, x, y);
  menu.querySelector('.note-context-item:not(:disabled)')?.focus();
}

async function showNoteContextMenu(owner, x, y) {
  closeNoteContextMenu();
  const pageId = owner?.dataset.pageId;
  if (!pageId) return;
  const request = ++noteContextMenuRequest;
  const page = await api('/api/page-info?id=' + encodeURIComponent(pageId));
  if (request !== noteContextMenuRequest) return;

  const menu = document.createElement('div');
  menu.className = 'note-context-menu';
  menu.setAttribute('role', 'menu');
  menu.setAttribute('aria-label', `Действия с заметкой «${page.title || 'без названия'}»`);
  menu.append(noteContextItem('Открыть целиком', async () => {
    if (selectedPageId !== page.id) await openPage(page.id);
    setPageFocusMode(true, page);
  }));
  if (activeSearchQuery || notesListView !== 'structure') {
    menu.append(noteContextItem('Показать в структуре', () => revealPageInTree(page)));
  }

  const folderInfo = page.links?.folder;
  const hasOneNoteOriginal = Boolean(oneNoteClientPageUrl(page)) || /^\{[0-9A-F-]+\}/i.test(String(page.id || ''));
  if (folderInfo || hasOneNoteOriginal) {
    menu.append(noteContextSeparator());
    if (folderInfo) {
      menu.append(
        noteContextItem('Открыть файл', () => openFolderOriginal(page)),
        noteContextItem('Показать в Проводнике', () => openFolderOriginal(page, true))
      );
    } else {
      menu.append(noteContextItem('Открыть в OneNote', () => openOneNoteOriginal(page)));
    }
  }

  menu.append(
    noteContextSeparator(),
    noteContextItem('Синхронизировать заметку', () => {
      if (!syncRunning) return startTargetedSync({ pageId:page.id }, `заметку «${page.title || 'без названия'}»`);
    }, {
      disabled:syncRunning,
      title:syncRunning ? 'Дождитесь завершения текущей синхронизации' : ''
    }),
    noteContextItem('Сведения о заметке', () => showNoteInfo(page))
  );
  mountNoteContextMenu(menu, owner, x, y);
}

async function showHierarchyContextMenu(owner, x, y) {
  closeNoteContextMenu();
  const groupId = owner?.dataset.groupId;
  const sectionId = owner?.dataset.sectionId;
  if (!groupId && !sectionId) return;
  const request = ++noteContextMenuRequest;
  const info = await api(
    (groupId ? '/api/section-group-info?id=' : '/api/section-info?id=')
      + encodeURIComponent(groupId || sectionId)
  );
  if (request !== noteContextMenuRequest) return;

  const menu = document.createElement('div');
  menu.className = 'note-context-menu';
  menu.setAttribute('role', 'menu');
  const kindLabel = info.type === 'group' ? 'папкой' : 'разделом';
  menu.setAttribute('aria-label', `Действия с ${kindLabel} «${info.displayName || 'без названия'}»`);

  if (info.type === 'group') {
    const groupKeys = (info.groupIds || []).map(id => 'g:' + id);
    const sectionKeys = (info.sectionIds || []).map(id => 's:' + id);
    const allKeys = [...groupKeys, ...sectionKeys];
    const allExpanded = allKeys.length > 0 && allKeys.every(key => expanded.has(key));
    const allCollapsed = allKeys.every(key => !expanded.has(key));
    menu.append(
      noteContextItem('Развернуть всё', async () => {
        for (const key of allKeys) expanded.add(key);
        await renderNotesList();
      }, { disabled:allExpanded }),
      noteContextItem('Свернуть всё', async () => {
        for (const key of allKeys) expanded.delete(key);
        await renderNotesList();
      }, { disabled:allCollapsed })
    );
  } else {
    const key = 's:' + info.id;
    const open = expanded.has(key);
    menu.append(noteContextItem(open ? 'Свернуть' : 'Развернуть', async () => {
      if (open) expanded.delete(key); else expanded.add(key);
      await renderNotesList();
    }));
  }

  menu.append(
    noteContextSeparator(),
    noteContextItem(info.type === 'group' ? 'Показать только эту папку' : 'Показать только этот раздел', () => applyNotesScope(info)),
    noteContextItem(info.type === 'group' ? 'Искать в этой папке' : 'Искать в этом разделе', () => applyNotesScope(info, true))
  );

  const hasOriginal = Boolean(info.links?.folderPath || oneNoteClientPageUrl(info));
  if (hasOriginal) {
    menu.append(
      noteContextSeparator(),
      noteContextItem(info.links?.folderPath ? 'Открыть в Проводнике' : 'Открыть в OneNote', () => openHierarchyOriginal(info))
    );
  }

  menu.append(
    noteContextSeparator(),
    noteContextItem(info.type === 'group' ? 'Синхронизировать содержимое' : 'Синхронизировать раздел', () => {
      if (syncRunning) return;
      return startTargetedSync(
        info.type === 'group' ? { sectionGroupId:info.id } : { sectionId:info.id },
        `${info.type === 'group' ? 'папку' : 'раздел'} «${info.displayName || 'без названия'}»`
      );
    }, {
      disabled:syncRunning,
      title:syncRunning ? 'Дождитесь завершения текущей синхронизации' : ''
    }),
    noteContextItem(info.type === 'group' ? 'Сведения о папке' : 'Сведения о разделе', () => showHierarchyInfo(info))
  );
  mountNoteContextMenu(menu, owner, x, y);
}

tree.addEventListener('contextmenu', event => {
  const owner = event.target.closest('.tree-row[data-page-id], .tree-row[data-group-id], .tree-row[data-section-id]');
  if (!owner || !tree.contains(owner)) return;
  event.preventDefault();
  const showMenu = owner.dataset.pageId ? showNoteContextMenu : showHierarchyContextMenu;
  showMenu(owner, event.clientX, event.clientY).catch(showError);
});

tree.addEventListener('keydown', event => {
  if (event.key !== 'ContextMenu' && !(event.shiftKey && event.key === 'F10')) return;
  const owner = event.target.closest('.tree-row[data-page-id], .tree-row[data-group-id], .tree-row[data-section-id]');
  if (!owner) return;
  event.preventDefault();
  const bounds = owner.getBoundingClientRect();
  const showMenu = owner.dataset.pageId ? showNoteContextMenu : showHierarchyContextMenu;
  showMenu(owner, bounds.left + 24, bounds.top + Math.min(bounds.height, 24)).catch(showError);
});

document.addEventListener('pointerdown', event => {
  if (noteContextMenu && !noteContextMenu.contains(event.target)) closeNoteContextMenu();
}, true);
window.addEventListener('blur', () => closeNoteContextMenu());
window.addEventListener('resize', () => closeNoteContextMenu());
tree.addEventListener('scroll', () => closeNoteContextMenu(), { passive:true });

function groupedSearchResults(results) {
  const notebooks = new Map();
  for (const page of results) {
    const notebookKey = page.notebookId || page.notebook || '';
    if (!notebooks.has(notebookKey)) {
      notebooks.set(notebookKey, {
        id:notebookKey,
        name:page.notebook || '(без коллекции)',
        count:0,
        sections:new Map()
      });
    }
    const notebook = notebooks.get(notebookKey);
    notebook.count += 1;
    const sectionKey = page.section || '';
    if (!notebook.sections.has(sectionKey)) {
      notebook.sections.set(sectionKey, {
        name:page.section || '(без раздела)',
        pages:[]
      });
    }
    notebook.sections.get(sectionKey).pages.push(page);
  }
  return [...notebooks.values()];
}

function searchResultParagraphIndexes(page) {
  return Array.isArray(page.paragraphIndexes)
    ? page.paragraphIndexes.filter(Number.isInteger)
    : (Number.isInteger(page.paragraphIndex) ? [page.paragraphIndex] : []);
}

function searchResultBibleOccurrences(page) {
  return Array.isArray(page?.bibleOccurrences)
    ? page.bibleOccurrences.filter(occurrence => Number.isInteger(occurrence?.paragraphIndex))
    : [];
}

function searchResultCountLabel(value) {
  const count = Number(value) || 0;
  const mod100 = Math.abs(count) % 100;
  const mod10 = mod100 % 10;
  const noun = mod100 >= 11 && mod100 <= 19
    ? 'заметок'
    : (mod10 === 1 ? 'заметка' : (mod10 >= 2 && mod10 <= 4 ? 'заметки' : 'заметок'));
  return count + ' ' + noun;
}

function bibleSearchResultCountLabel(value) {
  const count = Number(value) || 0;
  const mod100 = Math.abs(count) % 100;
  const mod10 = mod100 % 10;
  const noun = mod100 >= 11 && mod100 <= 19
    ? 'стихов'
    : (mod10 === 1 ? 'стих' : (mod10 >= 2 && mod10 <= 4 ? 'стиха' : 'стихов'));
  return count + ' ' + noun;
}

function searchWeightLabel(value) {
  const numericWeight = Number(value || 0);
  return 'вес ' + numericWeight.toFixed(4).replace(/\.?0+$/, '');
}

function searchRelevanceLabel(value) {
  const percent = Math.max(0, Math.min(100, Math.round(Number(value || 0) * 100)));
  return 'соответствие ' + percent + '%';
}

function searchResultWeightValue(result) {
  const searchWeight = Number(result?.searchWeight ?? result?.weight);
  if (Number.isFinite(searchWeight)) return searchWeight;
  const bibleWeight = Number(result?.bibleWeight);
  return Number.isFinite(bibleWeight) ? bibleWeight : undefined;
}

function searchResultWeightLabel(result) {
  const searchWeight = Number(result?.searchWeight ?? result?.weight);
  if (Number.isFinite(searchWeight)) return searchRelevanceLabel(searchWeight);
  return result?.bibleWeight != null ? searchWeightLabel(result.bibleWeight) : '';
}

function highlightExistingSearchText(root, query) {
  if (!root) return [];
  for (const mark of [...root.querySelectorAll('mark:not(.page-find-match)')]) {
    const parent = mark.parentNode;
    mark.replaceWith(document.createTextNode(mark.textContent || ''));
    parent?.normalize();
  }
  if (!query) return [];
  const nodes = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      if (!node.nodeValue || !parent || parent.closest('script,style,noscript,textarea,input,select,option,button,.match-nav,mark')) {
        return NodeFilter.FILTER_REJECT;
      }
      return NodeFilter.FILTER_ACCEPT;
    }
  });
  while (walker.nextNode()) nodes.push(walker.currentNode);
  const matches = [];
  for (const node of nodes) {
    const fragment = document.createDocumentFragment();
    const nodeMatches = appendHighlightedText(fragment, node.nodeValue || '', query);
    if (nodeMatches.length === 0) continue;
    matches.push(...nodeMatches);
    node.replaceWith(fragment);
  }
  return matches;
}

function titleBibleParagraphIndexes(paragraphs, pageTitle) {
  const normalizedTitle = String(pageTitle || '').replace(/\s+/g, ' ').trim();
  if (!normalizedTitle || !Array.isArray(paragraphs)) return [];
  return paragraphs.filter(paragraph =>
    Number.isInteger(paragraph?.index)
    && String(paragraph?.text || '').replace(/\s+/g, ' ').trim() === normalizedTitle
  ).map(paragraph => paragraph.index);
}

function canonicalPageTargetIndexes(paragraphIndexes, titleParagraphIndexes) {
  const titleIndexes = new Set(titleParagraphIndexes);
  const canonicalTitleIndex = titleParagraphIndexes[0];
  const canonicalIndexes = [];
  for (const paragraphIndex of Array.isArray(paragraphIndexes) ? paragraphIndexes : []) {
    if (!Number.isInteger(paragraphIndex)) continue;
    const canonicalIndex = titleIndexes.has(paragraphIndex) ? canonicalTitleIndex : paragraphIndex;
    if (Number.isInteger(canonicalIndex) && !canonicalIndexes.includes(canonicalIndex)) {
      canonicalIndexes.push(canonicalIndex);
    }
  }
  if (canonicalIndexes.includes(canonicalTitleIndex)) {
    return [canonicalTitleIndex, ...canonicalIndexes.filter(index => index !== canonicalTitleIndex)];
  }
  return canonicalIndexes;
}

function canonicalPageBibleOccurrences(occurrences, titleParagraphIndexes) {
  const titleIndexes = new Set(titleParagraphIndexes);
  const canonicalTitleIndex = titleParagraphIndexes[0];
  const result = [];
  for (const occurrence of Array.isArray(occurrences) ? occurrences : []) {
    if (!Number.isInteger(occurrence?.paragraphIndex)) continue;
    const paragraphIndex = titleIndexes.has(occurrence.paragraphIndex)
      ? canonicalTitleIndex
      : occurrence.paragraphIndex;
    const canonical = { ...occurrence, paragraphIndex };
    const key = bibleOccurrenceKey(canonical);
    if (!key || result.some(current => bibleOccurrenceKey(current) === key)) continue;
    result.push(canonical);
  }
  return result;
}

function pageNavigationTargets(paragraphTargets, paragraphIndexes, bibleOccurrences = [], inlineRoot) {
  const targetByParagraphIndex = new Map();
  for (const target of paragraphTargets) {
    const paragraphIndex = Number(target.dataset?.paragraphIndex);
    if (Number.isInteger(paragraphIndex) && !targetByParagraphIndex.has(paragraphIndex)) {
      targetByParagraphIndex.set(paragraphIndex, target);
    }
  }
  if (Array.isArray(bibleOccurrences) && bibleOccurrences.length > 0 && inlineRoot) {
    return bibleOccurrences.map(occurrence => {
      const key = bibleOccurrenceKey(occurrence);
      const inlineTarget = key
        ? inlineRoot.querySelector('[data-bible-occurrence="' + CSS.escape(key) + '"]')
        : null;
      if (inlineTarget) {
        inlineTarget.dataset.paragraphIndex = String(occurrence.paragraphIndex);
        return inlineTarget;
      }
      return targetByParagraphIndex.get(occurrence.paragraphIndex) || (() => {
        const virtualTarget = document.createElement('span');
        virtualTarget.className = 'bible-paragraph-target';
        virtualTarget.dataset.paragraphIndex = String(occurrence.paragraphIndex);
        return virtualTarget;
      })();
    });
  }
  return paragraphIndexes.map(paragraphIndex => {
    const existingTarget = targetByParagraphIndex.get(paragraphIndex);
    if (existingTarget) return existingTarget;
    const virtualTarget = document.createElement('span');
    virtualTarget.className = 'bible-paragraph-target';
    virtualTarget.dataset.paragraphIndex = String(paragraphIndex);
    return virtualTarget;
  });
}

function updateOpenPageSearchMatches(result, query) {
  if (!selectedPageId) return;
  const article = content.querySelector('.page[data-page-id="' + CSS.escape(selectedPageId) + '"]');
  if (!article || typeof article.updateSearchMatches !== 'function') return;
  article.updateSearchMatches({
    paragraphIndexes:result ? searchResultParagraphIndexes(result) : [],
    bibleOccurrences:result ? searchResultBibleOccurrences(result) : [],
    query,
    bibleResult:Boolean(result?.bibleRef),
    scrollToFirst:Boolean(query)
  });
}

function makeSearchResultGroup(button) {
  const group = document.createElement('div');
  group.className = 'search-result-group';
  const children = document.createElement('div');
  children.className = 'search-result-children';
  children.setAttribute('role', 'group');
  button.setAttribute('aria-expanded', 'true');
  button.addEventListener('click', () => {
    const open = button.getAttribute('aria-expanded') !== 'false';
    button.setAttribute('aria-expanded', String(!open));
    children.hidden = open;
    const chevron = button.querySelector('.chevron');
    if (chevron) chevron.textContent = open ? '▸' : '▾';
    requestAnimationFrame(() => updateTreeScrollbar?.());
  });
  group.append(button, children);
  return { group, children };
}

function renderWeightedSearchResults(results) {
  for (const page of results) {
    const paragraphIndexes = searchResultParagraphIndexes(page);
    const sourceType = sourceTypeForNotebook(page.notebookId);
    const button = document.createElement('button');
    button.className = 'tree-row page-row search-weight-row' + (page.id === selectedPageId ? ' selected' : '');
    button.type = 'button';
    button.dataset.pageId = page.id;
    button.title = [page.notebook, page.section, page.snippet].filter(Boolean).join(' / ');
    button.addEventListener('click', () => openPage(page.id, {
      paragraphIndex:paragraphIndexes[0],
      paragraphIndexes,
      bibleOccurrences:searchResultBibleOccurrences(page),
      highlightQuery:page.bibleRef ? '' : activeSearchQuery
    }));

    const typeIcons = document.createElement('span');
    typeIcons.className = 'search-weight-type-icons';
    typeIcons.append(sourceTypeIcon(sourceType));
    const documentIcon = fileTypeIcon(page.fileExtension, sourceType);
    if (documentIcon) typeIcons.append(documentIcon);

    const main = document.createElement('span');
    main.className = 'search-weight-main';
    const title = document.createElement('div');
    title.className = 'search-weight-title';
    title.textContent = page.title || '(без названия)';
    const meta = document.createElement('div');
    meta.className = 'search-weight-meta';
    meta.textContent = [page.notebook, page.section].filter(Boolean).join(' / ');
    main.append(title, meta);
    if (page.snippet) {
      const snippet = document.createElement('div');
      snippet.className = 'search-weight-snippet';
      snippet.textContent = page.snippet;
      main.append(snippet);
    }

    const weight = document.createElement('span');
    weight.className = 'search-weight-value';
    weight.textContent = searchResultWeightLabel(page);
    button.append(typeIcons, main, weight);
    tree.append(button);
  }
}

function compareSearchResultsByWeight(left, right) {
  const weightCompare = Number(searchResultWeightValue(right) ?? Number.NEGATIVE_INFINITY)
    - Number(searchResultWeightValue(left) ?? Number.NEGATIVE_INFINITY);
  if (weightCompare !== 0) return weightCompare;
  return Number(left.bibleMatchScore ?? 1000) - Number(right.bibleMatchScore ?? 1000);
}

function addSearchViewSwitch(heading, query, results, bibleResults, hasSelectedNotebooks) {
  heading.classList.add('with-view-switch');
  heading.replaceChildren();
  const label = document.createElement('span');
  label.textContent = 'Результаты поиска';
  const controls = document.createElement('span');
  controls.className = 'search-view-switch';
  controls.setAttribute('role', 'group');
  controls.setAttribute('aria-label', 'Порядок результатов поиска');
  for (const option of [
    { value:'structure', label:'Структура' },
    { value:'weight', label:'Вес' }
  ]) {
    const button = document.createElement('button');
    button.className = 'search-view-button' + (searchResultsView === option.value ? ' active' : '');
    button.type = 'button';
    button.textContent = option.label;
    button.setAttribute('aria-pressed', String(searchResultsView === option.value));
    button.addEventListener('click', () => {
      if (searchResultsView === option.value) return;
      searchResultsView = option.value;
      treeRenderToken += 1;
      renderSearchResults(query, results, bibleResults, hasSelectedNotebooks);
    });
    controls.append(button);
  }
  heading.append(label, controls);
}

function bibleTextSearchResultButton(result, level, showWeight) {
  const label = [result.reference, result.text].filter(Boolean).join(' — ');
  const button = row(label, level, {
    search:true,
    count:showWeight ? searchResultWeightLabel(result) : undefined,
    title:label
  });
  button.classList.add('bible-text-search-row');
  button.onclick = () => openBibleReaderLocation({
    module:result.module || currentBibleModule(),
    bookIndex:Number(result.bookIndex),
    chapter:Number(result.chapter),
    verse:Number(result.verse),
    topChapter:Number(result.chapter),
    topVerse:Number(result.topVerse || result.verse)
  });
  return button;
}

function renderBibleTextSearchResults(results, byWeight = false) {
  if (!results.length) return;
  const first = results[0];
  const rootRow = row(['Библия', first.moduleName || first.module].filter(Boolean).join(' · '), 0, {
    expandable:true,
    open:true,
    search:true,
    count:bibleSearchResultCountLabel(results.length),
    title:'Совпадения в тексте выбранного перевода Библии'
  });
  const rootGroup = makeSearchResultGroup(rootRow);
  if (byWeight) {
    for (const result of [...results].sort(compareSearchResultsByWeight)) {
      rootGroup.children.append(bibleTextSearchResultButton(result, 1, true));
    }
    tree.append(rootGroup.group);
    return;
  }
  const books = new Map();
  for (const result of results) {
    const key = String(result.bookIndex);
    if (!books.has(key)) books.set(key, {
      name:result.bookName || result.bookShortName || 'Книга ' + result.bookIndex,
      results:[]
    });
    books.get(key).results.push(result);
  }
  for (const book of books.values()) {
    const bookRow = row(book.name, 1, {
      expandable:true,
      open:true,
      folder:true,
      search:true,
      count:bibleSearchResultCountLabel(book.results.length),
      title:book.name
    });
    const bookGroup = makeSearchResultGroup(bookRow);
    for (const result of book.results) {
      bookGroup.children.append(bibleTextSearchResultButton(result, 2, false));
    }
    rootGroup.children.append(bookGroup.group);
  }
  tree.append(rootGroup.group);
}

function renderSearchResults(query, results, bibleResults = [], hasSelectedNotebooks = true) {
  tree.replaceChildren();
  const heading = document.createElement('div');
  heading.className = 'search-heading';
  heading.textContent = 'Результаты поиска';
  tree.append(heading);
  if (!results.length && !bibleResults.length) {
    const empty = document.createElement('div');
    empty.className = 'search-heading';
    empty.textContent = 'Ничего не найдено';
    tree.append(empty);
  }
  if (!hasSelectedNotebooks) {
    const notesUnavailable = document.createElement('div');
    notesUnavailable.className = 'search-heading';
    notesUnavailable.textContent = 'Для поиска по заметкам выберите коллекции';
    tree.append(notesUnavailable);
  }
  const weightedAvailable = results.some(page => searchResultWeightValue(page) != null)
    || bibleResults.some(result => searchResultWeightValue(result) != null);
  if (weightedAvailable) addSearchViewSwitch(heading, query, results, bibleResults, hasSelectedNotebooks);
  if (weightedAvailable && searchResultsView === 'weight') {
    renderBibleTextSearchResults(bibleResults, true);
    renderWeightedSearchResults([...results].sort(compareSearchResultsByWeight));
  } else {
    renderBibleTextSearchResults(bibleResults);
    for (const notebook of groupedSearchResults(results)) {
    const sourceType = sourceTypeForNotebook(notebook.id);
    const notebookRow = row(notebook.name, 0, {
      expandable:true,
      open:true,
      source:true,
      sourceType,
      search:true,
      count:searchResultCountLabel(notebook.count),
      title:notebook.name
    });
    const notebookGroup = makeSearchResultGroup(notebookRow);
    for (const section of notebook.sections.values()) {
      const sectionRow = row(section.name, 1, {
        expandable:true,
        open:true,
        folder:true,
        search:true,
        count:searchResultCountLabel(section.pages.length),
        title:[notebook.name, section.name].filter(Boolean).join(' / ')
      });
      const sectionGroup = makeSearchResultGroup(sectionRow);
      for (const page of section.pages) {
        const button = row(page.title, 2, {
          page:true,
          fileExtension:page.fileExtension,
          sourceType,
          selected:page.id === selectedPageId,
          search:true,
          count:searchResultWeightLabel(page) || undefined,
          title:[page.notebook, page.section, page.snippet].filter(Boolean).join(' / ')
        });
        const paragraphIndexes = searchResultParagraphIndexes(page);
        button.dataset.pageId = page.id;
        button.onclick = () => openPage(page.id, {
          paragraphIndex:paragraphIndexes[0],
          paragraphIndexes,
          bibleOccurrences:searchResultBibleOccurrences(page),
          highlightQuery:page.bibleRef ? '' : activeSearchQuery
        });
        sectionGroup.children.append(button);
      }
      notebookGroup.children.append(sectionGroup.group);
    }
    tree.append(notebookGroup.group);
  }
  }
  updateOpenPageSearchMatches(results.find(page => page.id === selectedPageId), query);
  updateTreeSelection(selectedPageId);
  requestAnimationFrame(() => {
    updateTreeScrollbar();
    scrollTreeSelectionIntoView('auto');
  });
}

async function renderSearch(query) {
  activeSearchAbortController?.abort();
  const searchAbortController = new AbortController();
  activeSearchAbortController = searchAbortController;
  const renderToken = ++treeRenderToken;
  activeSearchQuery = query;
  updateNotesListViewControls();
  tree.replaceChildren();
  if (notesScope) tree.append(notesScopeBanner());
  const heading = document.createElement('div');
  heading.className = 'search-heading';
  heading.textContent = notesScope
    ? `Результаты в ${notesScope.type === 'group' ? 'папке' : 'разделе'} «${notesScope.displayName}»`
    : 'Результаты поиска';
  const loading = document.createElement('div');
  loading.className = 'search-loading';
  loading.setAttribute('role', 'status');
  loading.setAttribute('aria-live', 'polite');
  const loadingSpinner = document.createElement('span');
  loadingSpinner.className = 'search-loading-spinner';
  loadingSpinner.setAttribute('aria-hidden', 'true');
  const loadingLabel = document.createElement('span');
  loadingLabel.textContent = 'Идёт поиск…';
  loading.append(loadingSpinner, loadingLabel);
  tree.append(heading, loading);
  const selectedIds = selectedNotebookIds();
  const request = searchRequest(query);
  const params = new URLSearchParams({
    q:request.query,
    mode:request.mode,
    caseSensitive:String(request.caseSensitive),
    view:searchResultsView
  });
  addBibleDisplayParams(params);
  for (const notebookId of selectedIds) params.append('notebookId', notebookId);
  if (notesScope) {
    params.set(notesScope.type === 'group' ? 'sectionGroupId' : 'sectionId', notesScope.id);
  }
  const bibleParams = new URLSearchParams({
    q:request.query,
    module:bibleReaderModuleEl.value || currentBibleModule(),
    mode:request.mode,
    caseSensitive:String(request.caseSensitive),
    limit:'80'
  });
  let results;
  let bibleResults;
  try {
    [results, bibleResults] = await Promise.all([
      selectedIds.length > 0
        ? api('/api/search?' + params.toString(), { signal:searchAbortController.signal })
        : Promise.resolve([]),
      notesScope
        ? Promise.resolve([])
        : api('/api/bible/text-search?' + bibleParams.toString(), {
            timeoutMs:60000,
            signal:searchAbortController.signal
          }).catch(error => {
            if (searchAbortController.signal.aborted) return [];
            console.warn('Bible text search is unavailable:', error);
            return [];
          })
    ]);
  } catch (error) {
    if (searchAbortController.signal.aborted || renderToken !== treeRenderToken) return;
    loading.remove();
    throw error;
  } finally {
    if (activeSearchAbortController === searchAbortController) {
      activeSearchAbortController = undefined;
    }
  }
  if (renderToken !== treeRenderToken) return;
  renderSearchResults(query, results, bibleResults, selectedIds.length > 0);
}

function scrollToTargetParagraph(paragraphIndex, behavior = 'smooth') {
  if (!Number.isInteger(paragraphIndex)) return;
  let attempts = 0;
  const run = () => {
    const target = document.getElementById('paragraph-' + paragraphIndex);
    if (target && target.getClientRects().length > 0) {
      target.scrollIntoView({ block:'center', behavior });
      const targetRect = target.getBoundingClientRect();
      const contentRect = content.getBoundingClientRect();
      const targetCenter = targetRect.top + targetRect.height / 2;
      const contentCenter = contentRect.top + contentRect.height / 2;
      content.scrollTop += targetCenter - contentCenter;
      return;
    }
    attempts += 1;
    if (attempts <= 10) setTimeout(run, 80);
  };
  requestAnimationFrame(run);
}

function updateHtmlMatchNavigationPresentation(matchNav, showingHtml, htmlFrame, isPdfPage) {
  if (!matchNav) return false;
  const shouldOverlay = Boolean(showingHtml && htmlFrame);
  matchNav.classList.toggle('html-match-nav-overlay', shouldOverlay);
  matchNav.classList.toggle('pdf-match-nav-overlay', shouldOverlay && isPdfPage);
  return shouldOverlay;
}

function scrollHtmlFrameToTargetParagraph(frame, paragraphIndex, targetIndex, forceTarget = false) {
  if (!Number.isInteger(paragraphIndex) || !frame) return;
  frame.scrollIntoView({ block:'nearest' });
  const post = () => frame.contentWindow?.postMessage({
    type:'onenote-scroll-target-paragraph',
    paragraphIndex,
    targetIndex:Number.isInteger(targetIndex) ? targetIndex : undefined,
    forceTarget
  }, '*');
  requestAnimationFrame(() => {
    post();
    setTimeout(post, 120);
    setTimeout(post, 360);
  });
}

function pageSearchHighlightPattern(query) {
  if (!query) return undefined;
  const request = searchRequest(query);
  let source;
  if (request.mode === 'regex') {
    source = request.query;
  } else if (request.mode === 'phrase') {
    const terms = request.query.match(/[\p{L}\p{N}_]+/gu) ?? [];
    source = terms.length > 0
      ? `(?<![\\p{L}\\p{N}_])${terms.map(term => term.replace(/[.*+?^\x24{}()|[\]\\]/g, '\\$&')).join('[^\\p{L}\\p{N}_]+')}(?![\\p{L}\\p{N}_])`
      : request.query.replace(/[.*+?^\x24{}()|[\]\\]/g, '\\$&');
  } else {
    const terms = searchHighlightTerms(request);
    if (terms.length === 0) return undefined;
    source = terms.map(term => term.replace(/[.*+?^\x24{}()|[\]\\]/g, '\\$&')).join('|');
  }
  const flags = 'gu' + (request.caseSensitive ? '' : 'i');
  try {
    new RegExp(source, flags);
  } catch {
    return undefined;
  }
  return { source, flags };
}

function htmlFrameMainSearchRequest(query) {
  if (!query) return undefined;
  const request = searchRequest(query);
  return {
    query:request.query,
    mode:request.mode,
    caseSensitive:request.caseSensitive,
    terms:request.mode === 'and' ? searchHighlightTerms(request) : []
  };
}

function htmlFrameMainSearchKey(query) {
  const request = htmlFrameMainSearchRequest(query);
  return request ? JSON.stringify(request) : '';
}

function postHtmlFrameMainSearch(frame, query, index = 0, scroll = true) {
  if (!frame) return;
  const pattern = pageSearchHighlightPattern(query);
  const request = query ? searchRequest(query) : undefined;
  const queries = request
    ? (request.mode === 'phrase' || request.mode === 'regex'
      ? [request.query]
      : searchHighlightTerms(request))
    : [];
  const message = {
    type:'onenote-main-search',
    index,
    scroll
  };
  if (frame.classList.contains('pdf-frame')) {
    Object.assign(message, {
      source:pattern?.source || '',
      flags:pattern?.flags || '',
      queries,
      mode:request?.mode || 'and',
      entireWord:request?.mode === 'and'
    });
  } else {
    message.search = htmlFrameMainSearchRequest(query);
  }
  frame.contentWindow?.postMessage(message, '*');
}

function normalizedPdfAnchor(value, maxLength = 160) {
  const normalized = decodeHtmlText(String(value || ''))
    .replace(/\s+/g, ' ')
    .trim();
  if (normalized.length <= maxLength) return normalized;
  const shortened = normalized.slice(0, maxLength);
  const lastSpace = shortened.lastIndexOf(' ');
  return (lastSpace >= Math.floor(maxLength * 0.65) ? shortened.slice(0, lastSpace) : shortened).trim();
}

function pdfReferenceAnchor(paragraphText, referenceText, maxLength = 180) {
  const paragraph = decodeHtmlText(String(paragraphText || '')).replace(/\s+/g, ' ').trim();
  const reference = normalizedPdfAnchor(referenceText, 120);
  if (!paragraph || !reference) return normalizedPdfAnchor(paragraph, maxLength);
  const referenceIndex = paragraph.toLocaleLowerCase().indexOf(reference.toLocaleLowerCase());
  if (referenceIndex < 0) return normalizedPdfAnchor(paragraph, maxLength);
  const beforeLength = Math.floor((maxLength - reference.length) * 0.48);
  const afterLength = maxLength - reference.length - beforeLength;
  let start = Math.max(0, referenceIndex - beforeLength);
  let end = Math.min(paragraph.length, referenceIndex + reference.length + afterLength);
  if (start > 0) {
    const nextSpace = paragraph.indexOf(' ', start);
    if (nextSpace >= 0 && nextSpace < referenceIndex) start = nextSpace + 1;
  }
  if (end < paragraph.length) {
    const previousSpace = paragraph.lastIndexOf(' ', end);
    if (previousSpace > referenceIndex + reference.length) end = previousSpace;
  }
  return paragraph.slice(start, end).trim();
}

function pdfBibleHref(reference) {
  const target = String(reference?.normalizedRef || reference?.normalized || reference?.originalText || '').trim();
  return target ? 'bnVerse:' + target : '';
}

function normalizedPdfBookLabel(value) {
  return decodeHtmlText(String(value || ''))
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function pdfBibleLinkMatchesTitle(reference, pageTitle) {
  const title = normalizedPdfBookLabel(pageTitle);
  if (!title) return false;
  const normalizedBook = String(reference?.normalizedRef || reference?.normalized || '')
    .replace(/\s+\d+(?::\d+)?(?:\s*[-–—]\s*\d+(?::\d+)?)?\s*$/u, '');
  const candidates = [reference?.bookName, reference?.bookShortName, normalizedBook]
    .map(normalizedPdfBookLabel)
    .filter(value => value.length >= 3);
  const paddedTitle = ' ' + title + ' ';
  return candidates.some(candidate => paddedTitle.includes(' ' + candidate + ' '));
}

function pdfBibleLinkIsEligible(reference, pageTitle) {
  const entryType = String(reference?.entryType || '').trim();
  if (entryType === 'BookChapter' || entryType === 'BookChapterVerse') return true;
  if (entryType === 'Verse') return /^\s*[:：]\s*\d/u.test(String(reference?.originalText || ''))
    && pdfBibleLinkMatchesTitle(reference, pageTitle);
  if (entryType) return pdfBibleLinkMatchesTitle(reference, pageTitle);
  return /\p{L}/u.test(String(reference?.originalText || ''));
}

function pdfPageContext(bibleRefs, paragraphIndexes = [], bibleOccurrences = [], pageTitle = '') {
  const paragraphs = Array.isArray(bibleRefs?.paragraphs) ? bibleRefs.paragraphs : [];
  const paragraphByIndex = new Map(paragraphs.map(paragraph => [Number(paragraph?.index), paragraph]));
  const exactPdfLinks = Array.isArray(bibleRefs?.pdfBibleLinks) ? bibleRefs.pdfBibleLinks : [];
  let bibleLinks;
  if (exactPdfLinks.length > 0) {
    bibleLinks = exactPdfLinks
      .filter(link => link?.text && link?.href && !/^\d+$/u.test(String(link.text).trim()))
      .map(link => ({
        text:normalizedPdfAnchor(link.text, 120),
        href:String(link.href),
        title:String(link.title || link.text),
        pageNumber:Number(link.pageNumber),
        occurrenceIndex:Number(link.occurrenceIndex)
      }));
  } else {
    const bibleLinkCandidates = [];
    for (const paragraph of paragraphs) {
      for (const reference of paragraph.references || []) {
        if (!pdfBibleLinkIsEligible(reference, pageTitle)) continue;
        const text = normalizedPdfAnchor(reference?.originalText, 120);
        const href = pdfBibleHref(reference);
        if (!text || !href) continue;
        bibleLinkCandidates.push({
          text,
          href,
          title:reference.normalizedRef || reference.originalText || text,
          paragraphIndex:Number(paragraph.index),
          contextDependent:!String(reference?.entryType || '').startsWith('Book')
        });
      }
    }
    const hrefsByText = new Map();
    for (const link of bibleLinkCandidates) {
      const key = link.text.toLocaleLowerCase();
      if (!hrefsByText.has(key)) hrefsByText.set(key, new Set());
      hrefsByText.get(key).add(link.href);
    }
    const uniqueBibleLinks = new Map();
    for (const link of bibleLinkCandidates) {
      const textKey = link.text.toLocaleLowerCase();
      if (link.contextDependent && hrefsByText.get(textKey)?.size !== 1) continue;
      const key = textKey + '\u0000' + link.href;
      if (!uniqueBibleLinks.has(key)) {
        const { contextDependent, ...publicLink } = link;
        uniqueBibleLinks.set(key, publicLink);
      }
    }
    bibleLinks = [...uniqueBibleLinks.values()];
  }

  const targets = [];
  const occurrences = Array.isArray(bibleOccurrences) ? bibleOccurrences : [];
  for (const occurrence of occurrences) {
    const paragraph = paragraphByIndex.get(Number(occurrence?.paragraphIndex));
    if (!paragraph) continue;
    const reference = (paragraph.references || []).find(candidate =>
      Number(candidate?.startIndex) === Number(occurrence?.startIndex)
      && Number(candidate?.endIndex) === Number(occurrence?.endIndex)
    );
    const query = normalizedPdfAnchor(reference?.originalText || reference?.normalizedRef, 120);
    const highlightText = pdfReferenceAnchor(paragraph.text, reference?.originalText || query, 180);
    if (!query && !highlightText) continue;
    targets.push({
      paragraphIndex:Number(paragraph.index),
      query:query || highlightText,
      highlightText:highlightText || query
    });
  }
  if (targets.length === 0) {
    for (const paragraphIndex of paragraphIndexes) {
      const paragraph = paragraphByIndex.get(Number(paragraphIndex));
      if (!paragraph) continue;
      const firstReference = (paragraph.references || [])[0];
      const query = normalizedPdfAnchor(firstReference?.originalText || paragraph.text, 120);
      const highlightText = normalizedPdfAnchor(paragraph.text, 180);
      if (!query && !highlightText) continue;
      targets.push({
        paragraphIndex:Number(paragraph.index),
        query:query || highlightText,
        highlightText:highlightText || query
      });
    }
  }
  return { bibleLinks, targets };
}

function postPdfFrameContext(frame, context) {
  if (!frame || !context) return;
  frame.contentWindow?.postMessage({ type:'onenote-pdf-context', ...context }, '*');
}

function viewHistoryKey(entry) {
  return JSON.stringify(entry);
}

let pageViewStateRequestSequence = 0;

function requestPageFrameViewState(frame, timeoutMs = 700) {
  if (!frame?.contentWindow) return Promise.resolve(undefined);
  const requestId = `page-view-${Date.now()}-${++pageViewStateRequestSequence}`;
  return new Promise(resolve => {
    let settled = false;
    const finish = value => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      window.removeEventListener('message', handleMessage);
      resolve(value);
    };
    const handleMessage = event => {
      if (event.source !== frame.contentWindow) return;
      const data = event.data || {};
      if (data.type !== 'onenote-page-view-state' || data.requestId !== requestId) return;
      finish({
        kind:String(data.kind || ''),
        pageNumber:Number.isInteger(Number(data.pageNumber)) ? Number(data.pageNumber) : undefined,
        zoom:Number(data.zoom) > 0 ? Number(data.zoom) : undefined,
        scrollTop:Math.max(0, Number(data.scrollTop) || 0),
        scrollLeft:Math.max(0, Number(data.scrollLeft) || 0)
      });
    };
    const timer = setTimeout(() => finish(undefined), timeoutMs);
    window.addEventListener('message', handleMessage);
    frame.contentWindow.postMessage({ type:'onenote-page-view-state-request', requestId }, '*');
  });
}

async function captureCurrentPageViewHistoryState() {
  const entry = viewHistory[viewHistoryIndex];
  if (!entry || entry.type !== 'page' || !selectedPageId || entry.pageId !== selectedPageId) return;
  const article = selectedPageArticle();
  if (!article) return;
  const frame = article.querySelector('.html-frame');
  const frameVisible = frame && frame.style.display !== 'none';
  const frameViewState = frameVisible ? await requestPageFrameViewState(frame) : undefined;
  viewHistory[viewHistoryIndex] = {
    ...entry,
    contentScrollTop:Math.max(0, Number(content.scrollTop) || 0),
    pageZoom:articlePageZoom(article),
    visualView:article.classList.contains('html-view-active'),
    ...(frameViewState ? { frameViewState } : {})
  };
}

function restorePageFrameViewState(frame, state) {
  if (!frame?.contentWindow || !state) return;
  const restore = () => frame.contentWindow?.postMessage({
    type:'onenote-page-view-state-restore',
    state
  }, '*');
  requestAnimationFrame(restore);
  setTimeout(restore, 120);
  setTimeout(restore, 360);
}

function restorePageContentScroll(scrollTop) {
  if (!Number.isFinite(Number(scrollTop))) return;
  const value = Math.max(0, Number(scrollTop));
  requestAnimationFrame(() => { content.scrollTop = value; });
}

function viewHistoryAvailability() {
  return {
    back:viewHistoryIndex > 0,
    forward:viewHistoryIndex >= 0 && viewHistoryIndex < viewHistory.length - 1
  };
}

function setViewHistoryButtonState(button, enabled) {
  button.disabled = !enabled;
  button.setAttribute('aria-disabled', String(!enabled));
}

function updateViewHistoryButtons() {
  const state = viewHistoryAvailability();
  document.querySelectorAll('.view-history-back').forEach(button => setViewHistoryButtonState(button, state.back));
  document.querySelectorAll('.view-history-forward').forEach(button => setViewHistoryButtonState(button, state.forward));
}

function rememberViewHistory(entry) {
  if (!entry || navigatingViewHistory) {
    updateViewHistoryButtons();
    return;
  }
  if (viewHistoryIndex >= 0 && viewHistoryKey(viewHistory[viewHistoryIndex]) === viewHistoryKey(entry)) {
    updateViewHistoryButtons();
    return;
  }
  viewHistory = viewHistory.slice(0, viewHistoryIndex + 1);
  viewHistory.push(entry);
  if (viewHistory.length > 120) viewHistory.shift();
  viewHistoryIndex = viewHistory.length - 1;
  updateViewHistoryButtons();
}

function createViewHistoryButtons() {
  const state = viewHistoryAvailability();
  const back = document.createElement('button');
  back.className = 'title-tool view-history-back';
  back.type = 'button';
  back.textContent = '‹';
  back.title = 'Назад';
  back.setAttribute('aria-label', 'Назад');
  setViewHistoryButtonState(back, state.back);
  back.addEventListener('click', () => navigateViewHistory(-1).catch(showError));
  const forward = document.createElement('button');
  forward.className = 'title-tool view-history-forward';
  forward.type = 'button';
  forward.textContent = '›';
  forward.title = 'Вперёд';
  forward.setAttribute('aria-label', 'Вперёд');
  setViewHistoryButtonState(forward, state.forward);
  forward.addEventListener('click', () => navigateViewHistory(1).catch(showError));
  const fragment = document.createDocumentFragment();
  fragment.append(back, forward);
  return fragment;
}

function closePageFocusMenu() {
  pageFocusMenu.hidden = true;
  pageFocusMenuButton.setAttribute('aria-expanded', 'false');
}

function renderPageFocusMenu() {
  pageFocusMenu.replaceChildren();
  for (const page of pageFocusPages) {
    const button = document.createElement('button');
    button.className = 'page-focus-menu-item' + (page.id === selectedPageId ? ' selected' : '');
    button.type = 'button';
    button.setAttribute('role', 'menuitem');
    button.style.setProperty('--page-level', String(Math.max(0, Math.min(12, Number(page.pageLevel) || 0))));
    button.textContent = page.title || '(без названия)';
    button.title = button.textContent;
    button.addEventListener('click', () => {
      closePageFocusMenu();
      openPage(page.id).catch(showError);
    });
    pageFocusMenu.append(button);
  }
}

function setPageFocusNavigationState() {
  const hasPrevious = pageFocusPageIndex > 0;
  const hasNext = pageFocusPageIndex >= 0 && pageFocusPageIndex < pageFocusPages.length - 1;
  pageFocusPreviousButton.disabled = !hasPrevious;
  pageFocusNextButton.disabled = !hasNext;
  pageFocusPreviousButton.setAttribute('aria-disabled', String(!hasPrevious));
  pageFocusNextButton.setAttribute('aria-disabled', String(!hasNext));
}

function syncPageFocusTitleSearchState(title) {
  const mirrorsVisibleTitle = pageFocusMode && title;
  pageFocusTitle.classList.toggle(
    'bible-paragraph-target',
    Boolean(mirrorsVisibleTitle && title.classList.contains('bible-paragraph-target'))
  );
  pageFocusTitle.classList.toggle(
    'current-match',
    Boolean(mirrorsVisibleTitle && title.classList.contains('current-match'))
  );
}

function clampPageZoom(percent) {
  return Math.max(50, Math.min(300, Math.round(Number(percent) || 100)));
}

function selectedPageArticle() {
  if (!selectedPageId) return null;
  return content.querySelector('.page[data-page-id="' + CSS.escape(selectedPageId) + '"]');
}

function articlePageZoom(article) {
  return clampPageZoom(article?.dataset.pageZoom || defaultHtmlZoom());
}

function syncPageFocusZoom(article = selectedPageArticle()) {
  const percent = articlePageZoom(article);
  pageFocusZoomRange.value = String(percent);
  pageFocusZoomValue.value = percent + '%';
  pageFocusZoomValue.textContent = pageFocusZoomValue.value;
}

function setArticlePageZoom(article, percent, options = {}) {
  if (!article) return 100;
  const nextPercent = clampPageZoom(percent);
  article.dataset.pageZoom = String(nextPercent);
  const text = article.querySelector('.page-text');
  if (text) text.style.zoom = String(nextPercent / 100);
  const localRange = article.querySelector('.html-zoom input');
  const localValue = article.querySelector('.html-zoom-value');
  if (localRange) localRange.value = String(nextPercent);
  if (localValue) localValue.textContent = nextPercent + '%';
  if (options.postFrame !== false) postHtmlFrameZoom(article.querySelector('.html-frame'), nextPercent);
  if (pageFocusMode && article.dataset.pageId === selectedPageId) syncPageFocusZoom(article);
  return nextPercent;
}

function postPageFocusModeToFrame(article = selectedPageArticle()) {
  article?.querySelector('.html-frame')?.contentWindow?.postMessage({
    type:'onenote-page-focus-mode',
    enabled:pageFocusMode
  }, '*');
}

function wheelDeltaPixels(event) {
  if (event.deltaMode === 1) return event.deltaY * 16;
  if (event.deltaMode === 2) return event.deltaY * innerHeight;
  return event.deltaY;
}

function zoomArticleFromWheel(article, event) {
  const delta = wheelDeltaPixels(event);
  if (!delta) return;
  setArticlePageZoom(article, articlePageZoom(article) * Math.exp(-delta * 0.0025));
}

async function updatePageFocusNavigation(page) {
  if (!pageFocusMode || !page?.id) return;
  const pageTitle = page.title || '(без названия)';
  const pagePath = pagePathLabel(page);
  pageFocusTitle.textContent = pageTitle;
  pageFocusTitle.classList.remove('bible-paragraph-target', 'current-match');
  pageFocusPath.textContent = pagePath;
  pageFocusPath.hidden = !pagePath;
  pageFocusLabel.title = [pageTitle, pagePath].filter(Boolean).join(' — ');
  pageFocusPages = [];
  pageFocusPageIndex = -1;
  setPageFocusNavigationState();

  const sectionId = page.parentSection?.id;
  if (!sectionId) {
    renderPageFocusMenu();
    return;
  }
  const pages = await api('/api/pages?sectionId=' + encodeURIComponent(sectionId));
  if (!pageFocusMode || selectedPageId !== page.id) return;
  pages.sort(compareOneNotePageOrder);
  pageFocusPages = pages;
  pageFocusPageIndex = pages.findIndex(item => item.id === page.id);
  renderPageFocusMenu();
  setPageFocusNavigationState();
}

function setPageFocusMode(enabled, page) {
  pageFocusMode = Boolean(enabled);
  document.documentElement.classList.toggle('page-focus-mode', pageFocusMode);
  pageFocusToolbar.hidden = !pageFocusMode;
  pageFocusZoom.hidden = !pageFocusMode;
  syncPageFocusZoom();
  postPageFocusModeToFrame();
  closePageFocusMenu();
  if (pageFocusMode && page) {
    updatePageFocusNavigation(page).catch(showError);
    syncPageFocusTitleSearchState(
      content.querySelector('.page[data-page-id="' + CSS.escape(page.id) + '"] .page-heading > h2')
    );
  } else if (!pageFocusMode) {
    pageFocusPages = [];
    pageFocusPageIndex = -1;
    syncPageFocusTitleSearchState();
  }
  requestAnimationFrame(() => {
    updateContentScrollbar?.();
    if (pageFocusMode && pageFindWidget.classList.contains('hidden')) {
      pageFocusMenuButton.focus({ preventScroll:true });
    }
  });
}

async function navigatePageFocus(step) {
  const nextIndex = pageFocusPageIndex + step;
  const page = pageFocusPages[nextIndex];
  if (!page) return;
  closePageFocusMenu();
  await openPage(page.id);
}

function createPageFocusButton(page) {
  const button = document.createElement('button');
  button.className = 'title-tool title-focus';
  button.type = 'button';
  button.title = 'Открыть страницу целиком';
  button.setAttribute('aria-label', 'Открыть страницу «' + (page.title || 'без названия') + '» целиком');
  button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5"/><path d="m3 8 6-6M21 8l-6-6M3 16l6 6M21 16l-6 6"/></svg>';
  button.addEventListener('click', () => setPageFocusMode(true, page));
  return button;
}

function oneNoteClientPageUrl(page) {
  const clientLink = page?.links?.oneNoteClientUrl;
  const target = typeof clientLink === 'string' ? clientLink : clientLink?.href;
  return typeof target === 'string' && /^onenote:/i.test(target) ? target : '';
}

function updateOneNoteOpenButtons() {
  document.querySelectorAll('.title-open-onenote').forEach(button => {
    button.hidden = !oneNoteIntegrationEnabled;
  });
}

function createOpenInOneNoteButton(page) {
  const target = oneNoteClientPageUrl(page);
  const localPageId = /^\{[0-9A-F-]+\}/i.test(String(page?.id || '')) ? page.id : '';
  if (!target && !localPageId) return undefined;
  const button = document.createElement('button');
  button.className = 'title-tool title-open-onenote';
  button.type = 'button';
  button.hidden = !oneNoteIntegrationEnabled;
  button.title = 'Открыть в OneNote';
  button.setAttribute('aria-label', 'Открыть страницу «' + (page.title || 'без названия') + '» в OneNote');
  button.innerHTML = '<svg class="onenote-logo" viewBox="0 0 24 24" aria-hidden="true">'
    + '<path class="onenote-page-back" d="M9 4h9.5A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5H9z"/>'
    + '<path class="onenote-page-front" d="M9 7h7.5A1.5 1.5 0 0 1 18 8.5v8a1.5 1.5 0 0 1-1.5 1.5H9z"/>'
    + '<rect class="onenote-tile" x="3" y="5.5" width="11" height="13" rx="1.4"/>'
    + '<path class="onenote-letter" d="M5.7 15.5v-7h1.8l3 4.6V8.5h1.7v7h-1.8l-3-4.6v4.6z"/>'
    + '</svg>';
  button.addEventListener('click', async () => {
    button.disabled = true;
    try {
      await api('/api/system/open-onenote-page', {
        method:'POST',
        headers:{ 'Content-Type':'application/json' },
        body:JSON.stringify({ url:target, pageId:localPageId })
      });
    } catch (error) {
      showActivity('Не удалось открыть страницу в OneNote: ' + (error?.message || String(error)), 'error');
    } finally {
      button.disabled = false;
    }
  });
  return button;
}

pageFocusMenuButton.addEventListener('click', () => {
  const willOpen = pageFocusMenu.hidden;
  pageFocusMenu.hidden = !willOpen;
  pageFocusMenuButton.setAttribute('aria-expanded', String(willOpen));
  if (willOpen) pageFocusMenu.querySelector('.selected')?.scrollIntoView({ block:'nearest' });
});
pageFocusPreviousButton.addEventListener('click', () => navigatePageFocus(-1).catch(showError));
pageFocusNextButton.addEventListener('click', () => navigatePageFocus(1).catch(showError));
pageFocusExitButton.addEventListener('click', () => setPageFocusMode(false));
pageFocusZoomRange.addEventListener('input', () => {
  setArticlePageZoom(selectedPageArticle(), Number(pageFocusZoomRange.value));
});
window.addEventListener('wheel', event => {
  if (!event.ctrlKey || event.altKey || !event.deltaY || !content.contains(event.target)) return;
  const article = selectedPageArticle();
  if (!article) return;
  event.preventDefault();
  zoomArticleFromWheel(article, event);
}, { passive:false });
window.addEventListener('message', event => {
  const article = selectedPageArticle();
  const frame = article?.querySelector('.html-frame');
  if (!frame || event.source !== frame.contentWindow || event.data?.type !== 'onenote-page-zoom-change') return;
  setArticlePageZoom(article, event.data.percent, { postFrame:false });
});
document.addEventListener('click', event => {
  if (!pageFocusMenu.hidden && !pageFocusToolbar.contains(event.target)) closePageFocusMenu();
});
document.addEventListener('keydown', event => {
  if (!pageFocusMode || document.querySelector('dialog[open]')) return;
  if (event.key === 'Escape') {
    event.preventDefault();
    if (!pageFocusMenu.hidden) closePageFocusMenu();
    else setPageFocusMode(false);
    return;
  }
  if (!event.ctrlKey || (event.key !== 'PageUp' && event.key !== 'PageDown')) return;
  event.preventDefault();
  navigatePageFocus(event.key === 'PageUp' ? -1 : 1).catch(showError);
});

async function navigateViewHistory(step) {
  const nextIndex = viewHistoryIndex + step;
  if (nextIndex < 0 || nextIndex >= viewHistory.length) return;
  viewHistoryIndex = nextIndex;
  updateViewHistoryButtons();
  const entry = viewHistory[viewHistoryIndex];
  navigatingViewHistory = true;
  try {
    if (entry.type === 'page') {
      await openPage(entry.pageId, {
        paragraphIndex:entry.paragraphIndex,
        paragraphIndexes:Array.isArray(entry.paragraphIndexes) ? entry.paragraphIndexes : [],
        bibleOccurrences:Array.isArray(entry.bibleOccurrences) ? entry.bibleOccurrences : [],
        contentScrollTop:entry.contentScrollTop,
        frameViewState:entry.frameViewState,
        pageZoom:entry.pageZoom,
        visualView:entry.visualView,
        rememberHistory:false
      });
    } else if (entry.type === 'bible') {
      await openBibleReaderLocation(entry, { rememberHistory:false });
    }
  } finally {
    navigatingViewHistory = false;
    updateViewHistoryButtons();
  }
}

function showRibbonPageLoading(pageTitle = '') {
  activePageAbortController?.abort();
  pendingPageRefreshToken += 1;
  selectedPageId = null;
  const loading = document.createElement('div');
  loading.className = 'page-loading';
  loading.setAttribute('role', 'status');
  const loadingInner = document.createElement('div');
  const loadingSpinner = document.createElement('span');
  loadingSpinner.className = 'page-loading-spinner';
  loadingSpinner.setAttribute('aria-hidden', 'true');
  const loadingLabel = document.createElement('span');
  loadingLabel.textContent = pageTitle
    ? `Открываем страницу «${pageTitle}»…`
    : 'Открываем текущую страницу OneNote…';
  const loadingNote = document.createElement('span');
  loadingNote.className = 'page-loading-note';
  loadingNote.textContent = 'Если страницы ещё нет в BibleNote, сначала синхронизируем её.';
  loadingInner.append(loadingSpinner, loadingLabel, loadingNote);
  loading.append(loadingInner);
  content.setAttribute('aria-busy', 'true');
  content.replaceChildren(loading);
  content.scrollTop = 0;
  refreshPageFind();
}

function showRibbonPageLoadingError(message) {
  content.removeAttribute('aria-busy');
  const error = document.createElement('div');
  error.className = 'error-box';
  error.textContent = 'Не удалось открыть текущую страницу OneNote: ' + message;
  content.replaceChildren(error);
  refreshPageFind();
}

async function openPage(id, options = {}) {
  uiLog('ui.openPage', { id, options });
  activePageAbortController?.abort();
  const pageAbortController = new AbortController();
  activePageAbortController = pageAbortController;
  const pageRefreshToken = ++pendingPageRefreshToken;
  selectedPageId = id;
  const loading = document.createElement('div');
  loading.className = 'page-loading';
  loading.setAttribute('role', 'status');
  const loadingInner = document.createElement('div');
  const loadingSpinner = document.createElement('span');
  loadingSpinner.className = 'page-loading-spinner';
  loadingSpinner.setAttribute('aria-hidden', 'true');
  const loadingLabel = document.createElement('span');
  loadingLabel.textContent = 'Загрузка заметки…';
  loadingInner.append(loadingSpinner, loadingLabel);
  loading.append(loadingInner);
  content.setAttribute('aria-busy', 'true');
  content.replaceChildren(loading);
  content.scrollTop = 0;
  refreshPageFind();
  const clearTarget = options.clearTarget === true;
  const optionParagraphIndexes = !clearTarget && Array.isArray(options.paragraphIndexes)
    ? options.paragraphIndexes.filter(Number.isInteger)
    : [];
  currentTargetBibleOccurrences = !clearTarget && Array.isArray(options.bibleOccurrences)
    ? options.bibleOccurrences.filter(occurrence => Number.isInteger(occurrence?.paragraphIndex))
    : [];
  const urlParagraphIndex = clearTarget ? undefined : paragraphIndexFromUrl();
  const targetParagraphIndex = !clearTarget && Number.isInteger(options.paragraphIndex)
    ? options.paragraphIndex
    : (optionParagraphIndexes[0] ?? urlParagraphIndex);
  currentTargetParagraphIndexes = optionParagraphIndexes.length > 0
    ? optionParagraphIndexes
    : (Number.isInteger(targetParagraphIndex) ? [targetParagraphIndex] : []);
  currentTargetParagraphIndex = targetParagraphIndex;
  updateTreeSelection(id);
  if (options.updateUrl !== false) updatePageUrl(id, options.replaceUrl === true, targetParagraphIndex);
  let page;
  try {
    page = await api('/api/page?id=' + encodeURIComponent(id), { signal:pageAbortController.signal });
  } catch (error) {
    if (pageAbortController.signal.aborted) return;
    throw error;
  }
  if (pageRefreshToken !== pendingPageRefreshToken || selectedPageId !== id) return;
  if (pageFocusMode) updatePageFocusNavigation(page).catch(showError);
  if (options.rememberHistory !== false) {
    rememberViewHistory({
      type:'page',
      pageId:id,
      paragraphIndex:Number.isInteger(targetParagraphIndex) ? targetParagraphIndex : undefined,
      paragraphIndexes:currentTargetParagraphIndexes,
      bibleOccurrences:currentTargetBibleOccurrences
    });
  } else {
    updateViewHistoryButtons();
  }
  const article = document.createElement('article');
  article.className = 'page';
  article.dataset.pageId = id;
  article.dataset.pageZoom = String(clampPageZoom(options.pageZoom || defaultHtmlZoom()));
  const crumbs = document.createElement('div');
  crumbs.className = 'breadcrumbs';
  crumbs.textContent = pagePathLabel(page);
  const title = document.createElement('h2');
  const highlightQuery = pageHighlightQuery(options);
  let currentInlineSearchQuery = highlightQuery;
  const titleMatches = appendHighlightedText(title, page.title || '(без названия)', highlightQuery);
  const heading = document.createElement('div');
  heading.className = 'page-heading';
  const headingActions = document.createElement('div');
  headingActions.className = 'page-heading-actions';
  const revealPageButton = document.createElement('button');
  revealPageButton.className = 'title-tool title-reveal';
  revealPageButton.type = 'button';
  revealPageButton.textContent = '⌖';
  revealPageButton.title = 'Показать в дереве';
  revealPageButton.setAttribute('aria-label', 'Показать страницу «' + (page.title || 'без названия') + '» в дереве заметок');
  revealPageButton.addEventListener('click', () => {
    revealPageInTree(page).catch(showError);
  });
  const syncPageButton = document.createElement('button');
  syncPageButton.className = 'title-tool title-sync' + (syncRunning && activeSyncContext?.pageId === page.id ? ' syncing' : '');
  syncPageButton.type = 'button';
  syncPageButton.disabled = syncRunning;
  syncPageButton.textContent = '↻';
  syncPageButton.title = 'Синхронизировать страницу';
  syncPageButton.setAttribute('aria-label', 'Синхронизировать страницу «' + (page.title || 'без названия') + '»');
  syncPageButton.addEventListener('click', () => {
    if (!syncRunning) startTargetedSync({ pageId:page.id }, 'страницу «' + page.title + '»');
  });
  headingActions.append(createViewHistoryButtons(), createPageFocusButton(page));
  heading.append(title, headingActions);
  const meta = document.createElement('div');
  meta.className = 'meta';
  meta.append(metaItem('Изменена', formatDate(page.lastModifiedDateTime)), metaItem('Синхронизирована', formatDate(page.contentSyncedAt)));
  const actions = document.createElement('div');
  actions.className = 'page-actions';
  const openInOneNoteButton = createOpenInOneNoteButton(page);
  actions.append(revealPageButton);
  if (openInOneNoteButton) actions.append(openInOneNoteButton);
  actions.append(syncPageButton);
  meta.append(actions);
  article.append(crumbs, heading, meta);
  const folderInfo = page.links?.folder;
  const isPdfPage = folderInfo?.extension === '.pdf';
  if (isPdfPage) article.classList.add('pdf-page');
  if (folderInfo?.extension === '.pdf' && folderInfo.quality) {
    const quality = document.createElement('div');
    quality.className = 'folder-quality ' + String(folderInfo.quality).replace('_', '-');
    const qualityLabels = {
      textual:'PDF · текстовый слой',
      heuristic:'PDF · эвристический разбор',
      requires_ocr:'PDF · требуется OCR'
    };
    quality.textContent = [
      qualityLabels[folderInfo.quality] || 'PDF',
      folderInfo.qualityMessage,
      ...(Array.isArray(folderInfo.warnings) ? folderInfo.warnings : [])
    ].filter(Boolean).join(' — ');
    article.append(quality);
  }
  if (!page.hasContent && !page.fetchError) {
    const belongsToActiveSync = !activeSyncContext
      || activeSyncContext.pageId === page.id
      || activeSyncContext.sectionId === page.parentSection?.id
      || (Array.isArray(activeSyncContext.notebookIds)
        && activeSyncContext.notebookIds.includes(page.parentNotebook?.id));
    const willLoadInCurrentSync = syncRunning && belongsToActiveSync;
    const pending = document.createElement('div');
    pending.className = 'pending-box';
    pending.textContent = willLoadInCurrentSync
      ? 'Страница поставлена в начало фоновой очереди. Содержимое появится здесь после загрузки.'
      : syncRunning
        ? 'Эта страница не входит в текущую синхронизацию. После её завершения нажмите ↻ для загрузки.'
      : 'Содержимое страницы ещё не загружено. Запустите синхронизацию или нажмите ↻.';
    article.append(pending);

    if (willLoadInCurrentSync) {
      const pollPendingPage = async () => {
        if (pageRefreshToken !== pendingPageRefreshToken || selectedPageId !== id || !syncRunning) return;
        try {
          const status = await api('/api/page-status?id=' + encodeURIComponent(id), { timeoutMs:10000, signal:pageAbortController.signal });
          if (status.hasContent) {
            await openPage(id, {
              updateUrl:false,
              rememberHistory:false,
              paragraphIndex:targetParagraphIndex,
              paragraphIndexes:currentTargetParagraphIndexes,
              bibleOccurrences:currentTargetBibleOccurrences
            });
            return;
          }
          if (status.fetchError) {
            await openPage(id, { updateUrl:false, rememberHistory:false });
            return;
          }
        } catch (error) {
          if (!pageAbortController.signal.aborted) console.warn(error);
        }
        if (pageRefreshToken === pendingPageRefreshToken && selectedPageId === id && syncRunning) {
          setTimeout(pollPendingPage, 3000);
        }
      };
      setTimeout(pollPendingPage, 3000);
    }
  }
  if (page.fetchError) {
    const error = document.createElement('div');
    error.className = 'error-box';
    error.textContent = page.fetchError;
    article.append(error);
  }
  const biblePageParams = addBibleDisplayParams(new URLSearchParams({ id:page.id }));
  let bibleRefs = { paragraphs: [] };
  let bibleRefsError;
  try {
    bibleRefs = await api('/api/bible/page?' + biblePageParams.toString(), { timeoutMs:5000, signal:pageAbortController.signal });
  } catch (error) {
    bibleRefsError = error;
  }
  if (pageRefreshToken !== pendingPageRefreshToken || selectedPageId !== id) return;
  const titleParagraphIndexes = titleBibleParagraphIndexes(bibleRefs.paragraphs, page.title);
  const titleParagraphIndex = titleParagraphIndexes[0];
  currentTargetParagraphIndexes = canonicalPageTargetIndexes(currentTargetParagraphIndexes, titleParagraphIndexes);
  currentTargetBibleOccurrences = canonicalPageBibleOccurrences(currentTargetBibleOccurrences, titleParagraphIndexes);
  currentTargetParagraphIndex = currentTargetParagraphIndexes[0];
  if (Number.isInteger(titleParagraphIndex)) {
    title.dataset.paragraphIndex = String(titleParagraphIndex);
    title.classList.toggle(
      'bible-paragraph-target',
      currentTargetParagraphIndexes.includes(titleParagraphIndex)
    );
    title.classList.toggle(
      'page-title-target',
      currentTargetParagraphIndexes.includes(titleParagraphIndex)
    );
  }
  let bibleRefsSection;
  if (bibleRefs.paragraphs.length > 0) {
    bibleRefsSection = renderBiblePageRefs(bibleRefs);
    article.append(bibleRefsSection);
  } else if (bibleRefsError) {
    const bibleRefsWarning = document.createElement('div');
    bibleRefsWarning.className = 'error-box';
    bibleRefsWarning.textContent = 'Библейские ссылки не загрузились. Заметка показана без них. ' + (bibleRefsError?.message || String(bibleRefsError));
    article.append(bibleRefsWarning);
  }
  const text = document.createElement('div');
  text.className = 'page-text';
  text.style.zoom = String(articlePageZoom(article) / 100);
  let matches;
  if (page.isEmpty && !page.fetchError) {
    const emptyPage = document.createElement('div');
    emptyPage.className = 'empty-state';
    emptyPage.textContent = 'В исходной странице OneNote нет содержимого. Возможно, это страница-разделитель.';
    text.append(emptyPage);
    matches = [...titleMatches];
  } else {
    matches = [
      ...titleMatches,
      ...appendPageTextWithBibleRefs(text, page.text || 'Текст страницы ещё не загружен.', highlightQuery, bibleRefs)
    ];
  }
  if (titleParagraphIndexes.length > 0) {
    const repeatedTitleIndexes = new Set(titleParagraphIndexes);
    for (const repeatedTitle of text.querySelectorAll('[data-paragraph-index]')) {
      if (!repeatedTitleIndexes.has(Number(repeatedTitle.dataset.paragraphIndex))) continue;
      repeatedTitle.classList.remove('bible-paragraph-target', 'current-match');
    }
  }
  const paragraphTargets = [
    ...(title.classList.contains('bible-paragraph-target') ? [title] : []),
    ...text.querySelectorAll('.bible-paragraph-target')
  ];
  const paragraphNavigationTargets = pageNavigationTargets(
    paragraphTargets,
    currentTargetParagraphIndexes.filter(Number.isInteger),
    currentTargetBibleOccurrences,
    text
  );
  let navigationUsesParagraphTargets = paragraphNavigationTargets.length > 0;
  let navigationTargets = navigationUsesParagraphTargets
    ? paragraphNavigationTargets
    : matches;
  const preferHtmlView = page.hasHtml && (typeof options.visualView === 'boolean'
    ? options.visualView
    : defaultPageViewMode() === 'html');
  let pdfContext = isPdfPage
    ? pdfPageContext(bibleRefs, currentTargetParagraphIndexes, currentTargetBibleOccurrences, page.title)
    : undefined;
  let htmlFrame;
  let showingHtml = preferHtmlView;
  let htmlSearchMatchCount = 0;
  let htmlSearchResultsReady = false;
  let activeMatchIndex = 0;
  let matchCount;
  let matchNav;
  const positionHtmlMatchNavigation = () => {
    updateHtmlMatchNavigationPresentation(matchNav, showingHtml, htmlFrame, isPdfPage);
  };
  const handleHtmlMainSearchResult = event => {
    if (!htmlFrame || event.source !== htmlFrame.contentWindow) return;
    const data = event.data || {};
    if (data.type !== 'onenote-main-search-result') return;
    if (navigationUsesParagraphTargets) return;
    if (htmlFrame.classList.contains('pdf-frame')) {
      const pattern = pageSearchHighlightPattern(currentInlineSearchQuery);
      if (String(data.source || '') !== String(pattern?.source || '')) return;
      if (String(data.flags || '') !== String(pattern?.flags || '')) return;
    } else if (String(data.searchKey || '') !== htmlFrameMainSearchKey(currentInlineSearchQuery)) {
      return;
    }
    htmlSearchMatchCount = Math.max(0, Number(data.count) || 0);
    htmlSearchResultsReady = true;
    activeMatchIndex = htmlSearchMatchCount > 0
      ? Math.max(0, Math.min(Number(data.index) || 0, htmlSearchMatchCount - 1))
      : 0;
    if (showingHtml) {
      if (!matchNav || htmlSearchMatchCount === 0) {
        renderMatchNavigation(false, false);
      } else if (matchCount) {
        matchCount.textContent = (activeMatchIndex + 1) + ' / ' + htmlSearchMatchCount;
      }
    }
  };
  window.addEventListener('message', handleHtmlMainSearchResult);
  pageAbortController.signal.addEventListener('abort', () => {
    window.removeEventListener('message', handleHtmlMainSearchResult);
  }, { once:true });
  const goToMatch = (index, smooth = true, scroll = true) => {
    const navigationCount = showingHtml && !navigationUsesParagraphTargets && htmlSearchResultsReady
      ? htmlSearchMatchCount
      : navigationTargets.length;
    if (navigationCount === 0) return;
    navigationTargets[activeMatchIndex]?.classList.remove('current-match');
    activeMatchIndex = (index + navigationCount) % navigationCount;
    const match = navigationTargets[activeMatchIndex];
    match?.classList.add('current-match');
    syncPageFocusTitleSearchState(title);
    matchCount.textContent = (activeMatchIndex + 1) + ' / ' + navigationCount;
    if (showingHtml && !navigationUsesParagraphTargets) {
      postHtmlFrameMainSearch(htmlFrame, currentInlineSearchQuery, activeMatchIndex, scroll);
    }
    const paragraphIndex = Number(match?.dataset?.paragraphIndex);
    if (Number.isInteger(paragraphIndex)) {
      currentTargetParagraphIndex = paragraphIndex;
      history.replaceState(
        { pageId:id, paragraphIndex },
        '',
        pageUrl(id, paragraphIndex)
      );
      if (showingHtml && scroll) {
        scrollHtmlFrameToTargetParagraph(
          htmlFrame,
          paragraphIndex,
          activeMatchIndex,
          !currentInlineSearchQuery
        );
      }
    }
    if (!showingHtml && scroll) match?.scrollIntoView({ block:'center', behavior:smooth ? 'smooth' : 'auto' });
  };
  const renderMatchNavigation = (activateWithoutScrolling = false, scrollActivatedMatch = false) => {
    matchNav?.remove();
    matchNav = undefined;
    matchCount = undefined;
    const initialNavigationCount = showingHtml && !navigationUsesParagraphTargets && htmlSearchResultsReady
      ? htmlSearchMatchCount
      : navigationTargets.length;
    if (initialNavigationCount === 0) return;
    matchNav = document.createElement('div');
    matchNav.className = 'match-nav';
    matchNav.setAttribute('aria-label', 'Совпадения на странице');
    matchCount = document.createElement('span');
    matchCount.className = 'match-count';
    matchCount.textContent = initialNavigationCount > 0
      ? (Math.min(activeMatchIndex, initialNavigationCount - 1) + 1) + ' / ' + initialNavigationCount
      : '0 / 0';
    const previousMatch = document.createElement('button');
    previousMatch.className = 'match-button';
    previousMatch.type = 'button';
    previousMatch.textContent = '↑';
    previousMatch.title = 'Предыдущее совпадение';
    previousMatch.setAttribute('aria-label', 'Предыдущее совпадение');
    previousMatch.addEventListener('click', () => goToMatch(activeMatchIndex - 1));
    const nextMatch = document.createElement('button');
    nextMatch.className = 'match-button';
    nextMatch.type = 'button';
    nextMatch.textContent = '↓';
    nextMatch.title = 'Следующее совпадение';
    nextMatch.setAttribute('aria-label', 'Следующее совпадение');
    nextMatch.addEventListener('click', () => goToMatch(activeMatchIndex + 1));
    const closeMatchNavigation = document.createElement('button');
    closeMatchNavigation.className = 'match-button';
    closeMatchNavigation.type = 'button';
    closeMatchNavigation.textContent = '×';
    closeMatchNavigation.title = 'Закрыть навигацию';
    closeMatchNavigation.setAttribute('aria-label', 'Закрыть навигацию по совпадениям');
    closeMatchNavigation.addEventListener('click', () => {
      article.clearSearchMatches?.();
      history.replaceState({ pageId:id }, '', pageUrl(id));
    });
    matchNav.append(matchCount, previousMatch, nextMatch, closeMatchNavigation);
    if (text.parentNode === article) article.insertBefore(matchNav, text);
    else article.append(matchNav);
    positionHtmlMatchNavigation();
    if (activateWithoutScrolling) requestAnimationFrame(() => goToMatch(0, false, scrollActivatedMatch));
  };
  renderMatchNavigation();
  article.updateSearchMatches = ({ paragraphIndexes, bibleOccurrences, query, bibleResult, scrollToFirst = false }) => {
    const nextParagraphIndexes = canonicalPageTargetIndexes(paragraphIndexes, titleParagraphIndexes);
    const nextBibleOccurrences = canonicalPageBibleOccurrences(bibleOccurrences, titleParagraphIndexes);
    currentTargetParagraphIndexes = nextParagraphIndexes;
    currentTargetBibleOccurrences = nextBibleOccurrences;
    currentTargetParagraphIndex = nextParagraphIndexes[0];
    const targetSet = new Set(nextParagraphIndexes);
    const titleIsTarget = Number.isInteger(titleParagraphIndex) && targetSet.has(titleParagraphIndex);
    title.classList.toggle('bible-paragraph-target', titleIsTarget);
    title.classList.toggle('page-title-target', titleIsTarget);
    title.classList.remove('current-match');
    syncPageFocusTitleSearchState(title);
    for (const paragraph of text.querySelectorAll('[data-paragraph-index]')) {
      const paragraphIndex = Number(paragraph.dataset.paragraphIndex);
      paragraph.classList.toggle(
        'bible-paragraph-target',
        !titleParagraphIndexes.includes(paragraphIndex) && targetSet.has(paragraphIndex)
      );
      paragraph.classList.remove('current-match');
    }
    const inlineQuery = bibleResult && nextParagraphIndexes.length > 0 ? '' : query;
    currentInlineSearchQuery = inlineQuery;
    if (showingHtml) postHtmlFrameMainSearch(htmlFrame, inlineQuery, 0, false);
    if (isPdfPage) {
      pdfContext = pdfPageContext(bibleRefs, nextParagraphIndexes, nextBibleOccurrences, page.title);
      postPdfFrameContext(htmlFrame, pdfContext);
    }
    htmlSearchMatchCount = 0;
    htmlSearchResultsReady = false;
    const nextMatches = [
      ...highlightExistingSearchText(title, inlineQuery),
      ...highlightExistingSearchText(text, inlineQuery)
    ];
    const nextParagraphTargets = [
      ...(title.classList.contains('bible-paragraph-target') ? [title] : []),
      ...text.querySelectorAll('.bible-paragraph-target')
    ];
    const nextParagraphNavigationTargets = pageNavigationTargets(
      nextParagraphTargets,
      nextParagraphIndexes,
      nextBibleOccurrences,
      text
    );
    navigationUsesParagraphTargets = nextParagraphNavigationTargets.length > 0;
    navigationTargets = navigationUsesParagraphTargets
      ? nextParagraphNavigationTargets
      : nextMatches;
    activeMatchIndex = 0;
    htmlFrame?.contentWindow?.postMessage({
      type:'onenote-set-target-paragraphs',
      paragraphIndexes:nextParagraphIndexes,
      bibleOccurrences:nextBibleOccurrences
    }, '*');
    renderMatchNavigation(true, scrollToFirst);
  };
  article.clearSearchMatches = () => {
    article.updateSearchMatches({ paragraphIndexes:[], bibleOccurrences:[], query:'', bibleResult:true });
    htmlFrame?.contentWindow?.postMessage({ type:'onenote-clear-target-paragraphs' }, '*');
    postHtmlFrameMainSearch(htmlFrame, '', 0, false);
  };
  let openDefaultHtmlView;
  if (page.hasHtml) {
    const htmlButton = document.createElement('button');
    htmlButton.className = 'view-button';
    htmlButton.type = 'button';
    htmlButton.textContent = isPdfPage ? 'P' : '<>';
    htmlButton.title = isPdfPage ? 'Показать PDF' : 'Показать HTML';
    htmlButton.setAttribute('aria-label', isPdfPage ? 'Показать PDF' : 'Показать HTML');
    const zoomLabel = document.createElement('label');
    zoomLabel.className = 'html-zoom';
    zoomLabel.textContent = 'Масштаб';
    const zoomRange = document.createElement('input');
    zoomRange.type = 'range';
    zoomRange.min = '50';
    zoomRange.max = '300';
    zoomRange.step = '1';
    zoomRange.value = String(articlePageZoom(article));
    const zoomValue = document.createElement('span');
    zoomValue.className = 'html-zoom-value';
    zoomValue.textContent = articlePageZoom(article) + '%';
    zoomLabel.append(zoomRange, zoomValue);
    let htmlLoadError;
    zoomRange.addEventListener('input', () => {
      setArticlePageZoom(article, Number(zoomRange.value));
    });
    const setHtmlView = async showHtml => {
      try {
        htmlLoadError?.remove();
        htmlLoadError = undefined;
        showingHtml = showHtml;
        article.classList.toggle('html-view-active', showingHtml);
        text.style.display = showingHtml ? 'none' : '';
        if (!htmlFrame) {
          htmlButton.disabled = true;
          htmlButton.textContent = showingHtml ? '¶' : (isPdfPage ? 'P' : '<>');
          htmlButton.title = isPdfPage ? 'Загрузка PDF' : 'Загрузка HTML';
          htmlButton.setAttribute('aria-label', isPdfPage ? 'Загрузка PDF' : 'Загрузка HTML');
          htmlButton.setAttribute('aria-busy', 'true');
          let result;
          if (!isPdfPage) {
            const htmlParams = new URLSearchParams({ id:page.id, module:currentBibleModule() });
            result = await loadPageHtmlWithFallback(htmlParams, { signal:pageAbortController.signal });
            if (pageRefreshToken !== pendingPageRefreshToken || selectedPageId !== id) return;
          }
          htmlFrame = document.createElement('iframe');
          htmlFrame.className = 'html-frame' + (isPdfPage ? ' pdf-frame' : '');
          htmlFrame.title = (isPdfPage ? 'PDF: ' : 'HTML: ') + (page.title || 'страница OneNote');
          htmlFrame.setAttribute('sandbox', isPdfPage ? 'allow-scripts allow-same-origin' : 'allow-scripts');
          htmlFrame.referrerPolicy = 'no-referrer';
          const htmlFrameReady = waitForHtmlFrameReady(htmlFrame, pageAbortController.signal);
          htmlFrame.addEventListener('load', () => {
            postHtmlFrameZoom(htmlFrame, articlePageZoom(article));
            postPageFocusModeToFrame(article);
            if (isPdfPage) postPdfFrameContext(htmlFrame, pdfContext);
            if (currentTargetParagraphIndexes.length === 0) {
              htmlFrame.contentWindow?.postMessage({ type:'onenote-clear-target-paragraphs' }, '*');
            }
            postHtmlFrameMainSearch(htmlFrame, currentInlineSearchQuery, activeMatchIndex, true);
            refreshPageFind();
          });
          if (isPdfPage) {
            htmlFrame.src = '/ui/pdf-viewer.html?id=' + encodeURIComponent(page.id);
          } else {
            htmlFrame.srcdoc = pageHtmlFrameSrcdoc(
              result.html,
              bibleRefs.paragraphs.filter(paragraph =>
                !titleParagraphIndexes.includes(Number(paragraph?.index))
              ),
              currentTargetParagraphIndexes,
              currentTargetBibleOccurrences
            );
          }
          text.after(htmlFrame);
          if (result?.degraded) {
            htmlLoadError = document.createElement('div');
            htmlLoadError.className = 'error-box';
            htmlLoadError.textContent = result.warning;
            htmlFrame.before(htmlLoadError);
          }
          await htmlFrameReady;
          if (pageRefreshToken !== pendingPageRefreshToken || selectedPageId !== id) return;
          if (isPdfPage) postPdfFrameContext(htmlFrame, pdfContext);
          postHtmlFrameMainSearch(htmlFrame, currentInlineSearchQuery, activeMatchIndex, true);
          htmlButton.disabled = false;
          htmlButton.removeAttribute('aria-busy');
        }
        htmlFrame.style.display = showingHtml ? 'block' : 'none';
        positionHtmlMatchNavigation();
        if (showingHtml) postHtmlFrameZoom(htmlFrame, articlePageZoom(article));
        if (showingHtml) postPageFocusModeToFrame(article);
        if (showingHtml && isPdfPage) postPdfFrameContext(htmlFrame, pdfContext);
        if (showingHtml) postHtmlFrameMainSearch(htmlFrame, currentInlineSearchQuery, activeMatchIndex, true);
        if (showingHtml) {
          scrollHtmlFrameToTargetParagraph(
            htmlFrame,
            currentTargetParagraphIndex,
            activeMatchIndex,
            !currentInlineSearchQuery
          );
          restorePageFrameViewState(htmlFrame, options.frameViewState);
        }
        restorePageContentScroll(options.contentScrollTop);
        if (!showingHtml && navigationTargets.length > 0) goToMatch(activeMatchIndex, false, false);
        htmlButton.textContent = showingHtml ? '¶' : (isPdfPage ? 'P' : '<>');
        htmlButton.title = showingHtml ? 'Показать извлечённый текст' : (isPdfPage ? 'Показать PDF' : 'Показать HTML');
        htmlButton.setAttribute('aria-label', showingHtml ? 'Показать извлечённый текст' : (isPdfPage ? 'Показать PDF' : 'Показать HTML'));
        refreshPageFind();
      } catch (error) {
        if (pageRefreshToken !== pendingPageRefreshToken || selectedPageId !== id) return;
        htmlButton.disabled = false;
        htmlButton.removeAttribute('aria-busy');
        htmlButton.textContent = isPdfPage ? 'P' : '<>';
        htmlButton.title = isPdfPage ? 'Показать PDF' : 'Показать HTML';
        htmlButton.setAttribute('aria-label', isPdfPage ? 'Показать PDF' : 'Показать HTML');
        showingHtml = false;
        article.classList.remove('html-view-active');
        text.style.display = '';
        if (htmlFrame) htmlFrame.style.display = 'none';
        htmlLoadError = document.createElement('div');
        htmlLoadError.className = 'error-box';
        htmlLoadError.textContent = 'Не удалось загрузить HTML. Показана текстовая версия. ' + (error?.message || String(error));
        text.before(htmlLoadError);
        refreshPageFind();
      }
    };
    htmlButton.addEventListener('click', () => {
      setHtmlView(!showingHtml).catch(showError);
    });
    openDefaultHtmlView = () => setHtmlView(true);
    actions.append(htmlButton);
    if (!isPdfPage) actions.append(zoomLabel);
  }
  if (preferHtmlView) text.style.display = 'none';
  article.append(text);
  const finishPageLoading = () => {
    if (pageRefreshToken !== pendingPageRefreshToken || selectedPageId !== id) return;
    loading.remove();
    content.removeAttribute('aria-busy');
  };
  if (preferHtmlView) content.replaceChildren(loading, article);
  else {
    content.replaceChildren(article);
    finishPageLoading();
  }
  if (pageFocusMode) syncPageFocusZoom(article);
  refreshPageFind();
  if (openDefaultHtmlView && preferHtmlView) {
    openDefaultHtmlView()
      .catch(error => { if (!pageAbortController.signal.aborted) console.warn(error); })
      .finally(finishPageLoading);
  }
  if (navigationTargets.length > 0) requestAnimationFrame(() => goToMatch(0, false));
  if (Number.isInteger(targetParagraphIndex) && !showingHtml) {
    scrollToTargetParagraph(targetParagraphIndex);
  }
  if (!showingHtml) restorePageContentScroll(options.contentScrollTop);
}
