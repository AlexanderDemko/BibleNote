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
    requestAnimationFrame(() => updateContentScrollbar?.());
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
    parallelButton.addEventListener('click', () => {
      const action = bibleRefIsExactVerse(ref)
        ? openBibleParallelPanel(ref)
        : showBibleText(ref);
      action.catch(showError);
    });
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

function bibleVersePlainText(result) {
  if (Array.isArray(result?.verses) && result.verses.length > 0) {
    return result.verses
      .map(verse => verse.text)
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

function exactBibleVerseRef(baseRef, result, verse) {
  const chapter = Number(verse.chapter);
  const verseNumber = Number(verse.verse);
  return {
    ...baseRef,
    bookName:result.bookName || baseRef.bookName,
    chapter,
    verse:verseNumber,
    topChapter:chapter,
    topVerse:verseNumber,
    normalizedRef:verse.reference || [result.bookName || baseRef.bookName, chapter + ':' + verseNumber].filter(Boolean).join(' '),
    originalText:verse.reference || baseRef.originalText
  };
}

function createVerseParallelButton(ref) {
  const button = document.createElement('button');
  button.className = 'bible-verse-parallel-button';
  button.type = 'button';
  button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7h11l-3-3M18 7l-3 3M17 17H6l3-3M6 17l3 3"/></svg>';
  button.title = 'Показать параллельные ссылки';
  button.setAttribute('aria-label', 'Показать параллельные ссылки для ' + (ref.normalizedRef || ref.originalText));
  button.addEventListener('click', () => {
    if (bibleTextDialog.open) bibleTextDialog.close();
    openBibleParallelPanel(ref).catch(showError);
  });
  return button;
}

function renderBibleTextVerses(result, baseRef, highlightRef = null) {
  bibleTextContent.replaceChildren();
  const verses = Array.isArray(result.verses) ? result.verses : [];
  if (verses.length === 0) {
    bibleTextContent.textContent = result.text || 'Текст не найден.';
    return [];
  }

  let firstHighlighted = null;
  const exactRefs = [];
  for (const verse of verses) {
    const exactRef = exactBibleVerseRef(baseRef, result, verse);
    exactRefs.push(exactRef);
    const line = document.createElement('div');
    line.className = 'bible-context-line';
    const text = document.createElement('div');
    text.className = 'bible-context-text';
    text.textContent = [verse.reference, verse.text].filter(Boolean).join(' ');
    line.append(text, createVerseParallelButton(exactRef));
    if (highlightRef && bibleVerseIsInsideReference(verse, highlightRef)) {
      line.classList.add('bible-context-highlight');
      if (!firstHighlighted) firstHighlighted = line;
    }
    bibleTextContent.append(line);
  }
  if (firstHighlighted) requestAnimationFrame(() => firstHighlighted.scrollIntoView({ block:'center' }));
  return exactRefs;
}

function renderBibleContextText(result, highlightRef) {
  return renderBibleTextVerses(result, highlightRef, highlightRef);
}

async function showBibleText(ref, options = {}) {
  if (!ref.bookIndex || !ref.chapter) return;
  uiLog('ui.showBibleText', { ref });
  currentBibleTextRef = ref;
  if (options.remember !== false) rememberBibleTextHistory(ref, 'text');
  else updateBibleTextHistoryButtons();
  showBibleTextContextButton.hidden = !ref.verse;
  showBibleTextContextButton.disabled = !ref.verse;
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
    renderBibleTextVerses(result, ref);
  } catch (error) {
    bibleTextMeta.textContent = 'BibleNote';
    bibleTextContent.textContent = 'Не удалось загрузить текст: ' + (error?.message || String(error));
    showBibleTextContextButton.disabled = true;
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
  const paragraphs = bibleParagraphRanges(pageText, bibleRefs);
  if (ranges.length === 0 && paragraphs.length === 0) return appendHighlightedText(container, pageText, query);

  const matches = [];
  const points = new Set([0, pageText.length]);
  for (const range of ranges) {
    points.add(range.start);
    points.add(range.end);
  }
  const targetByStart = new Map();
  const targetByEnd = new Map();
  for (const paragraph of paragraphs) {
    points.add(paragraph.start);
    points.add(paragraph.end);
    targetByStart.set(paragraph.start, paragraph);
    targetByEnd.set(paragraph.end, paragraph);
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
      if (targetParagraphIndexSet.has(startingTargetParagraph.index)) paragraphWrapper.className = 'bible-paragraph-target';
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
    const paragraphText = decodeHtmlText(paragraph.text || '');
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
    const rawParagraphText = paragraph.text || '';
    const paragraphText = decodeHtmlText(rawParagraphText);
    if (!paragraphText) continue;

    let paragraphStart = pageText.indexOf(paragraphText, paragraphSearchFrom);
    if (paragraphStart < 0) paragraphStart = pageText.indexOf(paragraphText);
    if (paragraphStart < 0) continue;
    paragraphSearchFrom = paragraphStart + paragraphText.length;

    for (const ref of paragraph.references || []) {
      if (!Number.isInteger(ref.startIndex) || !Number.isInteger(ref.endIndex)) continue;
      const offsetsNeedDecoding = paragraphText !== rawParagraphText;
      const decodedStartIndex = offsetsNeedDecoding
        ? decodeHtmlText(rawParagraphText.slice(0, ref.startIndex)).length
        : ref.startIndex;
      const decodedEndIndex = offsetsNeedDecoding
        ? decodeHtmlText(rawParagraphText.slice(0, ref.endIndex + 1)).length
        : ref.endIndex + 1;
      const start = paragraphStart + decodedStartIndex;
      const end = paragraphStart + decodedEndIndex;
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

function bibleRefIsExactVerse(ref) {
  return Number.isInteger(Number(ref?.verse))
    && Number(ref.topChapter || ref.chapter) === Number(ref.chapter)
    && Number(ref.topVerse || ref.verse) === Number(ref.verse);
}

function parallelReferenceLabel(ref) {
  const bookName = String(ref?.bookName || '').trim();
  const chapter = Number(ref?.chapter);
  const verse = Number(ref?.verse);
  if (bookName && Number.isInteger(chapter) && Number.isInteger(verse)) {
    const topChapter = Number(ref?.topChapter || chapter);
    const topVerse = Number(ref?.topVerse || verse);
    const rangeEnd = topChapter === chapter && Number.isInteger(topVerse) && topVerse > verse
      ? '-' + topVerse
      : '';
    return bookName + ' ' + chapter + ':' + verse + rangeEnd;
  }
  return ref?.normalizedRef || ref?.originalText || 'Стих';
}

function parallelCommonNoteKey(row) {
  if (!Array.isArray(row?.commonNotePageIds)) return '';
  return row.commonNotePageIds.map(String).sort().join('\u001f');
}

function groupConsecutiveParallelRows(rows) {
  const groups = [];
  for (const source of rows || []) {
    const item = { ...source };
    const previous = groups.at(-1);
    const previousEndVerse = Number(previous?.topVerse || previous?.verse);
    const canJoin = previous
      && Number(previous.bookIndex) === Number(item.bookIndex)
      && Number(previous.chapter) === Number(item.chapter)
      && Number(previous.topChapter || previous.chapter) === Number(item.chapter)
      && Number(item.verse) === previousEndVerse + 1
      && Number(previous.relationWeight) === Number(item.relationWeight)
      && Number(previous.maxRelationWeight) === Number(item.maxRelationWeight)
      && Number(previous.relations) === Number(item.relations)
      && Number(previous.paragraphs) === Number(item.paragraphs)
      && parallelCommonNoteKey(previous) === parallelCommonNoteKey(item);
    if (canJoin) {
      previous.topChapter = item.chapter;
      previous.topVerse = item.verse;
      continue;
    }
    item.topChapter = item.chapter;
    item.topVerse = item.verse;
    groups.push(item);
  }
  return groups;
}

function parallelRefFromRow(row) {
  const normalizedRef = row.bookName && row.chapter && row.verse
    ? row.bookName + ' ' + row.chapter + ':' + row.verse
    : row.normalizedRef;
  return {
    normalizedRef,
    originalText:row.sampleOriginalText || normalizedRef,
    bookIndex:row.bookIndex,
    bookName:row.bookName,
    chapter:row.chapter,
    verse:row.verse,
    topChapter:row.topChapter,
    topVerse:row.topVerse
  };
}

async function loadParallelVerseText(ref, host, includeReference = true) {
  host.textContent = 'Загрузка текста...';
  host.classList.add('loading');
  host.classList.remove('error');
  try {
    const result = await api(bibleTextUrl(ref));
    host.textContent = (includeReference ? bibleVerseText(result) : bibleVersePlainText(result)) || 'Текст не найден.';
    host.classList.remove('loading');
  } catch (error) {
    host.textContent = 'Не удалось загрузить текст: ' + (error?.message || String(error));
    host.classList.remove('loading');
    host.classList.add('error');
  }
}

function closeBibleParallelDrawer() {
  bibleParallelDrawer.hidden = true;
  delete bibleParallelDrawer.dataset.parallelKey;
  bibleParallelDrawerSource.replaceChildren();
  bibleTextParallelPanel.replaceChildren();
  document.documentElement.classList.remove('bible-parallel-drawer-open');
}

closeBibleParallelDrawerButton.addEventListener('click', closeBibleParallelDrawer);

async function showParallelPairNotes(targetRef, relatedRef) {
  const query = [parallelReferenceLabel(targetRef), parallelReferenceLabel(relatedRef)]
    .filter(Boolean)
    .join('; ');
  if (!query) return;
  if (bibleTextDialog.open) bibleTextDialog.close();
  if (typeof setPageFocusMode === 'function' && pageFocusMode) setPageFocusMode(false);
  searchInput.value = query;
  activeSearchQuery = query;
  rememberSearch(query);
  await renderSearch(query);
}

async function openBibleParallelPanel(ref) {
  if (!ref.bookIndex || !ref.chapter || !ref.verse) return;
  const parallelKey = parallelParams(ref).toString();
  bibleParallelDrawer.hidden = false;
  document.documentElement.classList.add('bible-parallel-drawer-open');
  bibleParallelDrawer.dataset.parallelKey = parallelKey;
  bibleParallelDrawerTitle.textContent = parallelReferenceLabel(ref);
  bibleParallelDrawerSource.replaceChildren();
  bibleTextParallelPanel.replaceChildren();
  const sourceText = document.createElement('div');
  sourceText.className = 'bible-parallel-drawer-source-text loading';
  bibleParallelDrawerSource.append(sourceText);
  const loading = document.createElement('div');
  loading.className = 'bible-parallel-meta';
  loading.textContent = 'Загрузка...';
  bibleTextParallelPanel.append(loading);
  loadParallelVerseText(ref, sourceText, false).catch(showError);

  const result = await api('/api/bible/parallel?' + parallelKey);
  if (bibleParallelDrawer.hidden || bibleParallelDrawer.dataset.parallelKey !== parallelKey) return;
  loading.remove();
  if (result.rows.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'bible-parallel-meta';
    empty.textContent = 'Параллельных ссылок пока нет.';
    bibleTextParallelPanel.append(empty);
    return;
  }

  const list = document.createElement('div');
  list.className = 'bible-parallel-list';
  for (const item of groupConsecutiveParallelRows(result.rows)) {
    const relatedRef = parallelRefFromRow(item);
    const row = document.createElement('div');
    row.className = 'bible-parallel-row';
    const head = document.createElement('div');
    head.className = 'bible-parallel-head';
    const refButton = document.createElement('button');
    refButton.className = 'bible-parallel-ref';
    refButton.type = 'button';
    refButton.textContent = parallelReferenceLabel(relatedRef);
    refButton.title = 'Показать текст стиха';
    refButton.addEventListener('click', () => showBibleText(relatedRef).catch(showError));
    const notesButton = document.createElement('button');
    notesButton.className = 'bible-parallel-common-notes';
    notesButton.type = 'button';
    notesButton.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h10v14H5zM9 7h10v13H9M8 9h4M8 12h4"/></svg>';
    notesButton.title = 'Показать общие заметки';
    notesButton.setAttribute('aria-label', 'Показать общие заметки для ' + (ref.normalizedRef || ref.originalText) + ' и ' + (relatedRef.normalizedRef || relatedRef.originalText));
    notesButton.addEventListener('click', () => showParallelPairNotes(ref, relatedRef).catch(showError));
    const meta = document.createElement('span');
    meta.className = 'bible-parallel-meta';
    const commonNotes = Number(item.pages || 0);
    meta.textContent = 'Индекс параллельности: ' + Number(item.relationWeight || 0).toFixed(2)
      + ' · ' + commonNotes + ' '
      + pluralRu(commonNotes, 'общая заметка', 'общие заметки', 'общих заметок');
    const verseText = document.createElement('div');
    verseText.className = 'bible-parallel-note-text bible-parallel-verse-text loading';
    head.append(refButton, meta, notesButton);
    row.append(head, verseText);
    list.append(row);
    loadParallelVerseText(relatedRef, verseText).catch(showError);
  }
  bibleTextParallelPanel.append(list);
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
    event.preventDefault();
    clearTimeout(searchTimer);
    rememberSearch(searchInput.value);
    hideSearchHistory();
    rerunSearch();
    tryOpenBibleReaderReference(searchInput.value).catch(showError);
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
