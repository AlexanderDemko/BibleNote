function pageIdFromUrl() {
  const prefix = '/page/';
  if (location.pathname.startsWith(prefix)) {
    try {
      return decodeURIComponent(location.pathname.slice(prefix.length));
    } catch {
      return null;
    }
  }
  return new URLSearchParams(location.search).get('pageId');
}

function bibleLocationFromUrl() {
  const prefix = '/bible/';
  if (!location.pathname.startsWith(prefix)) return null;
  const parts = location.pathname.slice(prefix.length).split('/').filter(Boolean);
  if (parts.length < 3) return null;
  const params = new URLSearchParams(location.search);
  try {
    const module = decodeURIComponent(parts[0]);
    const bookIndex = Number(decodeURIComponent(parts[1]));
    const chapter = Number(decodeURIComponent(parts[2]));
    const verse = Number(params.get('verse') || '');
    const topChapter = Number(params.get('topChapter') || '');
    const topVerse = Number(params.get('topVerse') || '');
    if (!module || !Number.isInteger(bookIndex) || !Number.isInteger(chapter)) return null;
    return {
      module,
      bookIndex,
      chapter,
      verse:Number.isInteger(verse) && verse > 0 ? verse : undefined,
      topChapter:Number.isInteger(topChapter) && topChapter > 0 ? topChapter : undefined,
      topVerse:Number.isInteger(topVerse) && topVerse > 0 ? topVerse : undefined
    };
  } catch {
    return null;
  }
}

function paragraphIndexFromUrl() {
  const match = location.hash.match(/^#p-(\d+)$/);
  return match ? Number(match[1]) : undefined;
}

function pageUrl(pageId, paragraphIndex) {
  const hash = Number.isInteger(paragraphIndex) ? '#p-' + paragraphIndex : '';
  return '/page/' + encodeURIComponent(pageId) + hash;
}

function updatePageUrl(pageId, replace = false, paragraphIndex) {
  const nextUrl = pageId ? pageUrl(pageId, paragraphIndex) : '/';
  if (location.pathname + location.search + location.hash === nextUrl) return;
  const method = replace ? 'replaceState' : 'pushState';
  history[method]({ pageId:pageId || null, paragraphIndex:Number.isInteger(paragraphIndex) ? paragraphIndex : null }, '', nextUrl);
}

function bibleReaderUrl(readerLocation, ref) {
  const module = encodeURIComponent(readerLocation.module || currentBibleModule());
  const bookIndex = encodeURIComponent(String(readerLocation.bookIndex));
  const chapter = encodeURIComponent(String(readerLocation.chapter));
  const params = new URLSearchParams();
  const verse = Number(ref?.verse || readerLocation.verse || 0);
  const topChapter = Number(ref?.topChapter || readerLocation.topChapter || 0);
  const topVerse = Number(ref?.topVerse || readerLocation.topVerse || 0);
  if (Number.isInteger(verse) && verse > 0) params.set('verse', String(verse));
  if (Number.isInteger(topChapter) && topChapter > 0 && topChapter !== Number(readerLocation.chapter)) params.set('topChapter', String(topChapter));
  if (Number.isInteger(topVerse) && topVerse > 0 && topVerse !== verse) params.set('topVerse', String(topVerse));
  const query = params.toString();
  return '/bible/' + module + '/' + bookIndex + '/' + chapter + (query ? '?' + query : '');
}

function updateBibleReaderUrl(readerLocation, replace = false, ref) {
  const nextUrl = bibleReaderUrl(readerLocation, ref);
  if (location.pathname + location.search + location.hash === nextUrl) return;
  const method = replace ? 'replaceState' : 'pushState';
  history[method]({ bible:readerLocation }, '', nextUrl);
}

function updateTreeSelection(pageId) {
  tree.querySelectorAll('.tree-row.selected').forEach(item => item.classList.remove('selected'));
  if (!pageId) return;
  const selected = tree.querySelector('.tree-row[data-page-id="' + CSS.escape(String(pageId)) + '"]');
  if (selected) selected.classList.add('selected');
}

function scrollTreeSelectionIntoView(behavior = 'smooth') {
  const selected = tree.querySelector('.tree-row.selected');
  if (!selected) return;
  const selectedRect = selected.getBoundingClientRect();
  const treeRect = tree.getBoundingClientRect();
  const bottomPadding = 44;
  if (selectedRect.top >= treeRect.top && selectedRect.bottom <= treeRect.bottom - bottomPadding) return;
  const selectedCenter = selected.offsetTop + selected.offsetHeight / 2;
  tree.scrollTo({
    top:Math.max(0, selectedCenter - tree.clientHeight / 2),
    behavior
  });
}

function renderEmptyPage() {
  content.replaceChildren();
  const empty = document.createElement('div');
  empty.className = 'empty-state';
  const inner = document.createElement('div');
  const mark = document.createElement('span');
  mark.className = 'empty-mark';
  inner.append(mark, 'Выберите страницу слева');
  empty.append(inner);
  content.append(empty);
  refreshPageFind();
}

function visiblePageHtmlFrame() {
  const frame = content.querySelector('.html-frame');
  return frame && frame.style.display !== 'none' ? frame : null;
}

function setPageFindStatus(count, index = -1) {
  pageFindIndex = Number.isInteger(index) ? index : -1;
  const hasMatches = count > 0;
  pageFindCount.textContent = hasMatches ? (pageFindIndex + 1) + ' / ' + count : '0 / 0';
  pageFindPreviousButton.disabled = !hasMatches;
  pageFindNextButton.disabled = !hasMatches;
  pageFindInput.classList.toggle('no-results', Boolean(pageFindInput.value) && !hasMatches);
}

function clearPageFindMarks() {
  const marks = [...content.querySelectorAll('mark.page-find-match')];
  for (const mark of marks) {
    const parent = mark.parentNode;
    mark.replaceWith(document.createTextNode(mark.textContent || ''));
    parent?.normalize();
  }
  pageFindMatches = [];
  pageFindIndex = -1;
}

function clearPageFindFrames(exceptFrame) {
  for (const frame of content.querySelectorAll('.html-frame')) {
    if (frame === exceptFrame) continue;
    frame.contentWindow?.postMessage({ type:'onenote-page-find-clear' }, '*');
  }
}

function selectPageFindMatch(index, scroll = true) {
  if (pageFindMatches.length === 0) {
    setPageFindStatus(0);
    return;
  }
  pageFindMatches[pageFindIndex]?.classList.remove('page-find-current');
  pageFindIndex = (index + pageFindMatches.length) % pageFindMatches.length;
  const match = pageFindMatches[pageFindIndex];
  match.classList.add('page-find-current');
  setPageFindStatus(pageFindMatches.length, pageFindIndex);
  if (scroll) match.scrollIntoView({ block:'center', behavior:'smooth' });
}

function runTextPageFind(query) {
  clearPageFindMarks();
  const value = String(query || '');
  if (!value) {
    setPageFindStatus(0);
    return;
  }
  const root = content.querySelector('.page') || content;
  const nodes = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!node.nodeValue) return NodeFilter.FILTER_REJECT;
      const parent = node.parentElement;
      if (!parent || parent.closest('script,style,noscript,textarea,input,select,option,button,.page-actions,.match-nav,mark.page-find-match')) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    }
  });
  while (walker.nextNode()) nodes.push(walker.currentNode);
  const needle = value.toLocaleLowerCase();
  for (const node of nodes) {
    const text = node.nodeValue || '';
    const folded = text.toLocaleLowerCase();
    let cursor = 0;
    let index = folded.indexOf(needle);
    if (index < 0) continue;
    const fragment = document.createDocumentFragment();
    while (index >= 0) {
      if (index > cursor) fragment.append(document.createTextNode(text.slice(cursor, index)));
      const mark = document.createElement('mark');
      mark.className = 'page-find-match';
      mark.textContent = text.slice(index, index + value.length);
      fragment.append(mark);
      pageFindMatches.push(mark);
      cursor = index + value.length;
      index = folded.indexOf(needle, cursor);
    }
    if (cursor < text.length) fragment.append(document.createTextNode(text.slice(cursor)));
    node.replaceWith(fragment);
  }
  selectPageFindMatch(0);
}

function runPageFind() {
  if (pageFindWidget.classList.contains('hidden')) return;
  const query = pageFindInput.value;
  const frame = visiblePageHtmlFrame();
  clearPageFindMarks();
  clearPageFindFrames(frame);
  if (!query) {
    frame?.contentWindow?.postMessage({ type:'onenote-page-find-clear' }, '*');
    setPageFindStatus(0);
    return;
  }
  if (frame) {
    setPageFindStatus(0);
    frame.contentWindow?.postMessage({ type:'onenote-page-find', query }, '*');
    return;
  }
  runTextPageFind(query);
}

function refreshPageFind() {
  if (pageFindWidget.classList.contains('hidden')) return;
  requestAnimationFrame(runPageFind);
}

function movePageFind(delta) {
  const frame = visiblePageHtmlFrame();
  if (frame) {
    frame.contentWindow?.postMessage({ type:'onenote-page-find-next', query:pageFindInput.value, delta }, '*');
    return;
  }
  selectPageFindMatch(pageFindIndex + delta);
}

function openPageFind() {
  pageFindWidget.classList.remove('hidden');
  pageFindInput.focus();
  pageFindInput.select();
  runPageFind();
}

function closePageFind() {
  pageFindWidget.classList.add('hidden');
  clearPageFindMarks();
  clearPageFindFrames();
  setPageFindStatus(0);
  content.focus({ preventScroll:true });
}

pageFindInput.addEventListener('input', runPageFind);
pageFindInput.addEventListener('keydown', event => {
  if (event.key === 'Enter') {
    event.preventDefault();
    movePageFind(event.shiftKey ? -1 : 1);
  } else if (event.key === 'Escape') {
    event.preventDefault();
    event.stopPropagation();
    closePageFind();
  }
});
pageFindPreviousButton.addEventListener('click', () => movePageFind(-1));
pageFindNextButton.addEventListener('click', () => movePageFind(1));
pageFindCloseButton.addEventListener('click', closePageFind);
document.addEventListener('keydown', event => {
  const key = event.key.toLocaleLowerCase();
  const findKey = event.code === 'KeyF' || key === 'f';
  if ((event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && findKey) {
    event.preventDefault();
    openPageFind();
    return;
  }
  if (pageFindWidget.classList.contains('hidden')) return;
  if (event.key === 'F3') {
    event.preventDefault();
    movePageFind(event.shiftKey ? -1 : 1);
  } else if (event.key === 'Escape') {
    event.preventDefault();
    closePageFind();
  }
});

function loadSearchOptions() {
  try {
    const saved = JSON.parse(localStorage.getItem('onenote.searchOptions') || '{}');
    return { caseSensitive:Boolean(saved.caseSensitive), phrase:Boolean(saved.phrase), regex:Boolean(saved.regex) };
  } catch {
    return { caseSensitive:false, phrase:false, regex:false };
  }
}

function loadSearchHistory() {
  try {
    const saved = JSON.parse(localStorage.getItem('onenote.searchHistory') || '[]');
    return Array.isArray(saved) ? saved.filter(value => typeof value === 'string' && value.trim()).slice(0, 50) : [];
  } catch {
    return [];
  }
}

function saveSearchHistory() {
  localStorage.setItem('onenote.searchHistory', JSON.stringify(searchHistory.slice(0, 50)));
}

function rememberSearch(query) {
  const value = query.trim();
  if (!value) return;
  searchHistory = [value, ...searchHistory.filter(item => item !== value)].slice(0, 50);
  searchHistoryIndex = -1;
  saveSearchHistory();
  renderSearchHistoryMenu();
}

function removeSearchHistoryItem(query) {
  searchHistory = searchHistory.filter(item => item !== query);
  searchHistoryIndex = -1;
  saveSearchHistory();
  renderSearchHistoryMenu();
}

function renderSearchHistoryMenu() {
  searchHistoryMenu.replaceChildren();
  if (!searchHistory.length) {
    const empty = document.createElement('div');
    empty.className = 'search-history-empty';
    empty.textContent = 'История поиска пуста';
    searchHistoryMenu.append(empty);
    return;
  }
  for (const [index, query] of searchHistory.entries()) {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'search-history-row' + (index === searchHistoryIndex ? ' active' : '');
    row.setAttribute('role', 'option');
    row.setAttribute('aria-selected', String(index === searchHistoryIndex));
    row.title = query;
    const text = document.createElement('span');
    text.className = 'search-history-text';
    text.textContent = query;
    const remove = document.createElement('span');
    remove.className = 'search-history-remove';
    remove.setAttribute('role', 'button');
    remove.setAttribute('aria-label', 'Удалить из истории');
    remove.title = 'Удалить из истории';
    remove.textContent = '×';
    remove.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      removeSearchHistoryItem(query);
    });
    row.addEventListener('click', () => {
      useSearchHistoryQuery(query);
      hideSearchHistory();
    });
    row.append(text, remove);
    searchHistoryMenu.append(row);
  }
}

function showSearchHistory() {
  renderSearchHistoryMenu();
  searchHistoryMenu.classList.remove('hidden');
  searchHistoryButton.setAttribute('aria-expanded', 'true');
}

function hideSearchHistory() {
  searchHistoryMenu.classList.add('hidden');
  searchHistoryButton.setAttribute('aria-expanded', 'false');
}

function toggleSearchHistory() {
  if (searchHistoryMenu.classList.contains('hidden')) showSearchHistory(); else hideSearchHistory();
}

function useSearchHistoryQuery(query) {
  searchInput.value = query;
  searchInput.focus();
  rememberSearch(query);
  rerunSearch();
}

function stepSearchHistory(direction) {
  if (!searchHistory.length) {
    showSearchHistory();
    return;
  }
  if (searchHistoryIndex === -1) searchHistoryDraft = searchInput.value;
  searchHistoryIndex += direction;
  if (searchHistoryIndex < 0) {
    searchHistoryIndex = -1;
    searchInput.value = searchHistoryDraft;
  } else if (searchHistoryIndex >= searchHistory.length) {
    searchHistoryIndex = searchHistory.length - 1;
  } else {
    searchInput.value = searchHistory[searchHistoryIndex];
  }
  showSearchHistory();
  rerunSearch();
}

function scheduleSearchHistoryCommit() {
  clearTimeout(searchHistoryTimer);
  const query = searchInput.value.trim();
  if (!query) return;
  searchHistoryTimer = setTimeout(() => {
    if (searchInput.value.trim() === query) rememberSearch(query);
  }, 1200);
}

function updateSearchOptionButtons() {
  searchCaseButton.setAttribute('aria-pressed', String(searchOptions.caseSensitive));
  searchPhraseButton.setAttribute('aria-pressed', String(searchOptions.phrase));
  searchRegexButton.setAttribute('aria-pressed', String(searchOptions.regex));
}

function saveSearchOptions() {
  localStorage.setItem('onenote.searchOptions', JSON.stringify(searchOptions));
  updateSearchOptionButtons();
}

function searchRequest(query) {
  const quoted = !searchOptions.regex && query.length >= 2 && query.startsWith('"') && query.endsWith('"');
  return {
    query:quoted ? query.slice(1, -1) : query,
    mode:searchOptions.regex ? 'regex' : (searchOptions.phrase || quoted ? 'phrase' : 'and'),
    caseSensitive:searchOptions.caseSensitive
  };
}

function looksLikeBibleReferenceSearch(query) {
  if (!query) return false;
  const request = searchRequest(query);
  if (request.mode === 'regex') return false;
  return /(?:bnVerse:|isbtBibleVerse:|\d+\s*[:,]\s*\d+)/i.test(request.query)
    && /[\p{L}]/u.test(request.query);
}

function pageHighlightQuery(options = {}) {
  if (typeof options.highlightQuery === 'string') return options.highlightQuery;
  return currentTargetParagraphIndexes.length > 0 && looksLikeBibleReferenceSearch(activeSearchQuery)
    ? ''
    : activeSearchQuery;
}

function rerunSearch() {
  const query = searchInput.value.trim();
  activeSearchQuery = query;
  if (query) renderSearch(query).catch(showError);
  else {
    renderTree().catch(showError);
    updateOpenPageSearchMatches(null, '');
  }
}

searchHistoryButton.addEventListener('click', event => {
  event.preventDefault();
  searchHistoryIndex = -1;
  searchHistoryDraft = searchInput.value;
  toggleSearchHistory();
  searchInput.focus();
});

searchCaseButton.addEventListener('click', () => {
  searchOptions.caseSensitive = !searchOptions.caseSensitive;
  saveSearchOptions();
  rerunSearch();
});
searchPhraseButton.addEventListener('click', () => {
  searchOptions.phrase = !searchOptions.phrase;
  if (searchOptions.phrase) searchOptions.regex = false;
  saveSearchOptions();
  rerunSearch();
});
searchRegexButton.addEventListener('click', () => {
  searchOptions.regex = !searchOptions.regex;
  if (searchOptions.regex) searchOptions.phrase = false;
  saveSearchOptions();
  rerunSearch();
});
