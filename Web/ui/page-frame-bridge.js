'use strict';

(function startPageFrameBridge() {
  let pageZoom = 1;

  function postToParent(message) {
    parent.postMessage(message, '*');
  }

  function applyPageZoom(zoom, notifyParent = false) {
    pageZoom = Math.max(0.5, Math.min(3, Number(zoom) || 1));
    document.documentElement.style.zoom = String(pageZoom);
    if (notifyParent) {
      postToParent({ type:'onenote-page-zoom-change', percent:Math.round(pageZoom * 100) });
    }
  }

  function decodeSafe(value) {
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }

  function normalizeBibleHref(href) {
    return String(href || '')
      .trim()
      .replace(/^https?:\/\/isbtBibleVerse:/i, 'isbtBibleVerse:')
      .replace(/^https?:\/\/bnVerse:/i, 'bnVerse:');
  }

  function isBibleHref(href) {
    const pattern = /^(?:isbtBibleVerse|bnVerse):/i;
    return pattern.test(normalizeBibleHref(href))
      || pattern.test(normalizeBibleHref(decodeSafe(href || '')));
  }

  function scrollInternalDocumentLink(link) {
    const href = String(link?.getAttribute?.('href') || '').trim();
    if (!href.startsWith('#')) return false;
    const id = decodeSafe(href.slice(1));
    const target = id
      ? document.getElementById(id) || document.getElementsByName(id)[0]
      : null;
    target?.scrollIntoView({ block:'center' });
    return true;
  }

  document.addEventListener('click', event => {
    const target = event.target;
    const link = target?.closest?.('a[href]');
    if (!link) return;
    const href = link.getAttribute('data-onenote-bible-href') || link.getAttribute('href') || '';
    if (!isBibleHref(href)) return;
    event.preventDefault();
    event.stopPropagation();
    postToParent({ type:'onenote-bible-link', href:normalizeBibleHref(decodeSafe(href)) });
  }, true);

  document.addEventListener('click', event => {
    const link = event.target?.closest?.('a[href]');
    if (!link || !scrollInternalDocumentLink(link)) return;
    event.preventDefault();
    event.stopPropagation();
  }, true);

  document.addEventListener('keydown', event => {
    const key = String(event.key || '').toLocaleLowerCase();
    const findKey = event.code === 'KeyF' || key === 'f';
    if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey || !findKey) return;
    event.preventDefault();
    event.stopPropagation();
    postToParent({ type:'onenote-page-find-open' });
  }, true);

  function escapeRegex(value) {
    return String(value || '').replace(/[.*+?^\x24{}()|[\]\\]/g, '\\$&');
  }

  function normalizeMainSearch(value) {
    if (!value || typeof value !== 'object') return undefined;
    const query = String(value.query || '');
    if (!query) return undefined;
    const requestedMode = String(value.mode || 'and');
    const mode = ['and', 'phrase', 'regex'].includes(requestedMode) ? requestedMode : 'and';
    const terms = mode === 'and'
      ? [...new Set((Array.isArray(value.terms) ? value.terms : [])
        .map(term => String(term || '').trim())
        .filter(Boolean))]
      : [];
    return { query, mode, caseSensitive:Boolean(value.caseSensitive), terms };
  }

  function mainSearchKey(search) {
    return search ? JSON.stringify(search) : '';
  }

  function mainSearchRegex(search) {
    if (!search) return undefined;
    let source;
    if (search.mode === 'regex') {
      source = search.query;
    } else if (search.mode === 'phrase') {
      const terms = search.query.match(/[\p{L}\p{N}_]+/gu) ?? [];
      source = terms.length > 0
        ? `(?<![\\p{L}\\p{N}_])${terms.map(escapeRegex).join('[^\\p{L}\\p{N}_]+')}(?![\\p{L}\\p{N}_])`
        : escapeRegex(search.query);
    } else {
      if (search.terms.length === 0) return undefined;
      source = search.terms.map(escapeRegex).join('|');
    }
    try {
      return new RegExp(source, 'gu' + (search.caseSensitive ? '' : 'i'));
    } catch {
      return undefined;
    }
  }

  let mainSearchMarks = [];
  let mainSearchIndex = -1;
  let activeMainSearchKey = '';

  function sendMainSearchResult() {
    postToParent({
      type:'onenote-main-search-result',
      searchKey:activeMainSearchKey,
      count:mainSearchMarks.length,
      index:mainSearchIndex
    });
  }

  function clearMainSearch() {
    document.querySelectorAll('[data-onenote-main-search]').forEach(mark => {
      const parentNode = mark.parentNode;
      mark.replaceWith(document.createTextNode(mark.textContent || ''));
      parentNode?.normalize();
    });
    mainSearchMarks = [];
    mainSearchIndex = -1;
  }

  function selectMainSearch(index, scroll) {
    mainSearchMarks.forEach(mark => mark.removeAttribute('data-onenote-main-search-current'));
    if (mainSearchMarks.length === 0) {
      mainSearchIndex = -1;
      sendMainSearchResult();
      return;
    }
    mainSearchIndex = Number(index) || 0;
    mainSearchIndex = (mainSearchIndex + mainSearchMarks.length) % mainSearchMarks.length;
    const mark = mainSearchMarks[mainSearchIndex];
    mark.setAttribute('data-onenote-main-search-current', 'true');
    if (scroll !== false) mark.scrollIntoView({ block:'center', behavior:'smooth' });
    sendMainSearchResult();
  }

  function searchableTextNodes(excludedSelector) {
    const nodes = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const parentNode = node.parentElement;
        return node.nodeValue && parentNode && !parentNode.closest(excludedSelector)
          ? NodeFilter.FILTER_ACCEPT
          : NodeFilter.FILTER_REJECT;
      }
    });
    while (walker.nextNode()) nodes.push(walker.currentNode);
    return nodes;
  }

  function runMainSearch(value, index, scroll) {
    clearMainSearch();
    const search = normalizeMainSearch(value);
    activeMainSearchKey = mainSearchKey(search);
    const regex = mainSearchRegex(search);
    if (!regex) {
      sendMainSearchResult();
      return;
    }
    for (const node of searchableTextNodes('script,style,noscript,textarea,[data-onenote-page-find],[data-onenote-main-search]')) {
      const text = node.nodeValue || '';
      let cursor = 0;
      let found = false;
      const fragment = document.createDocumentFragment();
      for (const match of text.matchAll(regex)) {
        const matchText = match[0] || '';
        if (!matchText) continue;
        const matchIndex = Number(match.index) || 0;
        if (matchIndex < cursor) continue;
        if (matchIndex > cursor) fragment.append(document.createTextNode(text.slice(cursor, matchIndex)));
        const mark = document.createElement('mark');
        mark.setAttribute('data-onenote-main-search', 'true');
        mark.textContent = matchText;
        fragment.append(mark);
        mainSearchMarks.push(mark);
        cursor = matchIndex + matchText.length;
        found = true;
      }
      if (!found) continue;
      if (cursor < text.length) fragment.append(document.createTextNode(text.slice(cursor)));
      node.replaceWith(fragment);
    }
    selectMainSearch(index, scroll);
  }

  let pageFindMarks = [];
  let pageFindIndex = -1;
  let pageFindQuery = '';

  function sendPageFindResult() {
    postToParent({
      type:'onenote-page-find-result',
      query:pageFindQuery,
      count:pageFindMarks.length,
      index:pageFindIndex
    });
  }

  function clearPageFind() {
    document.querySelectorAll('[data-onenote-page-find]').forEach(mark => {
      const parentNode = mark.parentNode;
      mark.replaceWith(document.createTextNode(mark.textContent || ''));
      parentNode?.normalize();
    });
    pageFindMarks = [];
    pageFindIndex = -1;
  }

  function selectPageFind(index, scroll) {
    pageFindMarks.forEach(mark => mark.removeAttribute('data-onenote-page-find-current'));
    if (pageFindMarks.length === 0) {
      pageFindIndex = -1;
      sendPageFindResult();
      return;
    }
    pageFindIndex = (index + pageFindMarks.length) % pageFindMarks.length;
    const mark = pageFindMarks[pageFindIndex];
    mark.setAttribute('data-onenote-page-find-current', 'true');
    if (scroll !== false) mark.scrollIntoView({ block:'center', behavior:'smooth' });
    sendPageFindResult();
  }

  function runPageFind(query) {
    clearPageFind();
    pageFindQuery = String(query || '');
    if (!pageFindQuery) {
      sendPageFindResult();
      return;
    }
    const needle = pageFindQuery.toLocaleLowerCase();
    for (const node of searchableTextNodes('script,style,noscript,textarea,[data-onenote-page-find]')) {
      const text = node.nodeValue || '';
      const folded = text.toLocaleLowerCase();
      let cursor = 0;
      let index = folded.indexOf(needle);
      if (index < 0) continue;
      const fragment = document.createDocumentFragment();
      while (index >= 0) {
        if (index > cursor) fragment.append(document.createTextNode(text.slice(cursor, index)));
        const mark = document.createElement('mark');
        mark.setAttribute('data-onenote-page-find', 'true');
        mark.textContent = text.slice(index, index + pageFindQuery.length);
        fragment.append(mark);
        pageFindMarks.push(mark);
        cursor = index + pageFindQuery.length;
        index = folded.indexOf(needle, cursor);
      }
      if (cursor < text.length) fragment.append(document.createTextNode(text.slice(cursor)));
      node.replaceWith(fragment);
    }
    selectPageFind(0, true);
  }

  function occurrenceKey(value) {
    const paragraphIndex = value?.paragraphIndex;
    const startIndex = value?.startIndex;
    const endIndex = value?.endIndex;
    return Number.isInteger(paragraphIndex) && Number.isInteger(startIndex) && Number.isInteger(endIndex)
      ? `${paragraphIndex}:${startIndex}:${endIndex}`
      : '';
  }

  let targetScrollTimers = [];

  function clearTargetScrollTimers() {
    targetScrollTimers.forEach(timer => clearTimeout(timer));
    targetScrollTimers = [];
  }

  function clearTargetParagraphs() {
    clearTargetScrollTimers();
    document.querySelectorAll('[data-onenote-target-paragraph],[data-onenote-target-paragraph-current]').forEach(item => {
      item.removeAttribute('data-onenote-target-paragraph');
      item.removeAttribute('data-onenote-target-paragraph-index');
      item.removeAttribute('data-onenote-target-paragraph-current');
    });
    document.querySelectorAll('[data-onenote-target-match],[data-onenote-target-match-current]').forEach(item => {
      item.removeAttribute('data-onenote-target-match');
      item.removeAttribute('data-onenote-target-match-index');
      item.removeAttribute('data-onenote-target-match-current');
    });
  }

  function setTargetParagraphs(indexes, occurrences) {
    clearTargetParagraphs();
    (Array.isArray(indexes) ? indexes : []).forEach((paragraphIndex, targetIndex) => {
      const target = document.querySelector(`[data-onenote-paragraph-index="${paragraphIndex}"]`);
      if (!target) return;
      target.setAttribute('data-onenote-target-paragraph', 'true');
      target.setAttribute('data-onenote-target-paragraph-index', String(targetIndex));
      if (targetIndex === 0) target.setAttribute('data-onenote-target-paragraph-current', 'true');
    });
    (Array.isArray(occurrences) ? occurrences : []).forEach((occurrence, targetIndex) => {
      const key = occurrenceKey(occurrence);
      const target = key ? document.querySelector(`[data-onenote-bible-occurrence="${key}"]`) : null;
      if (!target) return;
      target.setAttribute('data-onenote-target-match', 'true');
      target.setAttribute('data-onenote-target-match-index', String(targetIndex));
      if (targetIndex === 0) target.setAttribute('data-onenote-target-match-current', 'true');
    });
  }

  function reportTargetNavigation(index, paragraphIndex, target, requestId) {
    const scrolling = document.scrollingElement || document.documentElement || document.body;
    postToParent({
      type:'onenote-target-navigation-state',
      requestId:requestId || null,
      index:Number.isInteger(index) ? index : null,
      paragraphIndex:Number.isInteger(paragraphIndex) ? paragraphIndex : null,
      matchIndex:target?.getAttribute('data-onenote-target-match-index') ?? null,
      targetParagraphIndex:target?.getAttribute('data-onenote-paragraph-index') ?? null,
      scrollTop:Number(scrolling?.scrollTop) || 0
    });
  }

  function targetIntegerAttribute(target, name) {
    const value = target?.getAttribute(name);
    if (value == null) return undefined;
    const number = Number(value);
    return Number.isInteger(number) ? number : undefined;
  }

  function reportCurrentTargetNavigation(requestId) {
    const target = document.querySelector('[data-onenote-target-match-current=true]')
      || document.querySelector('[data-onenote-target-paragraph-current=true]');
    reportTargetNavigation(
      targetIntegerAttribute(target, 'data-onenote-target-match-index'),
      targetIntegerAttribute(target, 'data-onenote-paragraph-index'),
      target,
      requestId
    );
  }

  function pageViewState() {
    const scrolling = document.scrollingElement || document.documentElement || document.body;
    return {
      kind:'html',
      scrollTop:Number(scrolling?.scrollTop) || 0,
      scrollLeft:Number(scrolling?.scrollLeft) || 0
    };
  }

  function reportPageViewState(requestId) {
    postToParent({
      type:'onenote-page-view-state',
      requestId:String(requestId || ''),
      ...pageViewState()
    });
  }

  function restorePageViewState(state) {
    const scrolling = document.scrollingElement || document.documentElement || document.body;
    if (!scrolling || !state) return;
    clearTargetScrollTimers();
    const scrollTop = Math.max(0, Number(state.scrollTop) || 0);
    const scrollLeft = Math.max(0, Number(state.scrollLeft) || 0);
    const restore = () => {
      scrolling.scrollTop = scrollTop;
      scrolling.scrollLeft = scrollLeft;
    };
    requestAnimationFrame(restore);
    setTimeout(restore, 80);
    setTimeout(restore, 240);
  }

  function scrollTargetParagraph(index, paragraphIndex) {
    const matchSelector = '[data-onenote-target-match=true]';
    const paragraphSelector = '[data-onenote-target-paragraph=true]';
    let target = Number.isInteger(index)
      ? document.querySelector(`[data-onenote-target-match-index="${index}"]`)
      : document.querySelector(matchSelector) || document.querySelector(paragraphSelector);
    if (!target && Number.isInteger(paragraphIndex)) {
      target = document.querySelector(`[data-onenote-paragraph-index="${paragraphIndex}"]`);
    }
    if (!target && Number.isInteger(index)) {
      target = document.querySelector(`[data-onenote-target-paragraph-index="${index}"]`);
    }
    document.querySelectorAll(matchSelector).forEach(item => item.removeAttribute('data-onenote-target-match-current'));
    document.querySelectorAll(paragraphSelector).forEach(item => item.removeAttribute('data-onenote-target-paragraph-current'));
    if (target) {
      if (target.hasAttribute('data-onenote-target-match')) {
        target.setAttribute('data-onenote-target-match-current', 'true');
      } else {
        target.setAttribute('data-onenote-target-paragraph-current', 'true');
      }
      target.scrollIntoView({ block:'center' });
    }
    requestAnimationFrame(() => reportTargetNavigation(index, paragraphIndex, target));
  }

  window.addEventListener('wheel', event => {
    if (!(event.ctrlKey || event.metaKey) || event.altKey || !event.deltaY) return;
    event.preventDefault();
    const delta = event.deltaMode === 1
      ? event.deltaY * 16
      : event.deltaMode === 2
        ? event.deltaY * innerHeight
        : event.deltaY;
    applyPageZoom(pageZoom * Math.exp(-delta * 0.0025), true);
  }, { passive:false });

  window.addEventListener('message', event => {
    if (event.source !== parent) return;
    const data = event.data || {};
    if (data.type === 'onenote-html-zoom') applyPageZoom(data.zoom);
    if (data.type === 'onenote-scroll-target-paragraph') {
      const index = Number.isInteger(data.targetIndex) ? data.targetIndex : undefined;
      const paragraphIndex = Number.isInteger(data.paragraphIndex) ? data.paragraphIndex : undefined;
      clearTargetScrollTimers();
      scrollTargetParagraph(index, paragraphIndex);
      targetScrollTimers = [
        setTimeout(() => scrollTargetParagraph(index, paragraphIndex), 80),
        setTimeout(() => scrollTargetParagraph(index, paragraphIndex), 240)
      ];
    }
    if (data.type === 'onenote-page-find') runPageFind(data.query);
    if (data.type === 'onenote-page-find-next' && String(data.query || '') === pageFindQuery) {
      selectPageFind(pageFindIndex + (Number(data.delta) < 0 ? -1 : 1), true);
    }
    if (data.type === 'onenote-page-find-clear') {
      clearPageFind();
      pageFindQuery = '';
    }
    if (data.type === 'onenote-main-search') {
      const search = normalizeMainSearch(data.search);
      if (mainSearchKey(search) === activeMainSearchKey) selectMainSearch(data.index, data.scroll);
      else runMainSearch(search, data.index, data.scroll);
    }
    if (data.type === 'onenote-set-target-paragraphs') {
      setTargetParagraphs(data.paragraphIndexes, data.bibleOccurrences);
    }
    if (data.type === 'onenote-clear-target-paragraphs') clearTargetParagraphs();
    if (data.type === 'onenote-target-navigation-state-request') {
      reportCurrentTargetNavigation(String(data.requestId || ''));
    }
    if (data.type === 'onenote-page-view-state-request') {
      reportPageViewState(data.requestId);
    }
    if (data.type === 'onenote-page-view-state-restore') {
      restorePageViewState(data.state);
    }
  });

  postToParent({ type:'onenote-html-ready' });
  window.addEventListener('load', () => {
    scrollTargetParagraph();
    setTimeout(scrollTargetParagraph, 80);
    setTimeout(scrollTargetParagraph, 240);
  });
}());
