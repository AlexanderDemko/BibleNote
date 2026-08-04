const params = new URLSearchParams(location.search);
const pageId = params.get('id') || '';
const loading = document.getElementById('loading');
const errorBox = document.getElementById('error');
const viewerContainer = document.getElementById('viewerContainer');
const viewerElement = document.getElementById('viewer');
const previousPage = document.getElementById('previousPage');
const nextPage = document.getElementById('nextPage');
const pageNumber = document.getElementById('pageNumber');
const pageCount = document.getElementById('pageCount');
const pdfZoom = document.getElementById('pdfZoom');
const pdfZoomValue = document.getElementById('pdfZoomValue');
const fitWidth = document.getElementById('fitWidth');

let pdfViewer;
let pdfDocument;
let eventBus;
let findController;
let pdfSearchReady = false;
let pdfTextLayerReady = false;
let pdfFindReady = false;
let activeFindKind = '';
let pageFindQuery = '';
let requestedZoom = 1;
let appliedZoom = 1;
let pageScaleMode = 'page-fit';
let pdfContext = { bibleLinks:[], targets:[] };
let targetFallbackTimer;
let targetSearchToken = 0;
let mainAlignmentTimer;
let mainSearchRunToken = 0;
const mainSearch = {
  key:'', source:'', flags:'', mode:'and', originalQuery:'', query:'', entireWord:false,
  desiredIndex:0, count:0, index:-1, startedKey:''
};

function reportPageFind(matchesCount = {}) {
  parent.postMessage({
    type:'onenote-page-find-result',
    query:pageFindQuery,
    count:Math.max(0, Number(matchesCount.total) || 0),
    index:Math.max(-1, (Number(matchesCount.current) || 0) - 1)
  }, '*');
}

function reportMainSearch() {
  parent.postMessage({
    type:'onenote-main-search-result',
    source:mainSearch.source,
    flags:mainSearch.flags,
    count:mainSearch.count,
    index:mainSearch.index
  }, '*');
}

function dispatchFind(query, options = {}) {
  const empty = Array.isArray(query) ? query.length === 0 : !String(query || '');
  if (empty) {
    eventBus?.dispatch('findbarclose', { source:window });
    return;
  }
  eventBus?.dispatch('find', {
    source:window,
    type:options.again ? 'again' : '',
    query,
    phraseSearch:!Array.isArray(query),
    caseSensitive:false,
    entireWord:Boolean(options.entireWord),
    highlightAll:true,
    findPrevious:Boolean(options.previous),
    matchDiacritics:true
  });
}

function enablePdfSearch() {
  if (pdfSearchReady || !pdfTextLayerReady || !pdfFindReady) return;
  pdfSearchReady = true;
  startMainSearch();
}

async function resolvedPhraseQueries(source, flags, fallback) {
  if (!pdfDocument || !source) return fallback;
  let pattern;
  try {
    const safeFlags = [...new Set(String(flags || 'giu').replace(/y/g, '').split(''))].join('');
    pattern = new RegExp(source, safeFlags.includes('g') ? safeFlags : safeFlags + 'g');
  } catch {
    return fallback;
  }
  const variants = new Set();
  for (let pageIndex = 1; pageIndex <= pdfDocument.numPages && variants.size < 32; pageIndex += 1) {
    const page = await pdfDocument.getPage(pageIndex);
    const content = await page.getTextContent({ includeMarkedContent:true, disableNormalization:true });
    const text = content.items.map(item => {
      if (typeof item?.str !== 'string') return '';
      return item.str + (item.hasEOL ? '\n' : '');
    }).join('');
    pattern.lastIndex = 0;
    for (const match of text.matchAll(pattern)) {
      if (match[0]) variants.add(match[0]);
      if (variants.size >= 32) break;
    }
  }
  const queries = [...variants];
  return queries.length === 0 ? fallback : (queries.length === 1 ? queries[0] : queries);
}

function startMainSearch() {
  if (!pdfSearchReady || activeFindKind !== 'main' || !mainSearch.key || !mainSearch.originalQuery) return;
  if (mainSearch.startedKey === mainSearch.key) return;
  mainSearch.startedKey = mainSearch.key;
  const token = ++mainSearchRunToken;
  const key = mainSearch.key;
  if (mainSearch.mode !== 'phrase') {
    mainSearch.query = mainSearch.originalQuery;
    dispatchFind(mainSearch.query, { entireWord:mainSearch.entireWord });
    return;
  }
  void resolvedPhraseQueries(mainSearch.source, mainSearch.flags, mainSearch.originalQuery).then(query => {
    if (token !== mainSearchRunToken || key !== mainSearch.key || activeFindKind !== 'main') return;
    mainSearch.query = query;
    dispatchFind(query, { entireWord:false });
  });
}

function scheduleMainAlignment(delay = 0) {
  clearTimeout(mainAlignmentTimer);
  if (activeFindKind !== 'main' || mainSearch.count <= 0 || mainSearch.index < 0) return;
  const desired = ((mainSearch.desiredIndex % mainSearch.count) + mainSearch.count) % mainSearch.count;
  if (desired === mainSearch.index) return;
  mainAlignmentTimer = setTimeout(() => {
    if (activeFindKind !== 'main' || mainSearch.count <= 0) return;
    const forward = (desired - mainSearch.index + mainSearch.count) % mainSearch.count;
    const backward = (mainSearch.index - desired + mainSearch.count) % mainSearch.count;
    dispatchFind(mainSearch.query, {
      again:true,
      previous:backward < forward,
      entireWord:mainSearch.entireWord
    });
  }, delay);
}

function handleFindMatches(matchesCount = {}) {
  if (activeFindKind === 'page') {
    reportPageFind(matchesCount);
    return;
  }
  if (activeFindKind !== 'main') return;
  const nextCount = Math.max(0, Number(matchesCount.total) || 0);
  const countChanged = nextCount !== mainSearch.count;
  mainSearch.count = nextCount;
  mainSearch.index = Math.max(-1, (Number(matchesCount.current) || 0) - 1);
  reportMainSearch();
  scheduleMainAlignment(countChanged ? 180 : 0);
}

function runPageFind(query, again = false, previous = false) {
  pageFindQuery = String(query || '');
  activeFindKind = 'page';
  if (!pageFindQuery) {
    dispatchFind('');
    reportPageFind();
    return;
  }
  dispatchFind(pageFindQuery, { again, previous });
}

function runMainSearch(data) {
  const queries = (Array.isArray(data.queries) ? data.queries : [])
    .map(value => String(value || '').trim())
    .filter(Boolean);
  const source = String(data.source || '');
  const flags = String(data.flags || '');
  if (!source || queries.length === 0) {
    ++mainSearchRunToken;
    clearTimeout(mainAlignmentTimer);
    mainSearch.key = '';
    mainSearch.source = source;
    mainSearch.flags = flags;
    mainSearch.mode = 'and';
    mainSearch.originalQuery = '';
    mainSearch.query = '';
    mainSearch.startedKey = '';
    mainSearch.count = 0;
    mainSearch.index = -1;
    if (activeFindKind === 'main') dispatchFind('');
    reportMainSearch();
    return;
  }
  const query = queries.length === 1 ? queries[0] : queries;
  const mode = String(data.mode || 'and');
  const entireWord = Boolean(data.entireWord);
  const key = JSON.stringify({ source, flags, mode, queries, entireWord });
  const desiredIndex = Math.max(0, Number(data.index) || 0);
  const isNewSearch = key !== mainSearch.key;
  mainSearch.key = key;
  mainSearch.source = source;
  mainSearch.flags = flags;
  mainSearch.mode = mode;
  mainSearch.originalQuery = query;
  mainSearch.query = query;
  mainSearch.entireWord = entireWord;
  mainSearch.desiredIndex = desiredIndex;
  activeFindKind = 'main';
  clearTimeout(targetFallbackTimer);
  if (isNewSearch) {
    ++mainSearchRunToken;
    dispatchFind('');
    mainSearch.count = 0;
    mainSearch.index = -1;
    mainSearch.startedKey = '';
    startMainSearch();
    return;
  }
  startMainSearch();
  scheduleMainAlignment();
}

function normalizedText(value) {
  return String(value || '')
    .replace(/[\u00ad\u200b]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function runTargetSearch(paragraphIndex, targetIndex) {
  if (activeFindKind === 'main' && mainSearch.key) return;
  const targets = Array.isArray(pdfContext.targets) ? pdfContext.targets : [];
  const matching = targets.filter(target => Number(target?.paragraphIndex) === Number(paragraphIndex));
  const target = targets[Number(targetIndex)] || matching[0];
  if (!target) return;
  const primary = normalizedText(target.highlightText || target.query);
  const fallback = normalizedText(target.query);
  if (!primary && !fallback) return;
  clearTimeout(targetFallbackTimer);
  const token = ++targetSearchToken;
  activeFindKind = 'target';
  dispatchFind(primary || fallback, { entireWord:false });
  if (fallback && fallback !== primary) {
    targetFallbackTimer = setTimeout(() => {
      if (token !== targetSearchToken || activeFindKind !== 'target') return;
      dispatchFind(fallback, { entireWord:false });
    }, 1600);
  }
}

function applyRelativeZoom(zoom) {
  requestedZoom = Math.max(0.5, Math.min(2, Number(zoom) || 1));
  const zoomPercent = Math.round(requestedZoom * 100);
  pdfZoom.value = String(zoomPercent);
  pdfZoomValue.value = zoomPercent + '%';
  pdfZoomValue.textContent = pdfZoomValue.value;
  if (!pdfViewer?.pagesCount) return;
  pdfViewer.currentScale = pdfViewer.currentScale * (requestedZoom / appliedZoom);
  appliedZoom = requestedZoom;
}

function setPageScaleMode(mode, resetZoom = true) {
  pageScaleMode = mode === 'page-width' ? 'page-width' : 'page-fit';
  if (pdfViewer?.pagesCount) pdfViewer.currentScaleValue = pageScaleMode;
  appliedZoom = 1;
  if (resetZoom) requestedZoom = 1;
  const zoomPercent = Math.round(requestedZoom * 100);
  pdfZoom.value = String(zoomPercent);
  pdfZoomValue.value = zoomPercent + '%';
  pdfZoomValue.textContent = pdfZoomValue.value;
  const widthMode = pageScaleMode === 'page-width';
  fitWidth.textContent = widthMode ? 'Страница целиком' : 'По ширине';
  fitWidth.title = widthMode ? 'Показать страницу целиком' : 'Показать страницу по ширине';
  fitWidth.setAttribute('aria-label', fitWidth.title);
  fitWidth.setAttribute('aria-pressed', String(widthMode));
  fitWidth.dataset.shortLabel = widthMode ? '↕' : '↔';
}

function referencePattern(value) {
  const text = normalizedText(value);
  if (!text) return undefined;
  let source = '';
  for (const character of text) {
    if (/\s/u.test(character)) {
      source += '\\s*';
    } else if (/[:：,]/u.test(character)) {
      source += '\\s*[:：,]\\s*';
    } else if (/[-‐‑‒–—]/u.test(character)) {
      source += '\\s*[-‐‑‒–—]\\s*';
    } else {
      source += character.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
  }
  try {
    return new RegExp(source, 'giu');
  } catch {
    return undefined;
  }
}

function mappedTextLayer(layer) {
  const nodes = [];
  const walker = document.createTreeWalker(layer, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!node.nodeValue || node.parentElement?.closest('.pdf-bible-link-layer,.endOfContent')) {
        return NodeFilter.FILTER_REJECT;
      }
      return NodeFilter.FILTER_ACCEPT;
    }
  });
  while (walker.nextNode()) nodes.push(walker.currentNode);
  let text = '';
  const positions = [];
  const appendSpace = position => {
    if (!text || text.endsWith(' ')) return;
    text += ' ';
    positions.push(position || null);
  };
  for (const node of nodes) {
    const value = node.nodeValue || '';
    if (!value) continue;
    if (text && !text.endsWith(' ') && !/^\s/u.test(value)) appendSpace(null);
    for (let offset = 0; offset < value.length; offset++) {
      const character = value[offset];
      if (/[\u00ad\u200b]/u.test(character)) continue;
      if (/\s/u.test(character)) {
        appendSpace({ node, offset });
        continue;
      }
      text += character;
      positions.push({ node, offset });
    }
  }
  return { text, positions };
}

function mappedPosition(positions, index, step) {
  for (let current = index; current >= 0 && current < positions.length; current += step) {
    if (positions[current]?.node) return positions[current];
  }
  return undefined;
}

function addBibleLinkRect(layer, overlay, match, link, positions) {
  const start = mappedPosition(positions, match.index, 1);
  const end = mappedPosition(positions, match.index + match[0].length - 1, -1);
  if (!start || !end) return;
  const range = document.createRange();
  try {
    range.setStart(start.node, start.offset);
    range.setEnd(end.node, end.offset + 1);
  } catch {
    return;
  }
  const page = layer.closest('.page');
  if (!page) return;
  const pageRect = page.getBoundingClientRect();
  for (const rect of range.getClientRects()) {
    if (rect.width < 2 || rect.height < 2) continue;
    const anchor = document.createElement('a');
    anchor.className = 'pdf-bible-link';
    anchor.href = link.href;
    anchor.title = link.title || link.text;
    anchor.setAttribute('aria-label', 'Библейская ссылка ' + (link.title || link.text));
    anchor.style.left = (rect.left - pageRect.left) + 'px';
    anchor.style.top = (rect.top - pageRect.top) + 'px';
    anchor.style.width = rect.width + 'px';
    anchor.style.height = rect.height + 'px';
    anchor.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      parent.postMessage({ type:'onenote-bible-link', href:link.href }, '*');
    });
    overlay.append(anchor);
  }
}

function applyBibleLinksToLayer(layer) {
  const page = layer?.closest('.page');
  if (!page) return;
  page.querySelector(':scope > .pdf-bible-link-layer')?.remove();
  const links = (Array.isArray(pdfContext.bibleLinks) ? pdfContext.bibleLinks : [])
    .filter(link => link?.text && link?.href)
    .sort((left, right) => String(right.text).length - String(left.text).length);
  if (links.length === 0) return;
  const mapped = mappedTextLayer(layer);
  if (!mapped.text) return;
  const overlay = document.createElement('div');
  overlay.className = 'pdf-bible-link-layer';
  overlay.setAttribute('aria-label', 'Библейские ссылки');
  const occupied = [];
  for (const link of links) {
    const pattern = referencePattern(link.text);
    if (!pattern) continue;
    for (const match of mapped.text.matchAll(pattern)) {
      const start = Number(match.index) || 0;
      const end = start + match[0].length;
      if (occupied.some(range => start < range.end && end > range.start)) continue;
      occupied.push({ start, end });
      addBibleLinkRect(layer, overlay, match, link, mapped.positions);
    }
  }
  if (overlay.childElementCount > 0) page.append(overlay);
}

function refreshBibleLinks() {
  for (const layer of viewerElement.querySelectorAll('.textLayer')) applyBibleLinksToLayer(layer);
}

window.addEventListener('message', event => {
  const data = event.data || {};
  if (data.type === 'onenote-html-zoom') applyRelativeZoom(data.zoom);
  if (data.type === 'onenote-page-find') runPageFind(data.query);
  if (data.type === 'onenote-page-find-next' && String(data.query || '') === pageFindQuery) {
    runPageFind(pageFindQuery, true, Number(data.delta) < 0);
  }
  if (data.type === 'onenote-page-find-clear') runPageFind('');
  if (data.type === 'onenote-main-search') runMainSearch(data);
  if (data.type === 'onenote-pdf-context') {
    pdfContext = {
      bibleLinks:Array.isArray(data.bibleLinks) ? data.bibleLinks : [],
      targets:Array.isArray(data.targets) ? data.targets : []
    };
    refreshBibleLinks();
  }
  if (data.type === 'onenote-scroll-target-paragraph') {
    runTargetSearch(data.paragraphIndex, data.targetIndex);
  }
  if (data.type === 'onenote-clear-target-paragraphs' && activeFindKind === 'target') {
    ++targetSearchToken;
    clearTimeout(targetFallbackTimer);
    dispatchFind('');
    activeFindKind = '';
  }
});

window.addEventListener('keydown', event => {
  if ((event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && String(event.key).toLowerCase() === 'f') {
    event.preventDefault();
    parent.postMessage({ type:'onenote-page-find-open' }, '*');
  }
});

try {
  if (!pageId) throw new Error('Не указан документ PDF.');
  const pdfjsLib = await import('/vendor/pdfjs/pdf.min.mjs');
  globalThis.pdfjsLib = pdfjsLib;
  const { EventBus, PDFFindController, PDFLinkService, PDFViewer } = await import('/vendor/pdfjs/pdf_viewer.mjs');
  pdfjsLib.GlobalWorkerOptions.workerSrc = '/vendor/pdfjs/pdf.worker.min.mjs';
  eventBus = new EventBus();
  const linkService = new PDFLinkService({ eventBus, externalLinkTarget:2 });
  findController = new PDFFindController({ eventBus, linkService });
  pdfViewer = new PDFViewer({
    container:viewerContainer,
    viewer:viewerElement,
    eventBus,
    linkService,
    findController,
    textLayerMode:1,
    annotationMode:2,
    removePageBorders:true
  });
  linkService.setViewer(pdfViewer);
  eventBus.on('pagesinit', () => {
    setPageScaleMode('page-fit', false);
    applyRelativeZoom(requestedZoom);
    loading.hidden = true;
    parent.postMessage({ type:'onenote-html-ready' }, '*');
  });
  eventBus.on('pagechanging', ({ pageNumber:currentPage, pagesCount }) => {
    const totalPages = pdfDocument?.numPages || pagesCount || pdfViewer?.pagesCount || 1;
    pageNumber.value = String(currentPage || 1);
    pageNumber.max = String(totalPages);
    pageCount.textContent = `/ ${totalPages}`;
    previousPage.disabled = currentPage <= 1;
    nextPage.disabled = currentPage >= totalPages;
  });
  eventBus.on('updatefindmatchescount', ({ matchesCount }) => handleFindMatches(matchesCount));
  eventBus.on('updatefindcontrolstate', ({ state, matchesCount }) => {
    if (state !== 3) handleFindMatches(matchesCount);
  });
  eventBus.on('textlayerrendered', ({ pageNumber:renderedPage }) => {
    if (!pdfTextLayerReady) {
      pdfTextLayerReady = true;
      enablePdfSearch();
    }
    const layer = viewerElement.querySelector('.page[data-page-number="' + renderedPage + '"] .textLayer');
    if (layer) applyBibleLinksToLayer(layer);
  });
  previousPage.addEventListener('click', () => { if (pdfViewer.currentPageNumber > 1) pdfViewer.currentPageNumber -= 1; });
  nextPage.addEventListener('click', () => { if (pdfViewer.currentPageNumber < pdfViewer.pagesCount) pdfViewer.currentPageNumber += 1; });
  pageNumber.addEventListener('change', () => {
    const target = Math.max(1, Math.min(pdfViewer.pagesCount, Number(pageNumber.value) || 1));
    pdfViewer.currentPageNumber = target;
  });
  pdfZoom.addEventListener('input', () => applyRelativeZoom(Number(pdfZoom.value) / 100));
  fitWidth.addEventListener('click', () => {
    setPageScaleMode(pageScaleMode === 'page-width' ? 'page-fit' : 'page-width');
  });
  const loadingTask = pdfjsLib.getDocument({ url:'/api/page-pdf?id=' + encodeURIComponent(pageId) });
  pdfDocument = await loadingTask.promise;
  pageNumber.max = String(pdfDocument.numPages);
  pageCount.textContent = `/ ${pdfDocument.numPages}`;
  previousPage.disabled = true;
  nextPage.disabled = pdfDocument.numPages <= 1;
  pdfViewer.setDocument(pdfDocument);
  linkService.setDocument(pdfDocument, null);
  findController.setDocument(pdfDocument);
  pdfFindReady = true;
  enablePdfSearch();
} catch (error) {
  loading.hidden = true;
  errorBox.hidden = false;
  errorBox.textContent = 'Не удалось открыть PDF: ' + (error?.message || String(error));
  parent.postMessage({ type:'onenote-html-ready' }, '*');
}
