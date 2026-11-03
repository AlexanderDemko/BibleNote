const workspaceTabListEl = document.getElementById('workspaceTabList');
const newWorkspaceTabButton = document.getElementById('newWorkspaceTab');

let workspaceTabSequence = 0;
let workspaceTabs = [];
let activeWorkspaceTabId = '';
let draggedWorkspaceTabId = '';
let workspaceSessionReady = false;
let workspaceSessionSaveTimer;

function captureWorkspaceTabView(tab) {
  if (!tab || tab.pane.hidden || tab.pendingViewRestore || tab.needsReload || tab.needsBibleReload
      || tab.pane.hasAttribute('aria-busy')) return;
  const article = tab.pane.querySelector('article');
  if (!article || (tab.type === 'page' && article.dataset.pageId !== tab.pageId)) return;
  const frame = article.querySelector('.html-frame');
  tab.viewState = {
    contentScrollTop:tab.pane.scrollTop,
    contentScrollLeft:tab.pane.scrollLeft,
    pageZoom:articlePageZoom(article),
    visualView:article.classList.contains('html-view-active'),
    frameViewState:frame?.workspaceViewState
  };
}

function scheduleWorkspaceSessionSave() {
  clearTimeout(workspaceSessionSaveTimer);
  workspaceSessionSaveTimer = setTimeout(saveWorkspaceSession, 150);
}

// Frames can have an opaque origin. Accept state only from a frame belonging to a tab.
window.addEventListener('message', event => {
  if (event.data?.type !== 'onenote-page-view-state') return;
  const tab = workspaceTabs.find(candidate =>
    candidate.pane.querySelector('.html-frame')?.contentWindow === event.source);
  if (!tab || tab.pane.hidden || tab.pendingViewRestore) return;
  const frame = tab.pane.querySelector('.html-frame');
  const data = event.data;
  frame.workspaceViewState = {
    kind:frame.classList.contains('pdf-frame') ? 'pdf' : 'html',
    scrollTop:Math.max(0, Number(data.scrollTop) || 0),
    scrollLeft:Math.max(0, Number(data.scrollLeft) || 0),
    pageNumber:Number.isInteger(data.pageNumber) ? data.pageNumber : undefined,
    zoom:Number(data.zoom) > 0 ? Number(data.zoom) : undefined
  };
  captureWorkspaceTabView(tab);
  scheduleWorkspaceSessionSave();
});

function restoreWorkspaceTabView(tab, article) {
  const state = tab?.pendingViewRestore;
  if (!state || !article) return;
  const isCurrent = () => tab.pendingViewRestore === state && article.isConnected && !tab.pane.hidden;
  const frame = article.querySelector('.html-frame');
  if (frame && state.frameViewState) {
    frame.workspaceViewState = state.frameViewState;
    restorePageFrameViewState(frame, state.frameViewState);
  }
  // Run after the reader's initial target navigation and layout.
  requestAnimationFrame(() => requestAnimationFrame(() => {
    if (!isCurrent()) return;
    tab.pane.scrollTo({
      top:Math.max(0, Number(state.contentScrollTop) || 0),
      left:Math.max(0, Number(state.contentScrollLeft) || 0),
      behavior:'instant'
    });
    if (!frame) {
      tab.pendingViewRestore = undefined;
      saveWorkspaceSession();
    }
  }));
  // The frame bridge retries after layout; keep the saved position until it finishes.
  if (frame) setTimeout(() => {
    if (!isCurrent()) return;
    tab.pendingViewRestore = undefined;
    saveWorkspaceSession();
  }, 700);
}

function workspaceStartupMode() {
  return localStorage.getItem('biblenote.tabs.startupMode') === 'restore' ? 'restore' : 'empty';
}

function saveWorkspaceSession() {
  if (!workspaceSessionReady || bibleVersePopupMode) return;
  try {
    captureWorkspaceTabState();
    localStorage.setItem('biblenote.tabs.session', JSON.stringify({
      version:1,
      activeIndex:workspaceTabs.findIndex(tab => tab.id === activeWorkspaceTabId),
      tabs:workspaceTabs.map(tab => ({
        type:tab.type,
        title:tab.title,
        pageId:tab.pageId,
        paragraphIndex:tab.currentTargetParagraphIndex,
        bibleLocation:tab.bibleLocation,
        dedicatedBible:tab.dedicatedBible,
        viewState:tab.viewState
      }))
    }));
  } catch (error) {
    console.warn('Не удалось сохранить вкладки:', error);
  }
}

function restoreWorkspaceSession() {
  if (workspaceStartupMode() !== 'restore' || bibleVersePopupMode) return false;
  let session;
  try {
    session = JSON.parse(localStorage.getItem('biblenote.tabs.session') || 'null');
  } catch {
    return false;
  }
  if (session?.version !== 1 || !Array.isArray(session.tabs) || !session.tabs.length) return false;
  const validTabs = session.tabs.map((saved, index) => ({ saved, index })).filter(({ saved }) => {
    if (saved?.type === 'empty') return true;
    if (saved?.type === 'page') return typeof saved.pageId === 'string' && saved.pageId.length > 0;
    const ref = saved?.bibleLocation;
    return saved?.type === 'bible' && typeof ref?.module === 'string' && ref.module.length > 0
      && Number.isInteger(ref.bookIndex) && ref.bookIndex > 0
      && Number.isInteger(ref.chapter) && ref.chapter > 0;
  });
  if (!validTabs.length) return false;

  renderEmptyPage();
  // Create the panes before assigning saved state: creation captures the current tab.
  const restored = [activeWorkspaceTab()];
  for (let index = 1; index < validTabs.length; index++) {
    restored.push(createWorkspaceTab({ activate:false }));
  }
  validTabs.forEach(({ saved }, index) => {
    const tab = restored[index];
    const paragraphIndex = Number.isInteger(saved.paragraphIndex) && saved.paragraphIndex >= 0
      ? saved.paragraphIndex : undefined;
    Object.assign(tab, {
      type:saved.type,
      title:typeof saved.title === 'string' ? saved.title : 'Новая вкладка',
      pageId:saved.type === 'page' ? saved.pageId : undefined,
      selectedPageId:saved.type === 'page' ? saved.pageId : null,
      currentTargetParagraphIndex:paragraphIndex,
      bibleLocation:saved.type === 'bible' ? saved.bibleLocation : undefined,
      dedicatedBible:saved.type === 'bible' && saved.dedicatedBible === true,
      needsReload:saved.type === 'page',
      needsBibleReload:saved.type === 'bible',
      viewState:saved.viewState,
      pendingViewRestore:saved.viewState,
      url:saved.type === 'page' ? pageUrl(saved.pageId, paragraphIndex)
        : saved.type === 'bible' ? bibleReaderUrl(saved.bibleLocation) : '/'
    });
    tab.pane.hidden = true;
    tab.pane.inert = true;
    tab.pane.removeAttribute('id');
  });
  activeWorkspaceTabId = '';
  const activeIndex = validTabs.findIndex(entry => entry.index === session.activeIndex);
  switchWorkspaceTab(restored[Math.max(0, activeIndex)].id);
  return true;
}

window.addEventListener('pagehide', saveWorkspaceSession);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') saveWorkspaceSession();
});

function clearWorkspaceTabDropIndicators() {
  for (const tab of workspaceTabListEl.querySelectorAll('.workspace-tab')) {
    tab.classList.remove('dragging', 'drop-before', 'drop-after');
  }
}

function moveWorkspaceTab(tabId, targetTabId, afterTarget) {
  if (!tabId || !targetTabId || tabId === targetTabId) return false;
  const sourceIndex = workspaceTabs.findIndex(tab => tab.id === tabId);
  if (sourceIndex < 0 || !workspaceTabs.some(tab => tab.id === targetTabId)) return false;
  const [moved] = workspaceTabs.splice(sourceIndex, 1);
  const targetIndex = workspaceTabs.findIndex(tab => tab.id === targetTabId);
  workspaceTabs.splice(targetIndex + (afterTarget ? 1 : 0), 0, moved);
  renderWorkspaceTabs();
  return true;
}

function moveWorkspaceTabByOffset(tabId, offset) {
  const index = workspaceTabs.findIndex(tab => tab.id === tabId);
  const target = workspaceTabs[index + offset];
  if (index < 0 || !target) return false;
  const moved = moveWorkspaceTab(tabId, target.id, offset > 0);
  if (moved) workspaceTabListEl.querySelector(`[data-tab-id="${tabId}"]`)?.focus();
  return moved;
}

function workspaceTabEmptyState() {
  return {
    selectedPageId:null,
    currentTargetParagraphIndex:undefined,
    currentTargetParagraphIndexes:[],
    currentTargetBibleOccurrences:[],
    viewHistory:[],
    viewHistoryIndex:-1,
    pendingPageRefreshToken:0,
    activePageAbortController:undefined
  };
}

function createWorkspacePane(reusePane) {
  const pane = reusePane || document.createElement('main');
  pane.className = 'content workspace-tab-pane';
  pane.tabIndex = -1;
  pane.addEventListener('scroll', () => {
    captureWorkspaceTabView(workspaceTabs.find(tab => tab.pane === pane));
    scheduleWorkspaceSessionSave();
  }, { passive:true });
  if (!reusePane) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    const inner = document.createElement('div');
    const mark = document.createElement('span');
    mark.className = 'empty-mark';
    inner.append(mark, 'Выберите страницу слева');
    empty.append(inner);
    pane.append(empty);
    content.parentElement.insertBefore(pane, contentScrollbar);
  }
  return pane;
}

function workspaceTabIcon(type) {
  if (type === 'bible') return '▤';
  if (type === 'page') return '▱';
  return '＋';
}

function activeWorkspaceTab() {
  return workspaceTabs.find(tab => tab.id === activeWorkspaceTabId);
}

function captureWorkspaceTabState(tab = activeWorkspaceTab()) {
  if (!tab) return;
  captureWorkspaceTabView(tab);
  tab.selectedPageId = selectedPageId;
  tab.currentTargetParagraphIndex = currentTargetParagraphIndex;
  tab.currentTargetParagraphIndexes = [...currentTargetParagraphIndexes];
  tab.currentTargetBibleOccurrences = [...currentTargetBibleOccurrences];
  tab.viewHistory = viewHistory;
  tab.viewHistoryIndex = viewHistoryIndex;
  tab.pendingPageRefreshToken = pendingPageRefreshToken;
  tab.activePageAbortController = activePageAbortController;
  tab.url = location.pathname + location.search + location.hash;
}

function restoreWorkspaceTabState(tab) {
  selectedPageId = tab.selectedPageId;
  currentTargetParagraphIndex = tab.currentTargetParagraphIndex;
  currentTargetParagraphIndexes = [...tab.currentTargetParagraphIndexes];
  currentTargetBibleOccurrences = [...tab.currentTargetBibleOccurrences];
  viewHistory = tab.viewHistory;
  viewHistoryIndex = tab.viewHistoryIndex;
  pendingPageRefreshToken = tab.pendingPageRefreshToken;
  activePageAbortController = tab.activePageAbortController;
}

function restoreWorkspaceBibleControls(tab) {
  const location = tab?.type === 'bible' ? tab.bibleLocation : undefined;
  if (!location || typeof fillBibleReaderChapters !== 'function') return;
  if (bibleReaderModulesPromise) {
    bibleReaderModulesPromise.then(() => {
      if (activeWorkspaceTab()?.id === tab.id) restoreWorkspaceBibleControls(tab);
    }).catch(error => console.warn(error));
    return;
  }
  if (bibleReaderModuleEl.disabled || !bibleReaderModules.length) return;
  const applyLocation = () => {
    if (activeWorkspaceTab()?.id !== tab.id) return;
    bibleReaderModuleEl.value = location.module;
    saveBibleReaderState();
    bibleReaderBookEl.value = String(location.bookIndex);
    fillBibleReaderChapters(Number(location.chapter));
    bibleReaderChapterEl.value = String(location.chapter);
    updateBibleReaderNavButtons();
    syncBibleReaderTranslationModules();
    for (const control of tab.pane.querySelectorAll('.bible-reader-translations')) {
      control.replaceWith(createBibleReaderTranslationsControl());
    }
  };
  const hasBook = [...bibleReaderBookEl.options].some(option => Number(option.value) === Number(location.bookIndex));
  if (bibleReaderModuleEl.value === location.module && hasBook) {
    applyLocation();
    return;
  }
  bibleReaderModuleEl.value = location.module;
  refreshBibleReaderBooks(Number(location.bookIndex), Number(location.chapter))
    .then(applyLocation)
    .catch(error => console.warn(error));
}

function renderWorkspaceTabs() {
  workspaceTabListEl.replaceChildren();
  for (const tab of workspaceTabs) {
    const button = document.createElement('div');
    button.className = 'workspace-tab' + (tab.id === activeWorkspaceTabId ? ' active' : '');
    button.tabIndex = 0;
    button.dataset.tabId = tab.id;
    button.setAttribute('role', 'tab');
    button.setAttribute('aria-selected', String(tab.id === activeWorkspaceTabId));
    button.setAttribute('aria-label', tab.title);
    button.title = tab.title;
    button.draggable = true;
    button.setAttribute('aria-roledescription', 'перетаскиваемая вкладка');

    const icon = document.createElement('span');
    icon.className = 'workspace-tab-icon';
    icon.textContent = workspaceTabIcon(tab.type);
    icon.setAttribute('aria-hidden', 'true');
    const label = document.createElement('span');
    label.className = 'workspace-tab-label';
    label.textContent = tab.title;
    const close = document.createElement('button');
    close.className = 'workspace-tab-close';
    close.type = 'button';
    close.textContent = '×';
    close.title = 'Закрыть вкладку';
    close.setAttribute('aria-label', 'Закрыть вкладку «' + tab.title + '»');
    close.addEventListener('pointerdown', event => {
      event.stopPropagation();
      button.draggable = false;
    });
    const restoreDrag = () => { button.draggable = true; };
    close.addEventListener('pointerup', restoreDrag);
    close.addEventListener('pointercancel', restoreDrag);
    close.addEventListener('pointerleave', restoreDrag);
    close.addEventListener('click', event => {
      event.stopPropagation();
      closeWorkspaceTab(tab.id);
    });
    button.append(icon, label, close);
    button.addEventListener('click', () => switchWorkspaceTab(tab.id));
    button.addEventListener('keydown', event => {
      if (event.altKey && event.shiftKey && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
        event.preventDefault();
        moveWorkspaceTabByOffset(tab.id, event.key === 'ArrowLeft' ? -1 : 1);
        return;
      }
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      switchWorkspaceTab(tab.id);
    });
    button.addEventListener('auxclick', event => {
      if (event.button === 1) closeWorkspaceTab(tab.id);
    });
    button.addEventListener('dragstart', event => {
      draggedWorkspaceTabId = tab.id;
      button.classList.add('dragging');
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', tab.id);
    });
    button.addEventListener('dragover', event => {
      if (!draggedWorkspaceTabId || draggedWorkspaceTabId === tab.id) return;
      event.preventDefault();
      clearWorkspaceTabDropIndicators();
      workspaceTabListEl.querySelector(`[data-tab-id="${draggedWorkspaceTabId}"]`)?.classList.add('dragging');
      const bounds = button.getBoundingClientRect();
      button.classList.add(event.clientX >= bounds.left + bounds.width / 2 ? 'drop-after' : 'drop-before');
      event.dataTransfer.dropEffect = 'move';
    });
    button.addEventListener('drop', event => {
      if (!draggedWorkspaceTabId || draggedWorkspaceTabId === tab.id) return;
      event.preventDefault();
      const bounds = button.getBoundingClientRect();
      const afterTarget = event.clientX >= bounds.left + bounds.width / 2;
      const draggedId = draggedWorkspaceTabId;
      draggedWorkspaceTabId = '';
      clearWorkspaceTabDropIndicators();
      moveWorkspaceTab(draggedId, tab.id, afterTarget);
    });
    button.addEventListener('dragend', () => {
      draggedWorkspaceTabId = '';
      clearWorkspaceTabDropIndicators();
    });
    workspaceTabListEl.append(button);
  }
  workspaceTabListEl.querySelector('.workspace-tab.active')?.scrollIntoView({ block:'nearest', inline:'nearest' });
  saveWorkspaceSession();
}

function switchWorkspaceTab(tabId, options = {}) {
  const next = workspaceTabs.find(tab => tab.id === tabId);
  const current = activeWorkspaceTab();
  if (!next || next === current) return next;

  if (typeof closePageFind === 'function' && !pageFindWidget.classList.contains('hidden')) closePageFind();
  if (current) {
    captureWorkspaceTabState(current);
    if (current.pane.hasAttribute('aria-busy')) {
      current.needsReload = current.type === 'page' && Boolean(current.pageId);
      current.activePageAbortController?.abort();
    }
    current.pane.hidden = true;
    current.pane.inert = true;
    current.pane.removeAttribute('id');
  }

  activeWorkspaceTabId = next.id;
  content = next.pane;
  content.hidden = false;
  content.inert = false;
  content.id = 'content';
  restoreWorkspaceTabState(next);
  restoreWorkspaceBibleControls(next);
  if (typeof setPageFocusMode === 'function') {
    setPageFocusMode(pageFocusMode, workspaceTabFocusPage(next));
  }
  if (typeof updateTreeSelection === 'function') updateTreeSelection(selectedPageId);
  if (typeof updateViewHistoryButtons === 'function') updateViewHistoryButtons();
  if (typeof refreshPageFind === 'function') refreshPageFind();
  if (typeof updateContentScrollbar === 'function') updateContentScrollbar();
  if (options.updateUrl !== false) {
    const nextUrl = next.url || '/';
    if (location.pathname + location.search + location.hash !== nextUrl) history.replaceState(null, '', nextUrl);
  }
  renderWorkspaceTabs();
  if (next.needsReload && next.type === 'page' && next.pageId) {
    next.pendingLoad = new Promise(resolve => setTimeout(resolve, 0)).then(async () => {
      if (activeWorkspaceTab() !== next) return;
      next.needsReload = false;
      await openPage(next.pageId, {
        updateUrl:false,
        rememberHistory:false,
        tabMode:'current',
        restoreWorkspaceView:true,
        visualView:next.viewState?.visualView,
        pageZoom:next.viewState?.pageZoom
      });
    }).catch(showError);
  }
  if (next.needsBibleReload && next.type === 'bible' && next.bibleLocation) {
    next.pendingLoad = new Promise(resolve => setTimeout(resolve, 0)).then(async () => {
      if (activeWorkspaceTab() !== next) return;
      next.needsBibleReload = false;
      await openBibleReaderLocation(next.bibleLocation, {
        rememberHistory:false,
        updateUrl:false,
        tabMode:'current',
        restoreWorkspaceView:true
      });
    }).catch(showError);
  }
  if (!next.needsReload && !next.needsBibleReload && !next.pane.hasAttribute('aria-busy')) {
    restoreWorkspaceTabView(next, next.pane.querySelector('article'));
  }
  return next;
}

function createWorkspaceTab(options = {}) {
  const current = activeWorkspaceTab();
  captureWorkspaceTabState(current);
  if (current?.pane.hasAttribute('aria-busy')) {
    current.needsReload = current.type === 'page' && Boolean(current.pageId);
    current.activePageAbortController?.abort();
  }
  const id = 'workspace-tab-' + ++workspaceTabSequence;
  const pane = createWorkspacePane(options.reusePane);
  const state = workspaceTabEmptyState();
  const tab = {
    id,
    pane,
    title:options.title || 'Новая вкладка',
    type:options.type || 'empty',
    pageId:options.pageId,
    bibleLocation:options.bibleLocation,
    dedicatedBible:Boolean(options.dedicatedBible),
    url:options.url || '/',
    ...state
  };
  pane.dataset.tabId = id;
  workspaceTabs.push(tab);
  if (options.activate !== false) {
    const previous = current;
    if (previous) {
      previous.pane.hidden = true;
      previous.pane.inert = true;
      previous.pane.removeAttribute('id');
    }
    activeWorkspaceTabId = id;
    content = pane;
    pane.hidden = false;
    pane.inert = false;
    pane.id = 'content';
    restoreWorkspaceTabState(tab);
    if (typeof setPageFocusMode === 'function') {
      setPageFocusMode(pageFocusMode, workspaceTabFocusPage(tab));
    }
    if (typeof updateTreeSelection === 'function') updateTreeSelection(null);
    if (typeof updateViewHistoryButtons === 'function') updateViewHistoryButtons();
    history.replaceState(null, '', tab.url);
  } else {
    pane.hidden = true;
    pane.inert = true;
    pane.removeAttribute('id');
  }
  renderWorkspaceTabs();
  if (typeof updateContentScrollbar === 'function') updateContentScrollbar();
  return tab;
}

function resetOnlyWorkspaceTab(tab) {
  tab.activePageAbortController?.abort();
  Object.assign(tab, workspaceTabEmptyState(), {
    title:'Новая вкладка',
    type:'empty',
    pageId:undefined,
    bibleLocation:undefined,
    dedicatedBible:false,
    viewState:undefined,
    pendingViewRestore:undefined,
    url:'/'
  });
  restoreWorkspaceTabState(tab);
  renderEmptyPage();
  updateTreeSelection(null);
  history.replaceState(null, '', '/');
  renderWorkspaceTabs();
}

function closeWorkspaceTab(tabId = activeWorkspaceTabId) {
  const index = workspaceTabs.findIndex(tab => tab.id === tabId);
  if (index < 0) return;
  const tab = workspaceTabs[index];
  if (workspaceTabs.length === 1) {
    resetOnlyWorkspaceTab(tab);
    return;
  }
  tab.activePageAbortController?.abort();
  const wasActive = tab.id === activeWorkspaceTabId;
  tab.pane.remove();
  workspaceTabs.splice(index, 1);
  if (wasActive) {
    activeWorkspaceTabId = '';
    switchWorkspaceTab(workspaceTabs[Math.min(index, workspaceTabs.length - 1)].id);
  } else {
    renderWorkspaceTabs();
  }
}

function workspaceTabFocusPage(tab) {
  if (tab.type === 'page' && tab.focusPage?.id === tab.pageId) return tab.focusPage;
  return { id:tab.type === 'page' ? tab.pageId : undefined, title:tab.title };
}

function updateActiveWorkspaceTab(details = {}) {
  const tab = activeWorkspaceTab();
  if (!tab) return;
  Object.assign(tab, details);
  if (typeof setPageFocusMode === 'function' && pageFocusMode) {
    setPageFocusMode(true, workspaceTabFocusPage(tab));
  }
  tab.url = location.pathname + location.search + location.hash;
  captureWorkspaceTabState(tab);
  renderWorkspaceTabs();
}

function bibleWorkspaceTabMode() {
  const value = localStorage.getItem('biblenote.tabs.bibleOpenMode');
  return ['current', 'dedicated', 'new'].includes(value) ? value : 'dedicated';
}

function prepareWorkspaceTabForPage(id, options = {}) {
  if (options.tabMode === 'new') createWorkspaceTab();
  if (!options.restoreWorkspaceView) activeWorkspaceTab().pendingViewRestore = undefined;
  updateActiveWorkspaceTab({ type:'page', pageId:id, title:'Загрузка…', dedicatedBible:false });
  return activeWorkspaceTab();
}

function prepareWorkspaceTabForBible(options = {}) {
  const current = activeWorkspaceTab();
  if (!current) return createWorkspaceTab({ type:'bible', title:'Библия' });
  if (current.type === 'bible' || current.type === 'empty' || options.tabMode === 'current') {
    updateActiveWorkspaceTab({ type:'bible', title:current.type === 'empty' ? 'Библия' : current.title });
    return current;
  }
  const mode = options.tabMode === 'new' ? 'new' : bibleWorkspaceTabMode();
  if (mode === 'current') {
    updateActiveWorkspaceTab({ type:'bible', title:'Библия', dedicatedBible:false });
    return current;
  }
  if (mode === 'dedicated') {
    const existing = workspaceTabs.find(tab => tab.dedicatedBible);
    if (existing) {
      switchWorkspaceTab(existing.id);
      return existing;
    }
  }
  return createWorkspaceTab({ type:'bible', title:'Библия', dedicatedBible:mode === 'dedicated' });
}

function workspacePageOpenOptions(event, options = {}) {
  return event && (event.ctrlKey || event.metaKey || event.button === 1)
    ? { ...options, tabMode:'new' }
    : options;
}

function openPageFromWorkspaceEvent(event, pageId, options = {}) {
  if (event.button != null && event.button !== 0 && event.button !== 1) return;
  event.preventDefault();
  openPage(pageId, workspacePageOpenOptions(event, options)).catch(showError);
}

function bindWorkspacePageOpen(button, pageId, options = {}, behavior = {}) {
  const open = event => {
    if (behavior.ignoreIfActive && pageId === selectedPageId && !event.ctrlKey && !event.metaKey && event.button !== 1) return;
    openPageFromWorkspaceEvent(
      event,
      pageId,
      typeof options === 'function' ? options() : options
    );
  };
  button.addEventListener('click', open);
  button.addEventListener('auxclick', event => {
    if (event.button === 1) open(event);
  });
}

function initializeWorkspaceTabs() {
  const initialPane = content;
  initialPane.classList.add('workspace-tab-pane');
  const initialTitle = pageIdFromUrl?.() ? 'Загрузка…' : (bibleLocationFromUrl?.() ? 'Библия' : 'Новая вкладка');
  createWorkspaceTab({
    reusePane:initialPane,
    title:initialTitle,
    type:pageIdFromUrl?.() ? 'page' : (bibleLocationFromUrl?.() ? 'bible' : 'empty'),
    url:location.pathname + location.search + location.hash
  });
}

newWorkspaceTabButton.addEventListener('click', () => createWorkspaceTab());
function switchWorkspaceTabByNumber(number) {
  if (bibleVersePopupMode || !Number.isInteger(number) || number < 1 || number > 9) return;
  const tab = workspaceTabs[number - 1];
  if (!tab) return;
  switchWorkspaceTab(tab.id);
  tab.pane.focus({ preventScroll:true });
}

window.addEventListener('message', event => {
  if (event.data?.type !== 'onenote-workspace-tab-select') return;
  const frame = content.querySelector('iframe.html-frame, iframe.pdf-frame');
  if (!frame || event.source !== frame.contentWindow) return;
  switchWorkspaceTabByNumber(event.data.number);
});

document.addEventListener('keydown', event => {
  if (event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey && /^[1-9]$/.test(event.key)) {
    event.preventDefault();
    switchWorkspaceTabByNumber(Number(event.key));
    return;
  }
  if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
  if (event.key.toLocaleLowerCase() === 't') {
    event.preventDefault();
    createWorkspaceTab();
  } else if (event.key.toLocaleLowerCase() === 'w') {
    event.preventDefault();
    closeWorkspaceTab();
  } else if (event.key === 'Tab') {
    event.preventDefault();
    const index = workspaceTabs.findIndex(tab => tab.id === activeWorkspaceTabId);
    const step = event.shiftKey ? -1 : 1;
    const next = (index + step + workspaceTabs.length) % workspaceTabs.length;
    switchWorkspaceTab(workspaceTabs[next].id);
  }
});

initializeWorkspaceTabs();
