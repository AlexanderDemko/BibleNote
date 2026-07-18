function pagePathLabel(page) {
  const parts = [];
  const add = value => {
    const text = String(value || '').trim();
    if (text && parts[parts.length - 1] !== text) parts.push(text);
  };
  add(page.parentNotebook?.displayName);
  for (const item of String(page.sectionGroupPath || '').split(/[\\/]+/)) add(item);
  add(page.parentSection?.displayName);
  return parts.join(' / ');
}

function orderedBiblePageRefs(data) {
  const ordered = [];
  let sourceOrder = 0;
  for (const paragraph of data.paragraphs || []) {
    for (const ref of paragraph.references || []) {
      ordered.push({ ref, sourceOrder:sourceOrder++ });
    }
  }

  const modulePosition = (value, fallback) => {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : fallback;
  };
  return ordered.sort((a, b) =>
    modulePosition(a.ref.bookIndex, Number.MAX_SAFE_INTEGER) - modulePosition(b.ref.bookIndex, Number.MAX_SAFE_INTEGER)
    || modulePosition(a.ref.chapter, 0) - modulePosition(b.ref.chapter, 0)
    || modulePosition(a.ref.verse, 0) - modulePosition(b.ref.verse, 0)
    || modulePosition(a.ref.topChapter, 0) - modulePosition(b.ref.topChapter, 0)
    || modulePosition(a.ref.topVerse, 0) - modulePosition(b.ref.topVerse, 0)
    || a.sourceOrder - b.sourceOrder
  );
}

function createBibleRefAction(label, icon, onClick, options = {}) {
  const button = document.createElement('button');
  button.className = 'bible-ref-action';
  button.type = 'button';
  button.innerHTML = icon;
  button.title = label;
  button.setAttribute('aria-label', options.ariaLabel || label);
  button.disabled = options.disabled === true;
  button.addEventListener('click', onClick);
  return button;
}

function renderBiblePageRefs(data) {
  const section = document.createElement('details');
  section.className = 'bible-page-refs';
  const orderedRefs = orderedBiblePageRefs(data);
  const heading = document.createElement('summary');
  heading.textContent = 'Библейские ссылки';
  heading.textContent = 'Библейские ссылки: ' + orderedRefs.length;
  section.append(heading);
  section.addEventListener('toggle', () => {
    if (section.open) loadBiblePageRefTexts(section).catch(error => console.warn(error));
  });
  for (const { ref } of orderedRefs) {
    const block = document.createElement('div');
    block.className = 'bible-reference';
    const row = document.createElement('div');
    row.className = 'bible-ref-row';
    const refTexts = document.createElement('div');
    refTexts.className = 'bible-ref-texts';
    const chip = document.createElement('a');
    chip.className = 'bible-chip';
    chip.href = bibleTextUrl(ref);
    chip.textContent = ref.normalizedRef || ref.originalText;
    chip.title = 'Показать текст стиха';
    chip.addEventListener('click', event => {
      event.preventDefault();
      showBibleText(ref).catch(showError);
    });
    const actions = document.createElement('div');
    actions.className = 'bible-ref-actions';
    const refLabel = ref.normalizedRef || ref.originalText || 'библейской ссылки';
    const contextButton = createBibleRefAction(
      'Показать в контексте',
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 10h10M4 14h16M4 18h10"/><path d="M17 9v6M14 12h6"/></svg>',
      () => {
        showBibleText(ref)
          .then(() => showBibleTextContext({ ref }))
          .catch(showError);
      }, {
        ariaLabel:'Показать в контексте ' + refLabel,
        disabled:!ref.verse
      }
    );
    const readerButton = createBibleRefAction(
      'Открыть в Библии',
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 5.5A3.5 3.5 0 0 1 6.5 4H11v16H6.5A3.5 3.5 0 0 0 3 21.5zM21 5.5A3.5 3.5 0 0 0 17.5 4H13v16h4.5a3.5 3.5 0 0 1 3.5 1.5z"/></svg>',
      () => openBibleTextInReader(ref).catch(showError),
      { ariaLabel:'Открыть в Библии ' + refLabel }
    );
    const notesButton = createBibleRefAction(
      'Поиск заметок',
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3h9l4 4v5M14 3v5h4M8 12h4M8 16h2"/><circle cx="15.5" cy="16.5" r="3.5"/><path d="m18 19 3 3"/></svg>',
      () => showBibleReaderVerseNotes(ref).catch(showError),
      { ariaLabel:'Поиск заметок для ' + refLabel }
    );
    const parallelButton = document.createElement('button');
    parallelButton.className = 'bible-parallel-button';
    parallelButton.type = 'button';
    parallelButton.textContent = '⇄';
    parallelButton.title = 'Показать параллельные ссылки';
    parallelButton.setAttribute('aria-label', 'Показать параллельные ссылки для ' + (ref.normalizedRef || ref.originalText));
    parallelButton.addEventListener('click', () => loadParallelRefs(ref, block).catch(showError));
    actions.append(contextButton, readerButton, notesButton, parallelButton);
    row.append(chip, actions);
    const refText = document.createElement('div');
    refText.className = 'bible-ref-text loading';
    refText.dataset.bibleTextUrl = bibleTextUrl(ref);
    refText.textContent = 'Загрузка текста...';
    refTexts.append(refText);
    block.append(row, refTexts);
    section.append(block);
  }
  return section;
}

async function loadBiblePageRefTexts(section) {
  if (section.dataset.bibleTextsLoaded === 'true' || section.dataset.bibleTextsLoading === 'true') return;
  section.dataset.bibleTextsLoading = 'true';
  const targets = [...section.querySelectorAll('[data-bible-text-url]')];
  let hasErrors = false;
  let cursor = 0;
  const loadOne = async target => {
    try {
      const result = await api(target.dataset.bibleTextUrl);
      const verseText = Array.isArray(result.verses)
        ? result.verses.map(verse => verse.text).filter(Boolean).join('\n')
        : '';
      target.textContent = verseText || result.text || 'Текст не найден.';
      target.classList.remove('loading', 'error');
    } catch (error) {
      hasErrors = true;
      target.textContent = 'Не удалось загрузить текст: ' + (error?.message || String(error));
      target.classList.remove('loading');
      target.classList.add('error');
    }
  };
  const workers = Array.from({ length:Math.min(6, targets.length) }, async () => {
    while (cursor < targets.length) {
      const target = targets[cursor++];
      await loadOne(target);
    }
  });
  await Promise.all(workers);
  section.dataset.bibleTextsLoading = 'false';
  if (!hasErrors) section.dataset.bibleTextsLoaded = 'true';
}

function bibleTextUrl(ref) {
  const params = new URLSearchParams();
  params.set('module', ref.module || currentBibleModule());
  if (ref.bookIndex) params.set('bookIndex', String(ref.bookIndex));
  if (ref.chapter) params.set('chapter', String(ref.chapter));
  if (ref.verse) params.set('verse', String(ref.verse));
  if (ref.topChapter) params.set('topChapter', String(ref.topChapter));
  if (ref.topVerse) params.set('topVerse', String(ref.topVerse));
  if (ref.contextVerses) params.set('contextVerses', String(ref.contextVerses));
  if (ref.bookName) params.set('bookName', ref.bookName);
  if (ref.bookShortName) params.set('bookShortName', ref.bookShortName);
  if (ref.originalText) params.set('originalText', ref.originalText);
  return '/api/bible/text?' + params.toString();
}

function compareBibleVerse(aChapter, aVerse, bChapter, bVerse) {
  return Number(aChapter) - Number(bChapter) || Number(aVerse) - Number(bVerse);
}

function bibleVerseIsInsideReference(verse, ref) {
  if (!verse || !ref?.verse) return false;
  const startChapter = Number(ref.chapter);
  const startVerse = Number(ref.verse);
  const endChapter = Number(ref.topChapter || ref.chapter);
  const endVerse = Number(ref.topVerse || ref.verse);
  const chapter = Number(verse.chapter);
  const verseNumber = Number(verse.verse);
  if (![startChapter, startVerse, endChapter, endVerse, chapter, verseNumber].every(Number.isFinite)) return false;
  return compareBibleVerse(chapter, verseNumber, startChapter, startVerse) >= 0
    && compareBibleVerse(chapter, verseNumber, endChapter, endVerse) <= 0;
}

function bibleVerseText(result) {
  if (Array.isArray(result?.verses) && result.verses.length > 0) {
    return result.verses
      .map(verse => [verse.reference, verse.text].filter(Boolean).join(' '))
      .filter(Boolean)
      .join('\n');
  }
  return result?.text || '';
}

function cloneBibleTextRef(ref) {
  return {
    normalizedRef:ref.normalizedRef,
    originalText:ref.originalText,
    module:ref.module,
    bookIndex:ref.bookIndex,
    bookName:ref.bookName,
    bookShortName:ref.bookShortName,
    chapter:ref.chapter,
    verse:ref.verse,
    topChapter:ref.topChapter,
    topVerse:ref.topVerse
  };
}

function bibleTextHistoryKey(entry) {
  return JSON.stringify({ mode:entry.mode, ref:entry.ref });
}

function updateBibleTextHistoryButtons() {
  bibleTextBackButton.disabled = bibleTextHistoryIndex <= 0;
  bibleTextForwardButton.disabled = bibleTextHistoryIndex < 0 || bibleTextHistoryIndex >= bibleTextHistory.length - 1;
}

function rememberBibleTextHistory(ref, mode) {
  const entry = { ref:cloneBibleTextRef(ref), mode };
  if (bibleTextHistoryIndex >= 0 && bibleTextHistoryKey(bibleTextHistory[bibleTextHistoryIndex]) === bibleTextHistoryKey(entry)) {
    updateBibleTextHistoryButtons();
    return;
  }
  bibleTextHistory = bibleTextHistory.slice(0, bibleTextHistoryIndex + 1);
  bibleTextHistory.push(entry);
  if (bibleTextHistory.length > 80) bibleTextHistory.shift();
  bibleTextHistoryIndex = bibleTextHistory.length - 1;
  updateBibleTextHistoryButtons();
}

async function navigateBibleTextHistory(step) {
  const nextIndex = bibleTextHistoryIndex + step;
  if (nextIndex < 0 || nextIndex >= bibleTextHistory.length) return;
  bibleTextHistoryIndex = nextIndex;
  updateBibleTextHistoryButtons();
  const entry = bibleTextHistory[bibleTextHistoryIndex];
  if (entry.mode === 'context') await showBibleTextContext({ ref:entry.ref, remember:false });
  else await showBibleText(entry.ref, { remember:false });
}

function renderBibleContextText(result, highlightRef) {
  bibleTextContent.replaceChildren();
  const verses = Array.isArray(result.verses) ? result.verses : [];
  if (verses.length === 0) {
    bibleTextContent.textContent = result.text || 'Текст не найден.';
    return;
  }

  let firstHighlighted = null;
  for (const verse of verses) {
    const line = document.createElement('div');
    line.className = 'bible-context-line';
    line.textContent = [verse.reference, verse.text].filter(Boolean).join(' ');
    if (bibleVerseIsInsideReference(verse, highlightRef)) {
      line.classList.add('bible-context-highlight');
      if (!firstHighlighted) firstHighlighted = line;
    }
    bibleTextContent.append(line);
  }
  if (firstHighlighted) requestAnimationFrame(() => firstHighlighted.scrollIntoView({ block:'center' }));
}

async function showBibleText(ref, options = {}) {
  if (!ref.bookIndex || !ref.chapter) return;
  uiLog('ui.showBibleText', { ref });
  currentBibleTextRef = ref;
  if (options.remember !== false) rememberBibleTextHistory(ref, 'text');
  else updateBibleTextHistoryButtons();
  bibleTextParallelPanel.replaceChildren();
  showBibleTextContextButton.hidden = !ref.verse;
  showBibleTextContextButton.disabled = !ref.verse;
  showBibleTextParallelButton.disabled = false;
  showBibleTextNotesButton.disabled = !ref.normalizedRef && !ref.originalText;
  showBibleTextInReaderButton.disabled = !ref.bookIndex || !ref.chapter;
  bibleTextTitle.textContent = ref.normalizedRef || ref.originalText || 'Библейская ссылка';
  bibleTextMeta.textContent = 'BibleNote';
  bibleTextContent.textContent = 'Загрузка...';
  if (!bibleTextDialog.open) bibleTextDialog.showModal();

  try {
    const result = await api(bibleTextUrl(ref));
    bibleTextTitle.textContent = result.reference || ref.normalizedRef || ref.originalText || 'Библейская ссылка';
    bibleTextMeta.textContent = [result.moduleName || result.module, result.bookName].filter(Boolean).join(' · ');
    bibleTextContent.textContent = bibleVerseText(result) || 'Текст не найден.';
  } catch (error) {
    bibleTextMeta.textContent = 'BibleNote';
    bibleTextContent.textContent = 'Не удалось загрузить текст: ' + (error?.message || String(error));
    showBibleTextContextButton.disabled = true;
    showBibleTextParallelButton.disabled = true;
    showBibleTextInReaderButton.disabled = true;
  }
}

async function showBibleTextContext(options = {}) {
  const ref = options.ref || currentBibleTextRef;
  if (!ref?.verse) return;
  currentBibleTextRef = ref;
  if (options.remember !== false) rememberBibleTextHistory(ref, 'context');
  else updateBibleTextHistoryButtons();
  showBibleTextContextButton.disabled = true;
  bibleTextContent.textContent = 'Загрузка контекста...';
  try {
    const result = await api(bibleTextUrl({ ...ref, contextVerses:10 }));
    bibleTextTitle.textContent = (result.reference || ref.normalizedRef || ref.originalText || 'Библейская ссылка') + ' · контекст';
    bibleTextMeta.textContent = [result.moduleName || result.module, result.bookName, '10 стихов до и после'].filter(Boolean).join(' · ');
    bibleTextContent.textContent = result.text || 'Текст не найден.';
    renderBibleContextText(result, ref);
  } catch (error) {
    bibleTextContent.textContent = 'Не удалось загрузить контекст: ' + (error?.message || String(error));
    showBibleTextContextButton.disabled = false;
  }
}

async function openExternalBibleRefFromUrl() {
  const rawRef = new URLSearchParams(location.search).get('openBibleRef');
  if (!rawRef) return;
  await openBibleRef(rawRef);
  history.replaceState(null, '', selectedPageId ? pageUrl(selectedPageId, currentTargetParagraphIndex) : '/');
}

function appendPageTextWithBibleRefs(container, pageText, query, bibleRefs) {
  const ranges = bibleTextRanges(pageText, bibleRefs);
  const targetParagraphIndexSet = new Set(currentTargetParagraphIndexes.filter(Number.isInteger));
  const targetParagraphs = bibleParagraphRanges(pageText, bibleRefs)
    .filter(item => targetParagraphIndexSet.has(item.index));
  if (ranges.length === 0 && targetParagraphs.length === 0) return appendHighlightedText(container, pageText, query);

  const matches = [];
  const points = new Set([0, pageText.length]);
  for (const range of ranges) {
    points.add(range.start);
    points.add(range.end);
  }
  const targetByStart = new Map();
  const targetByEnd = new Map();
  for (const targetParagraph of targetParagraphs) {
    points.add(targetParagraph.start);
    points.add(targetParagraph.end);
    targetByStart.set(targetParagraph.start, targetParagraph);
    targetByEnd.set(targetParagraph.end, targetParagraph);
  }

  const sortedPoints = [...points].sort((a, b) => a - b);
  let paragraphWrapper = null;
  for (let pointIndex = 0; pointIndex < sortedPoints.length - 1; pointIndex++) {
    const start = sortedPoints[pointIndex];
    const end = sortedPoints[pointIndex + 1];
    if (start >= end) continue;

    const startingTargetParagraph = targetByStart.get(start);
    if (startingTargetParagraph) {
      paragraphWrapper = document.createElement('span');
      paragraphWrapper.id = 'paragraph-' + startingTargetParagraph.index;
      paragraphWrapper.className = 'bible-paragraph-target';
      paragraphWrapper.dataset.paragraphIndex = String(startingTargetParagraph.index);
    }

    const target = paragraphWrapper || container;
    const range = ranges.find(item => start >= item.start && end <= item.end);
    if (range) {
      const link = document.createElement('a');
      link.className = 'bible-inline-ref';
      link.href = bibleTextUrl(range.ref);
      link.title = 'Показать текст стиха';
      link.addEventListener('click', event => {
        event.preventDefault();
        showBibleText(range.ref).catch(showError);
      });
      matches.push(...appendHighlightedText(link, pageText.slice(start, end), query));
      target.append(link);
    } else {
      const span = document.createElement('span');
      matches.push(...appendHighlightedText(span, pageText.slice(start, end), query));
      target.append(span);
    }

    if (targetByEnd.has(end) && paragraphWrapper) {
      container.append(paragraphWrapper);
      paragraphWrapper = null;
    }
  }

  return matches;
}

function bibleParagraphRanges(pageText, bibleRefs) {
  const ranges = [];
  let paragraphSearchFrom = 0;
  for (const paragraph of bibleRefs.paragraphs || []) {
    const paragraphText = paragraph.text || '';
    if (!paragraphText) continue;

    let paragraphStart = pageText.indexOf(paragraphText, paragraphSearchFrom);
    if (paragraphStart < 0) paragraphStart = pageText.indexOf(paragraphText);
    if (paragraphStart < 0) continue;
    paragraphSearchFrom = paragraphStart + paragraphText.length;
    ranges.push({
      index:paragraph.index,
      start:paragraphStart,
      end:paragraphStart + paragraphText.length
    });
  }
  return ranges;
}

function bibleTextRanges(pageText, bibleRefs) {
  const ranges = [];
  let paragraphSearchFrom = 0;
  for (const paragraph of bibleRefs.paragraphs || []) {
    const paragraphText = paragraph.text || '';
    if (!paragraphText) continue;

    let paragraphStart = pageText.indexOf(paragraphText, paragraphSearchFrom);
    if (paragraphStart < 0) paragraphStart = pageText.indexOf(paragraphText);
    if (paragraphStart < 0) continue;
    paragraphSearchFrom = paragraphStart + paragraphText.length;

    for (const ref of paragraph.references || []) {
      if (!Number.isInteger(ref.startIndex) || !Number.isInteger(ref.endIndex)) continue;
      const start = paragraphStart + ref.startIndex;
      const end = paragraphStart + ref.endIndex + 1;
      if (start < paragraphStart || end > paragraphStart + paragraphText.length || start >= end) continue;
      ranges.push({ start, end, ref });
    }
  }

  ranges.sort((a, b) => a.start - b.start || b.end - a.end);
  const result = [];
  let lastEnd = 0;
  for (const range of ranges) {
    if (range.start < lastEnd) continue;
    result.push(range);
    lastEnd = range.end;
  }
  return result;
}

function parallelParams(ref) {
  const params = addBibleDisplayParams(new URLSearchParams({
    bookIndex:String(ref.bookIndex),
    chapter:String(ref.chapter),
    limit:'30'
  }));
  if (ref.verse) params.set('verse', String(ref.verse));
  return params;
}

function parallelNotesParams(targetRef, relatedRef) {
  const params = addBibleDisplayParams(new URLSearchParams({
    bookIndex:String(targetRef.bookIndex),
    chapter:String(targetRef.chapter),
    relatedBookIndex:String(relatedRef.bookIndex),
    relatedChapter:String(relatedRef.chapter),
    limit:'50'
  }));
  if (targetRef.verse) params.set('verse', String(targetRef.verse));
  if (relatedRef.verse) params.set('relatedVerse', String(relatedRef.verse));
  return params;
}

function parallelRefFromRow(row) {
  return {
    normalizedRef:row.normalizedRef,
    originalText:row.sampleOriginalText || row.normalizedRef,
    bookIndex:row.bookIndex,
    bookName:row.bookName,
    chapter:row.chapter,
    verse:row.verse,
    topChapter:row.topChapter,
    topVerse:row.topVerse
  };
}

function compactText(value, limit = 260) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length > limit ? text.slice(0, limit - 1) + '…' : text;
}

async function loadParallelNotes(targetRef, relatedRef, host) {
  host.replaceChildren();
  const loading = document.createElement('div');
  loading.className = 'bible-parallel-meta';
  loading.textContent = 'Загрузка заметок...';
  host.append(loading);
  const result = await api('/api/bible/parallel/notes?' + parallelNotesParams(targetRef, relatedRef).toString());
  host.replaceChildren();
  if (result.rows.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'bible-parallel-meta';
    empty.textContent = 'Совместных упоминаний не найдено.';
    host.append(empty);
    return;
  }

  const pages = new Map();
  for (const row of result.rows) {
    const page = pages.get(row.pageId) || {
      pageId:row.pageId,
      pageTitle:row.pageTitle,
      notebook:row.notebook,
      section:row.section,
      maxWeight:0,
      rows:[]
    };
    page.maxWeight = Math.max(page.maxWeight, Number(row.relationWeight || 0));
    page.rows.push(row);
    pages.set(row.pageId, page);
  }

  for (const page of pages.values()) {
    const card = document.createElement('div');
    card.className = 'bible-parallel-note-card';
    const title = document.createElement('div');
    title.className = 'bible-parallel-note-title';
    title.textContent = page.pageTitle || '(без названия)';
    const meta = document.createElement('div');
    meta.className = 'bible-parallel-note-meta';
    const fragmentsLabel = page.rows.length === 1 ? '1 фрагмент' : page.rows.length + ' фрагмента';
    meta.textContent = [page.notebook, page.section, 'макс. индекс ' + page.maxWeight.toFixed(2), fragmentsLabel].filter(Boolean).join(' · ');
    card.append(title, meta);

    for (const note of page.rows) {
      const button = document.createElement('button');
      button.className = 'bible-parallel-fragment';
      button.type = 'button';
      const paragraphIndex = Number.isInteger(note.relatedParagraphIndex) ? note.relatedParagraphIndex : note.targetParagraphIndex;
      button.addEventListener('click', () => {
        if (bibleTextDialog.open) bibleTextDialog.close();
        openPage(note.pageId, { paragraphIndex }).catch(showError);
      });
      const fragmentMeta = document.createElement('div');
      fragmentMeta.className = 'bible-parallel-note-meta';
      fragmentMeta.textContent = 'абзац ' + (paragraphIndex + 1) + ' · индекс ' + Number(note.relationWeight || 0).toFixed(2);
      const text = document.createElement('div');
      text.className = 'bible-parallel-note-text';
      const target = compactText(note.targetParagraphText);
      const related = note.relatedParagraphText === note.targetParagraphText ? '' : compactText(note.relatedParagraphText);
      text.textContent = related ? target + '\n' + related : target;
      button.append(fragmentMeta, text);
      card.append(button);
    }
    host.append(card);
  }
}

async function loadParallelVerseText(ref, host) {
  host.textContent = 'Загрузка текста...';
  host.classList.add('loading');
  host.classList.remove('error');
  try {
    const result = await api(bibleTextUrl(ref));
    host.textContent = bibleVerseText(result) || 'Текст не найден.';
    host.classList.remove('loading');
  } catch (error) {
    host.textContent = 'Не удалось загрузить текст: ' + (error?.message || String(error));
    host.classList.remove('loading');
    host.classList.add('error');
  }
}

async function loadParallelRefs(ref, block) {
  if (!ref.bookIndex || !ref.chapter) return;
  const parallelKey = parallelParams(ref).toString();
  const existing = block.querySelector('.bible-parallel');
  if (existing?.dataset.parallelKey === parallelKey) {
    existing.remove();
    return;
  }
  block.querySelectorAll('.bible-parallel').forEach(item => item.remove());
  const panel = document.createElement('div');
  panel.className = 'bible-parallel';
  panel.dataset.parallelKey = parallelKey;
  const title = document.createElement('div');
  title.className = 'bible-parallel-title';
  title.textContent = 'Параллельные ссылки для ' + (ref.normalizedRef || ref.originalText);
  panel.append(title);
  const loading = document.createElement('div');
  loading.className = 'bible-parallel-meta';
  loading.textContent = 'Загрузка...';
  panel.append(loading);
  block.append(panel);

  const result = await api('/api/bible/parallel?' + parallelKey);
  loading.remove();
  if (result.rows.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'bible-parallel-meta';
    empty.textContent = 'Параллельных ссылок пока нет.';
    panel.append(empty);
    return;
  }

  const list = document.createElement('div');
  list.className = 'bible-parallel-list';
  for (const item of result.rows) {
    const relatedRef = parallelRefFromRow(item);
    const row = document.createElement('div');
    row.className = 'bible-parallel-row';
    const head = document.createElement('div');
    head.className = 'bible-parallel-head';
    const refButton = document.createElement('button');
    refButton.className = 'bible-parallel-ref';
    refButton.type = 'button';
    refButton.textContent = item.normalizedRef || item.sampleOriginalText || 'Ссылка';
    refButton.title = 'Показать текст стиха';
    refButton.addEventListener('click', () => showBibleText(relatedRef).catch(showError));
    const notesButton = document.createElement('button');
    notesButton.className = 'bible-parallel-button';
    notesButton.type = 'button';
    notesButton.textContent = 'Заметки';
    const meta = document.createElement('span');
    meta.className = 'bible-parallel-meta';
    meta.textContent = 'индекс ' + Number(item.relationWeight || 0).toFixed(2)
      + ' · связей ' + (item.relations || 0)
      + ' · заметок ' + (item.pages || 0);
    const verseText = document.createElement('div');
    verseText.className = 'bible-parallel-note-text bible-parallel-verse-text loading';
    const notes = document.createElement('div');
    notes.className = 'bible-parallel-notes';
    notesButton.addEventListener('click', () => {
      if (notes.childNodes.length > 0) {
        notes.replaceChildren();
        return;
      }
      loadParallelNotes(ref, relatedRef, notes).catch(showError);
    });
    head.append(refButton, meta, notesButton);
    row.append(head, verseText, notes);
    list.append(row);
    loadParallelVerseText(relatedRef, verseText).catch(showError);
  }
  panel.append(list);
}

function metaItem(label, value) {
  const span = document.createElement('span');
  span.textContent = label + ': ' + (value || '—');
  return span;
}

function formatDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('ru-RU');
}

function pluralRu(value, one, few, many) {
  const mod100 = Math.abs(value) % 100;
  const mod10 = mod100 % 10;
  if (mod100 >= 11 && mod100 <= 19) return many;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return few;
  return many;
}

function cacheStatusText(status) {
  return status.pages + ' страниц · ' + status.pagesWithContent + ' с текстом · ' + (status.bibleReferences || 0) + ' ссылок · ' + status.pagesWithErrors + ' ' + pluralRu(status.pagesWithErrors, 'ошибка', 'ошибки', 'ошибок');
}

function appendHighlightedText(container, text, query) {
  if (!query) {
    container.textContent = text;
    return [];
  }
  const request = searchRequest(query);
  let regex;
  try {
    if (request.mode === 'regex') {
      regex = new RegExp(request.query, 'gu' + (request.caseSensitive ? '' : 'i'));
    } else if (request.mode === 'phrase') {
      const escaped = request.query.replace(/[.*+?^\x24{}()|[\]\\]/g, '\\$&');
      regex = new RegExp(escaped, 'gu' + (request.caseSensitive ? '' : 'i'));
    } else {
      const terms = request.query.match(/[\p{L}\p{N}_-]+/gu) || [];
      const unique = [...new Set(terms.map(term => request.caseSensitive ? term : term.toLocaleLowerCase()))].sort((a, b) => b.length - a.length);
      if (!unique.length) {
        container.textContent = text;
        return [];
      }
      const escaped = unique.map(term => term.replace(/[.*+?^\x24{}()|[\]\\]/g, '\\$&'));
      regex = new RegExp(escaped.join('|'), 'gu' + (request.caseSensitive ? '' : 'i'));
    }
  } catch {
    container.textContent = text;
    return [];
  }

  let cursor = 0;
  const marks = [];
  for (const match of text.matchAll(regex)) {
    const index = match.index ?? 0;
    if (index > cursor) container.append(document.createTextNode(text.slice(cursor, index)));
    if (match[0].length > 0) {
      const mark = document.createElement('mark');
      mark.textContent = match[0];
      container.append(mark);
      marks.push(mark);
      cursor = index + match[0].length;
    }
  }
  if (cursor < text.length) container.append(document.createTextNode(text.slice(cursor)));
  return marks;
}

searchInput.addEventListener('input', () => {
  searchHistoryIndex = -1;
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    rerunSearch();
    scheduleSearchHistoryCommit();
  }, 220);
});

searchInput.addEventListener('keydown', event => {
  if (event.key === 'Enter') {
    rememberSearch(searchInput.value);
    hideSearchHistory();
    rerunSearch();
  } else if (event.key === 'ArrowUp') {
    event.preventDefault();
    stepSearchHistory(1);
  } else if (event.key === 'ArrowDown') {
    event.preventDefault();
    if (searchHistoryIndex === -1) showSearchHistory(); else stepSearchHistory(-1);
  } else if (event.key === 'Escape' && !searchHistoryMenu.classList.contains('hidden')) {
    event.preventDefault();
    hideSearchHistory();
  }
});

document.addEventListener('pointerdown', event => {
  if (searchHistoryMenu.classList.contains('hidden')) return;
  if (event.target === searchInput || event.target === searchHistoryButton || searchHistoryMenu.contains(event.target)) return;
  hideSearchHistory();
});

window.addEventListener('popstate', () => {
  const pageId = pageIdFromUrl();
  if (pageId) {
    openPage(pageId, { updateUrl:false }).catch(showError);
    return;
  }
  const bibleLocation = bibleLocationFromUrl();
  if (bibleLocation) {
    openBibleReaderLocation(bibleLocation, { updateUrl:false, rememberHistory:false }).catch(showError);
    return;
  }
  selectedPageId = null;
  renderEmptyPage();
  if (activeSearchQuery) renderSearch(activeSearchQuery).catch(showError); else renderTree().catch(showError);
});
