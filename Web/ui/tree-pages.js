function row(label, level, options = {}) {
  const button = document.createElement('button');
  button.className = 'tree-row level-' + level
    + (options.page ? ' page-row' : '')
    + (options.section ? ' section-row' : '')
    + (options.search ? ' search-result-row' : '')
    + (options.selected ? ' selected' : '');
  button.style.setProperty('--tree-level', String(level));
  button.type = 'button';
  if (options.title) button.title = options.title;
  if (!options.page) {
    const chev = document.createElement('span');
    chev.className = 'chevron';
    chev.textContent = options.expandable ? (options.open ? '▾' : '▸') : '·';
    button.append(chev);
  }
  if (level > 0 && !options.page && options.folder) {
    const nodeIcon = document.createElement('span');
    nodeIcon.className = 'group-icon';
    nodeIcon.setAttribute('aria-hidden', 'true');
    button.append(nodeIcon);
  }
  if (options.status) {
    const dot = document.createElement('span');
    dot.className = 'status-dot ' + options.status;
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

async function renderTree() {
  const renderToken = ++treeRenderToken;
  const savedScrollTop = tree.scrollTop;
  const fragment = document.createDocumentFragment();
  for (const notebook of notebooksCache.filter(item => !hiddenNotebookIds.has(item.id))) {
    const key = 'n:' + notebook.id;
    const open = expanded.has(key);
    const button = row(notebook.displayName, 0, {
      expandable:true,
      open,
      count:notebook.pageCount,
      syncLabel:'Синхронизировать блокнот «' + notebook.displayName + '»',
      onSync:() => startTargetedSync({ notebookIds:[notebook.id] }, 'блокнот «' + notebook.displayName + '»')
    });
    button.onclick = () => { open ? expanded.delete(key) : expanded.add(key); renderTree(); };
    fragment.append(button);
    if (open) await renderSections(notebook.id, fragment);
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
  clearPageTargetHighlight(page.id);

  const notesPanel = document.querySelector('.notes-panel');
  if (notesPanel) notesPanel.setAttribute('open', '');

  if (hiddenNotebookIds.has(notebookId)) {
    hiddenNotebookIds.delete(notebookId);
    saveNotebookSelection();
    const checkbox = notebookListEl.querySelector('input[data-notebook-id="' + CSS.escape(String(notebookId)) + '"]');
    if (checkbox) checkbox.checked = true;
  }

  expanded.add('n:' + notebookId);
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

function clearPageTargetHighlight(pageId) {
  currentTargetParagraphIndex = undefined;
  currentTargetParagraphIndexes = [];
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

async function renderSections(notebookId, target) {
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
    button.onclick = () => { open ? expanded.delete(key) : expanded.add(key); renderTree(); };
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
      button.onclick = () => { open ? expanded.delete(key) : expanded.add(key); renderTree(); };
      target.append(button);
      if (open) await renderLevel(group.id, level + 1);
    }
    for (const section of sectionsByGroup.get(parentGroupId) || []) {
      await renderSection(section, level);
    }
  };

  await renderLevel('', 1);
}

async function renderPages(sectionId, target = tree, level = 2) {
  const pages = await api('/api/pages?sectionId=' + encodeURIComponent(sectionId));
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

function groupedSearchResults(results) {
  const notebooks = new Map();
  for (const page of results) {
    const notebookKey = page.notebookId || page.notebook || '';
    if (!notebooks.has(notebookKey)) {
      notebooks.set(notebookKey, {
        name:page.notebook || '(без блокнота)',
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

function searchResultCountLabel(value) {
  const count = Number(value) || 0;
  const mod100 = Math.abs(count) % 100;
  const mod10 = mod100 % 10;
  const noun = mod100 >= 11 && mod100 <= 19
    ? 'заметок'
    : (mod10 === 1 ? 'заметка' : (mod10 >= 2 && mod10 <= 4 ? 'заметки' : 'заметок'));
  return count + ' ' + noun;
}

function searchWeightLabel(value) {
  const numericWeight = Number(value || 0);
  return 'вес ' + numericWeight.toFixed(4).replace(/\.?0+$/, '');
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

function pageNavigationTargets(paragraphTargets, paragraphIndexes) {
  const targetByParagraphIndex = new Map();
  for (const target of paragraphTargets) {
    const paragraphIndex = Number(target.dataset?.paragraphIndex);
    if (Number.isInteger(paragraphIndex) && !targetByParagraphIndex.has(paragraphIndex)) {
      targetByParagraphIndex.set(paragraphIndex, target);
    }
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
    query,
    bibleResult:Boolean(result?.bibleRef)
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
    const button = document.createElement('button');
    button.className = 'tree-row search-weight-row' + (page.id === selectedPageId ? ' selected' : '');
    button.type = 'button';
    button.dataset.pageId = page.id;
    button.title = [page.notebook, page.section, page.snippet].filter(Boolean).join(' / ');
    button.addEventListener('click', () => openPage(page.id, {
      paragraphIndex:paragraphIndexes[0],
      paragraphIndexes,
      highlightQuery:page.bibleRef ? '' : activeSearchQuery
    }));

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
    weight.textContent = searchWeightLabel(page.bibleWeight);
    button.append(main, weight);
    tree.append(button);
  }
}

function addSearchViewSwitch(heading, query) {
  heading.classList.add('with-view-switch');
  heading.replaceChildren();
  const label = document.createElement('span');
  label.textContent = 'Результаты поиска';
  const controls = document.createElement('span');
  controls.className = 'search-view-switch';
  controls.setAttribute('role', 'group');
  controls.setAttribute('aria-label', 'Вид результатов поиска по стиху');
  for (const option of [
    { value:'structure', label:'Структура' },
    { value:'weight', label:'По весам' }
  ]) {
    const button = document.createElement('button');
    button.className = 'search-view-button' + (searchResultsView === option.value ? ' active' : '');
    button.type = 'button';
    button.textContent = option.label;
    button.setAttribute('aria-pressed', String(searchResultsView === option.value));
    button.addEventListener('click', () => {
      if (searchResultsView === option.value) return;
      searchResultsView = option.value;
      renderSearch(query).catch(showError);
    });
    controls.append(button);
  }
  heading.append(label, controls);
}

async function renderSearch(query) {
  const renderToken = ++treeRenderToken;
  activeSearchQuery = query;
  tree.replaceChildren();
  const heading = document.createElement('div');
  heading.className = 'search-heading';
  heading.textContent = 'Результаты поиска';
  tree.append(heading);
  const selectedIds = selectedNotebookIds();
  if (selectedIds.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'search-heading';
    empty.textContent = 'Не выбраны блокноты';
    tree.append(empty);
    updateOpenPageSearchMatches(null, query);
    return;
  }
  const request = searchRequest(query);
  const params = new URLSearchParams({
    q:request.query,
    mode:request.mode,
    caseSensitive:String(request.caseSensitive),
    view:searchResultsView
  });
  addBibleDisplayParams(params);
  for (const notebookId of selectedIds) params.append('notebookId', notebookId);
  let results;
  try {
    results = await api('/api/search?' + params.toString());
  } catch (error) {
    if (renderToken !== treeRenderToken) return;
    throw error;
  }
  if (renderToken !== treeRenderToken) return;
  if (!results.length) {
    const empty = document.createElement('div');
    empty.className = 'search-heading';
    empty.textContent = 'Ничего не найдено';
    tree.append(empty);
  }
  const weightedAvailable = results.some(page => page.bibleWeight != null && Number.isFinite(Number(page.bibleWeight)));
  if (weightedAvailable) addSearchViewSwitch(heading, query);
  if (weightedAvailable && searchResultsView === 'weight') {
    renderWeightedSearchResults(results);
  } else for (const notebook of groupedSearchResults(results)) {
    const notebookRow = row(notebook.name, 0, {
      expandable:true,
      open:true,
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
          selected:page.id === selectedPageId,
          search:true,
          count:page.bibleWeight != null && Number.isFinite(Number(page.bibleWeight))
            ? searchWeightLabel(page.bibleWeight)
            : undefined,
          title:[page.notebook, page.section, page.snippet].filter(Boolean).join(' / ')
        });
        const paragraphIndexes = searchResultParagraphIndexes(page);
        button.dataset.pageId = page.id;
        button.onclick = () => openPage(page.id, {
          paragraphIndex:paragraphIndexes[0],
          paragraphIndexes,
          highlightQuery:page.bibleRef ? '' : activeSearchQuery
        });
        sectionGroup.children.append(button);
      }
      notebookGroup.children.append(sectionGroup.group);
    }
    tree.append(notebookGroup.group);
  }
  updateOpenPageSearchMatches(results.find(page => page.id === selectedPageId), query);
  updateTreeSelection(selectedPageId);
  requestAnimationFrame(() => {
    updateTreeScrollbar();
    scrollTreeSelectionIntoView('auto');
  });
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

function scrollHtmlFrameToTargetParagraph(frame, paragraphIndex, targetIndex) {
  if (!Number.isInteger(paragraphIndex) || !frame) return;
  frame.scrollIntoView({ block:'nearest', behavior:'smooth' });
  const post = () => frame.contentWindow?.postMessage({
    type:'onenote-scroll-target-paragraph',
    paragraphIndex,
    targetIndex:Number.isInteger(targetIndex) ? targetIndex : undefined
  }, '*');
  requestAnimationFrame(() => {
    post();
    setTimeout(post, 120);
    setTimeout(post, 360);
  });
}

function viewHistoryKey(entry) {
  return JSON.stringify(entry);
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

pageFocusMenuButton.addEventListener('click', () => {
  const willOpen = pageFocusMenu.hidden;
  pageFocusMenu.hidden = !willOpen;
  pageFocusMenuButton.setAttribute('aria-expanded', String(willOpen));
  if (willOpen) pageFocusMenu.querySelector('.selected')?.scrollIntoView({ block:'nearest' });
});
pageFocusPreviousButton.addEventListener('click', () => navigatePageFocus(-1).catch(showError));
pageFocusNextButton.addEventListener('click', () => navigatePageFocus(1).catch(showError));
pageFocusExitButton.addEventListener('click', () => setPageFocusMode(false));
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
      paragraphIndexes:currentTargetParagraphIndexes
    });
  } else {
    updateViewHistoryButtons();
  }
  const article = document.createElement('article');
  article.className = 'page';
  article.dataset.pageId = id;
  const crumbs = document.createElement('div');
  crumbs.className = 'breadcrumbs';
  crumbs.textContent = pagePathLabel(page);
  const title = document.createElement('h2');
  const highlightQuery = pageHighlightQuery(options);
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
  actions.append(revealPageButton, syncPageButton);
  meta.append(actions);
  article.append(crumbs, heading, meta);
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
              paragraphIndexes:currentTargetParagraphIndexes
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
    currentTargetParagraphIndexes.filter(Number.isInteger)
  );
  let navigationTargets = paragraphNavigationTargets.length > 0
    ? paragraphNavigationTargets
    : matches;
  const preferHtmlView = page.hasHtml && defaultPageViewMode() === 'html';
  let htmlFrame;
  let showingHtml = preferHtmlView;
  let activeMatchIndex = 0;
  let matchCount;
  let matchNav;
  const goToMatch = (index, smooth = true, scroll = true) => {
    if (navigationTargets.length === 0) return;
    navigationTargets[activeMatchIndex]?.classList.remove('current-match');
    activeMatchIndex = (index + navigationTargets.length) % navigationTargets.length;
    const match = navigationTargets[activeMatchIndex];
    match.classList.add('current-match');
    syncPageFocusTitleSearchState(title);
    matchCount.textContent = (activeMatchIndex + 1) + ' / ' + navigationTargets.length;
    const paragraphIndex = Number(match.dataset?.paragraphIndex);
    if (Number.isInteger(paragraphIndex)) {
      currentTargetParagraphIndex = paragraphIndex;
      history.replaceState(
        { pageId:id, paragraphIndex },
        '',
        pageUrl(id, paragraphIndex)
      );
      if (showingHtml && scroll) scrollHtmlFrameToTargetParagraph(htmlFrame, paragraphIndex, activeMatchIndex);
    }
    if (!showingHtml && scroll) match.scrollIntoView({ block:'center', behavior:smooth ? 'smooth' : 'auto' });
  };
  const renderMatchNavigation = (activateWithoutScrolling = false) => {
    matchNav?.remove();
    matchNav = undefined;
    matchCount = undefined;
    if (navigationTargets.length === 0) return;
    matchNav = document.createElement('div');
    matchNav.className = 'match-nav';
    matchNav.setAttribute('aria-label', 'Совпадения на странице');
    matchCount = document.createElement('span');
    matchCount.className = 'match-count';
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
    matchNav.append(matchCount, previousMatch, nextMatch);
    if (text.parentNode === article) article.insertBefore(matchNav, text);
    else article.append(matchNav);
    if (activateWithoutScrolling) requestAnimationFrame(() => goToMatch(0, false, false));
  };
  renderMatchNavigation();
  article.updateSearchMatches = ({ paragraphIndexes, query, bibleResult }) => {
    const nextParagraphIndexes = canonicalPageTargetIndexes(paragraphIndexes, titleParagraphIndexes);
    currentTargetParagraphIndexes = nextParagraphIndexes;
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
    const nextMatches = [
      ...highlightExistingSearchText(title, inlineQuery),
      ...highlightExistingSearchText(text, inlineQuery)
    ];
    const nextParagraphTargets = [
      ...(title.classList.contains('bible-paragraph-target') ? [title] : []),
      ...text.querySelectorAll('.bible-paragraph-target')
    ];
    const nextParagraphNavigationTargets = pageNavigationTargets(nextParagraphTargets, nextParagraphIndexes);
    navigationTargets = nextParagraphNavigationTargets.length > 0
      ? nextParagraphNavigationTargets
      : nextMatches;
    activeMatchIndex = 0;
    htmlFrame?.contentWindow?.postMessage({
      type:'onenote-set-target-paragraphs',
      paragraphIndexes:nextParagraphIndexes
    }, '*');
    renderMatchNavigation(true);
  };
  article.clearSearchMatches = () => {
    article.updateSearchMatches({ paragraphIndexes:[], query:'', bibleResult:true });
    htmlFrame?.contentWindow?.postMessage({ type:'onenote-clear-target-paragraphs' }, '*');
  };
  let openDefaultHtmlView;
  if (page.hasHtml) {
    const htmlButton = document.createElement('button');
    htmlButton.className = 'view-button';
    htmlButton.type = 'button';
    htmlButton.textContent = '<>';
    htmlButton.title = 'Показать HTML';
    htmlButton.setAttribute('aria-label', 'Показать HTML');
    const htmlZoom = defaultHtmlZoom();
    const zoomLabel = document.createElement('label');
    zoomLabel.className = 'html-zoom';
    zoomLabel.textContent = 'Масштаб';
    const zoomRange = document.createElement('input');
    zoomRange.type = 'range';
    zoomRange.min = '50';
    zoomRange.max = '200';
    zoomRange.step = '10';
    zoomRange.value = String(htmlZoom);
    const zoomValue = document.createElement('span');
    zoomValue.className = 'html-zoom-value';
    zoomValue.textContent = htmlZoom + '%';
    zoomLabel.append(zoomRange, zoomValue);
    let htmlLoadError;
    zoomRange.addEventListener('input', () => {
      zoomValue.textContent = zoomRange.value + '%';
      postHtmlFrameZoom(htmlFrame, Number(zoomRange.value));
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
          htmlButton.textContent = showingHtml ? '¶' : '<>';
          htmlButton.title = 'Загрузка HTML';
          htmlButton.setAttribute('aria-label', 'Загрузка HTML');
          htmlButton.setAttribute('aria-busy', 'true');
          const htmlParams = new URLSearchParams({ id:page.id, module:currentBibleModule() });
          const result = await loadPageHtmlWithFallback(htmlParams, { signal:pageAbortController.signal });
          if (pageRefreshToken !== pendingPageRefreshToken || selectedPageId !== id) return;
          if (result.bibleReparsed && activeSearchQuery) {
            renderSearch(activeSearchQuery).catch(error => console.warn(error));
          }
          if (result.refreshing) {
            void waitForPageHtmlRefresh(htmlParams, { signal:pageAbortController.signal }).then(refreshed => {
              if (!refreshed || pageRefreshToken !== pendingPageRefreshToken || selectedPageId !== id) return;
              if (refreshed.bibleReparsed && activeSearchQuery) {
                renderSearch(activeSearchQuery).catch(error => console.warn(error));
              }
            });
          }
          htmlFrame = document.createElement('iframe');
          htmlFrame.className = 'html-frame';
          htmlFrame.title = 'HTML: ' + (page.title || 'страница OneNote');
          htmlFrame.setAttribute('sandbox', 'allow-scripts');
          htmlFrame.referrerPolicy = 'no-referrer';
          const htmlFrameReady = waitForHtmlFrameReady(htmlFrame, pageAbortController.signal);
          htmlFrame.addEventListener('load', () => {
            postHtmlFrameZoom(htmlFrame, Number(zoomRange.value));
            if (currentTargetParagraphIndexes.length === 0) {
              htmlFrame.contentWindow?.postMessage({ type:'onenote-clear-target-paragraphs' }, '*');
            }
            refreshPageFind();
          });
          htmlFrame.srcdoc = pageHtmlFrameSrcdoc(
            result.html,
            bibleRefs.paragraphs.filter(paragraph =>
              !titleParagraphIndexes.includes(Number(paragraph?.index))
            ),
            currentTargetParagraphIndexes
          );
          text.after(htmlFrame);
          if (result.degraded) {
            htmlLoadError = document.createElement('div');
            htmlLoadError.className = 'error-box';
            htmlLoadError.textContent = result.warning;
            htmlFrame.before(htmlLoadError);
          }
          await htmlFrameReady;
          if (pageRefreshToken !== pendingPageRefreshToken || selectedPageId !== id) return;
          htmlButton.disabled = false;
          htmlButton.removeAttribute('aria-busy');
        }
        htmlFrame.style.display = showingHtml ? 'block' : 'none';
        if (showingHtml) postHtmlFrameZoom(htmlFrame, Number(zoomRange.value));
        if (showingHtml) scrollHtmlFrameToTargetParagraph(htmlFrame, currentTargetParagraphIndex, activeMatchIndex);
        htmlButton.textContent = showingHtml ? '¶' : '<>';
        htmlButton.title = showingHtml ? 'Показать текст' : 'Показать HTML';
        htmlButton.setAttribute('aria-label', showingHtml ? 'Показать текст' : 'Показать HTML');
        refreshPageFind();
      } catch (error) {
        if (pageRefreshToken !== pendingPageRefreshToken || selectedPageId !== id) return;
        htmlButton.disabled = false;
        htmlButton.removeAttribute('aria-busy');
        htmlButton.textContent = '<>';
        htmlButton.title = 'Показать HTML';
        htmlButton.setAttribute('aria-label', 'Показать HTML');
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
    actions.append(htmlButton, zoomLabel);
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
}
