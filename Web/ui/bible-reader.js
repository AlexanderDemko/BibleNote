function bibleReaderSavedState() {
  // Keep the module and book between launches, but a chapter is only an
  // active reading position for the current window. Stale localStorage
  // values are removed for users upgrading from older versions.
  localStorage.removeItem('biblenote.reader.chapter');
  localStorage.removeItem('biblenote.reader.verse');
  localStorage.removeItem('biblenote.reader.emptyChapterDefault');
  const savedChapter = Number(sessionStorage.getItem('biblenote.reader.chapter') || '');
  return {
    module:localStorage.getItem('biblenote.reader.module') || currentBibleModule(),
    bookIndex:Number(localStorage.getItem('biblenote.reader.bookIndex') || '40') || 40,
    chapter:Number.isInteger(savedChapter) && savedChapter > 0 ? savedChapter : undefined,
    verse:Number(sessionStorage.getItem('biblenote.reader.verse') || '0') || undefined
  };
}

function saveBibleReaderState(extra = {}) {
  const state = {
    module:bibleReaderModuleEl.value || currentBibleModule(),
    bookIndex:Number(bibleReaderBookEl.value) || undefined,
    chapter:Number(bibleReaderChapterEl.value) || undefined,
    ...extra
  };
  if (state.module) localStorage.setItem('biblenote.reader.module', state.module);
  if (state.bookIndex) localStorage.setItem('biblenote.reader.bookIndex', String(state.bookIndex));
  if (state.chapter) sessionStorage.setItem('biblenote.reader.chapter', String(state.chapter));
  else sessionStorage.removeItem('biblenote.reader.chapter');
  if (state.verse) sessionStorage.setItem('biblenote.reader.verse', String(state.verse));
  else sessionStorage.removeItem('biblenote.reader.verse');
}

function selectedBibleReaderBook() {
  const bookIndex = Number(bibleReaderBookEl.value);
  return bibleReaderBooks.find(book => Number(book.index) === bookIndex);
}

function updateBibleReaderNavButtons() {
  const book = selectedBibleReaderBook();
  const chapter = Number(bibleReaderChapterEl.value);
  const chapters = Array.isArray(book?.chapters) ? book.chapters.map(Number) : [];
  const firstChapter = chapters[0] || 1;
  const lastChapter = chapters[chapters.length - 1] || Number(book?.chapterCount || 1);
  const hasBook = Boolean(book);
  bibleReaderPrevButton.disabled = !hasBook || !Number.isInteger(chapter) || chapter <= firstChapter;
  bibleReaderNextButton.disabled = !hasBook || !Number.isInteger(chapter) || chapter >= lastChapter;
}

function fillBibleReaderChapters(preferredChapter) {
  const book = selectedBibleReaderBook();
  bibleReaderChapterEl.replaceChildren();
  const preferred = Number(preferredChapter);
  const hasPreferred = Number.isInteger(preferred) && preferred > 0;
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = 'Глава';
  placeholder.selected = !hasPreferred;
  bibleReaderChapterEl.append(placeholder);
  const chapters = Array.isArray(book?.chapters) && book.chapters.length > 0
    ? book.chapters
    : Array.from({ length:Number(book?.chapterCount || 0) }, (_, index) => index + 1);
  for (const chapter of chapters) {
    const option = document.createElement('option');
    option.value = String(chapter);
    option.textContent = String(chapter);
    option.selected = Number(chapter) === preferred;
    bibleReaderChapterEl.append(option);
  }
  bibleReaderChapterEl.disabled = chapters.length === 0;
  updateBibleReaderNavButtons();
}

function fillBibleReaderBooks(books, preferredBookIndex, preferredChapter) {
  bibleReaderBooks = books;
  bibleReaderBookEl.replaceChildren();
  for (const book of books) {
    const option = document.createElement('option');
    option.value = String(book.index);
    option.textContent = book.name || book.shortName || String(book.index);
    if (book.shortName && book.name && book.shortName !== book.name) option.title = book.shortName;
    option.selected = Number(book.index) === Number(preferredBookIndex);
    bibleReaderBookEl.append(option);
  }
  bibleReaderBookEl.disabled = bibleReaderBookEl.options.length === 0;
  if (bibleReaderBookEl.options.length > 0 && !bibleReaderBookEl.value) bibleReaderBookEl.selectedIndex = 0;
  fillBibleReaderChapters(preferredChapter);
}

function currentBibleReaderLocation() {
  return {
    module:bibleReaderModuleEl.value || currentBibleModule(),
    book:selectedBibleReaderBook(),
    bookIndex:Number(bibleReaderBookEl.value),
    chapter:Number(bibleReaderChapterEl.value)
  };
}

async function refreshBibleReaderModules() {
  const state = bibleReaderSavedState();
  bibleReaderStatusEl.textContent = 'Загрузка модулей...';
  const result = await api('/api/biblenote/modules');
  const modules = Array.isArray(result.modules) ? result.modules : [];
  fillBibleModuleSelect(bibleReaderModuleEl, modules, state.module);
  if (bibleReaderModuleEl.disabled) {
    bibleReaderStatusEl.textContent = result.available ? 'Загруженные модули не найдены.' : (result.error || 'BibleNote недоступен.');
    fillBibleReaderBooks([], undefined, undefined);
    return;
  }
  await refreshBibleReaderBooks(state.bookIndex, state.chapter);
}

async function refreshBibleReaderBooks(preferredBookIndex, preferredChapter, options = {}) {
  if (!bibleReaderModuleEl.value) return;
  bibleReaderLoading = true;
  bibleReaderStatusEl.textContent = 'Загрузка книг...';
  try {
    const result = await api('/api/bible/books?' + new URLSearchParams({ module:bibleReaderModuleEl.value }).toString(), { timeoutMs:60000 });
    const books = Array.isArray(result.books) ? result.books : [];
    fillBibleReaderBooks(books, preferredBookIndex, preferredChapter);
    bibleReaderStatusEl.textContent = books.length > 0 ? '' : 'В модуле не найдены книги.';
    if (books.length > 0 && options.open === true && Number(bibleReaderChapterEl.value) > 0) await openBibleReaderChapter();
  } finally {
    bibleReaderLoading = false;
  }
}

function bibleReaderVerseRef(result, verse) {
  const book = selectedBibleReaderBook();
  const bookName = result.bookName || book?.name;
  const bookShortName = result.bookShortName || book?.shortName;
  const referenceName = bookShortName || bookName || 'Библия';
  const verseReference = String(verse.reference || '').trim();
  const fullReference = /[A-Za-zА-Яа-яЁё]/.test(verseReference)
    ? verseReference
    : referenceName + ' ' + verse.chapter + ':' + verse.verse;
  return {
    normalizedRef:fullReference,
    originalText:fullReference,
    module:result.module || bibleReaderModuleEl.value || currentBibleModule(),
    bookIndex:result.bookIndex || Number(bibleReaderBookEl.value),
    bookName,
    bookShortName,
    chapter:Number(verse.chapter),
    verse:Number(verse.verse),
    topChapter:Number(verse.chapter),
    topVerse:Number(verse.verse)
  };
}

async function showBibleReaderVerseNotes(ref) {
  if (typeof setPageFocusMode === 'function' && pageFocusMode) setPageFocusMode(false);
  const query = ref.normalizedRef || ref.originalText || '';
  searchInput.value = query;
  activeSearchQuery = query;
  rememberSearch(query);
  const notesPanel = document.querySelector('.notes-panel');
  if (notesPanel) notesPanel.setAttribute('open', '');
  await renderSearch(query);
}

function renderBibleReaderChapter(result, highlightRef) {
  if (typeof setPageFocusMode === 'function' && pageFocusMode) setPageFocusMode(false);
  content.replaceChildren();
  selectedPageId = null;
  currentTargetParagraphIndex = undefined;
  const article = document.createElement('article');
  article.className = 'page bible-reader-page';
  const crumbs = document.createElement('div');
  crumbs.className = 'breadcrumbs';
  crumbs.textContent = ['Библия', result.moduleName || result.module].filter(Boolean).join(' / ');
  const title = document.createElement('h2');
  title.textContent = [result.bookName || selectedBibleReaderBook()?.name || 'Книга', result.chapter].filter(Boolean).join(' ');
  const heading = document.createElement('div');
  heading.className = 'page-heading';
  const headingActions = document.createElement('div');
  headingActions.className = 'page-heading-actions';
  headingActions.append(createViewHistoryButtons());
  heading.append(title, headingActions);
  const toolbar = document.createElement('div');
  toolbar.className = 'bible-reader-toolbar';
  const previous = document.createElement('button');
  previous.className = 'bible-reader-nav-button';
  previous.type = 'button';
  previous.textContent = '←';
  previous.title = 'Предыдущая глава';
  previous.disabled = bibleReaderPrevButton.disabled;
  previous.addEventListener('click', () => stepBibleReaderChapter(-1).catch(showError));
  const next = document.createElement('button');
  next.className = 'bible-reader-nav-button';
  next.type = 'button';
  next.textContent = '→';
  next.title = 'Следующая глава';
  next.disabled = bibleReaderNextButton.disabled;
  next.addEventListener('click', () => stepBibleReaderChapter(1).catch(showError));
  const meta = document.createElement('div');
  meta.className = 'bible-text-meta';
  meta.textContent = result.reference || '';
  toolbar.append(previous, next, meta);
  const versesEl = document.createElement('div');
  versesEl.className = 'bible-reader-verses';
  let firstHighlighted = null;
  for (const verse of Array.isArray(result.verses) ? result.verses : []) {
    const block = document.createElement('div');
    block.className = 'bible-reader-verse-block';
    const row = document.createElement('div');
    row.className = 'bible-reader-verse';
    row.id = 'bible-verse-' + verse.chapter + '-' + verse.verse;
    row.tabIndex = 0;
    const ref = bibleReaderVerseRef(result, verse);
    const number = document.createElement('span');
    number.className = 'bible-reader-verse-number';
    number.textContent = String(verse.verse);
    const text = document.createElement('span');
    text.className = 'bible-reader-verse-text';
    text.textContent = verse.text || '';
    const actions = document.createElement('span');
    actions.className = 'bible-reader-verse-actions';
    const notesButton = document.createElement('button');
    notesButton.className = 'bible-reader-action';
    notesButton.type = 'button';
    notesButton.textContent = '≡';
    notesButton.title = 'Показать заметки';
    notesButton.setAttribute('aria-label', 'Показать заметки для ' + (ref.normalizedRef || ref.originalText));
    notesButton.addEventListener('click', event => {
      event.stopPropagation();
      showBibleReaderVerseNotes(ref).catch(showError);
    });
    const parallelButton = document.createElement('button');
    parallelButton.className = 'bible-reader-action';
    parallelButton.type = 'button';
    parallelButton.textContent = '⇄';
    parallelButton.title = 'Показать параллельные ссылки';
    parallelButton.setAttribute('aria-label', 'Показать параллельные ссылки для ' + (ref.normalizedRef || ref.originalText));
    parallelButton.addEventListener('click', event => {
      event.stopPropagation();
      loadParallelRefs(ref, block).catch(showError);
    });
    actions.append(notesButton, parallelButton);
    row.append(number, text, actions);
    row.addEventListener('click', () => {
      versesEl.querySelectorAll('.bible-reader-verse.selected').forEach(item => item.classList.remove('selected'));
      row.classList.add('selected');
      saveBibleReaderState({ verse:Number(verse.verse) });
    });
    if (bibleVerseIsInsideReference(verse, highlightRef)) {
      row.classList.add('selected');
      if (!firstHighlighted) firstHighlighted = row;
    }
    block.append(row);
    versesEl.append(block);
  }
  article.append(crumbs, heading, toolbar, versesEl);
  content.append(article);
  refreshPageFind();
  if (firstHighlighted) requestAnimationFrame(() => firstHighlighted.scrollIntoView({ block:'center', behavior:'smooth' }));
}

async function openBibleReaderChapter(options = {}) {
  const location = currentBibleReaderLocation();
  if (!location.book || !Number.isInteger(location.chapter) || location.chapter <= 0) {
    bibleReaderStatusEl.textContent = 'Выберите модуль, книгу и главу.';
    return;
  }
  saveBibleReaderState({ verse:options.ref?.verse || options.verse });
  bibleReaderStatusEl.textContent = 'Загрузка главы...';
  const params = new URLSearchParams({
    module:location.module,
    bookIndex:String(location.bookIndex),
    chapter:String(location.chapter)
  });
  if (location.book.name) params.set('bookName', location.book.name);
  if (location.book.shortName) params.set('bookShortName', location.book.shortName);
  const result = await api('/api/bible/text?' + params.toString(), { timeoutMs:60000 });
  bibleReaderSummaryEl.textContent = 'Библия: ' + (result.bookShortName || location.book.shortName || location.book.name) + ' ' + location.chapter;
  bibleReaderStatusEl.textContent = '';
  const highlightRef = options.ref || (options.verse ? {
    module:location.module,
    bookIndex:location.bookIndex,
    bookName:location.book.name,
    bookShortName:location.book.shortName,
    chapter:location.chapter,
    verse:Number(options.verse),
    topChapter:location.chapter,
    topVerse:Number(options.verse)
  } : null);
  if (options.updateUrl !== false) updateBibleReaderUrl(location, options.replaceUrl === true, highlightRef);
  if (options.rememberHistory !== false) {
    rememberViewHistory({
      type:'bible',
      module:location.module,
      bookIndex:location.bookIndex,
      chapter:location.chapter,
      verse:highlightRef?.verse,
      topChapter:highlightRef?.topChapter,
      topVerse:highlightRef?.topVerse
    });
  } else {
    updateViewHistoryButtons();
  }
  renderBibleReaderChapter(result, highlightRef);
}

async function stepBibleReaderChapter(delta) {
  const book = selectedBibleReaderBook();
  if (!book) return;
  const chapters = Array.isArray(book.chapters) && book.chapters.length > 0
    ? book.chapters.map(Number)
    : Array.from({ length:Number(book.chapterCount || 0) }, (_, index) => index + 1);
  const current = Number(bibleReaderChapterEl.value);
  const currentIndex = chapters.indexOf(current);
  const nextIndex = currentIndex + delta;
  if (nextIndex < 0 || nextIndex >= chapters.length) return;
  bibleReaderChapterEl.value = String(chapters[nextIndex]);
  updateBibleReaderNavButtons();
  await openBibleReaderChapter();
}

async function openBibleReaderLocation(location, options = {}) {
  if (!location?.module || !location?.bookIndex || !location?.chapter) return;
  if (bibleReaderModuleEl.value !== location.module) {
    bibleReaderModuleEl.value = location.module;
    localStorage.setItem('biblenote.reader.module', location.module);
    await refreshBibleReaderBooks(Number(location.bookIndex), Number(location.chapter));
  } else if (bibleReaderBookEl.disabled || Number(bibleReaderBookEl.value) !== Number(location.bookIndex)) {
    await refreshBibleReaderBooks(Number(location.bookIndex), Number(location.chapter));
  }
  bibleReaderBookEl.value = String(location.bookIndex);
  fillBibleReaderChapters(Number(location.chapter));
  bibleReaderChapterEl.value = String(location.chapter);
  updateBibleReaderNavButtons();
  await openBibleReaderChapter({
    rememberHistory:options.rememberHistory,
    updateUrl:options.updateUrl,
    replaceUrl:options.replaceUrl,
    ref:location.verse ? {
      module:location.module,
      bookIndex:Number(location.bookIndex),
      chapter:Number(location.chapter),
      verse:Number(location.verse),
      topChapter:Number(location.topChapter || location.chapter),
      topVerse:Number(location.topVerse || location.verse)
    } : undefined
  });
}

async function openBibleTextInReader(ref = currentBibleTextRef) {
  if (!ref?.bookIndex || !ref?.chapter) return;
  const moduleName = ref.module || currentBibleModule();
  if (bibleReaderModuleEl.value !== moduleName) {
    bibleReaderModuleEl.value = moduleName;
    localStorage.setItem('biblenote.reader.module', moduleName);
  }
  if (bibleReaderBookEl.disabled || Number(bibleReaderBookEl.value) !== Number(ref.bookIndex)) {
    await refreshBibleReaderBooks(Number(ref.bookIndex), Number(ref.chapter));
  }
  bibleReaderBookEl.value = String(ref.bookIndex);
  fillBibleReaderChapters(Number(ref.chapter));
  bibleReaderChapterEl.value = String(ref.chapter);
  updateBibleReaderNavButtons();
  if (bibleTextDialog.open) bibleTextDialog.close();
  await openBibleReaderChapter({ ref });
}

bibleReaderModuleEl.addEventListener('change', () => {
  const state = bibleReaderSavedState();
  localStorage.setItem('biblenote.reader.module', bibleReaderModuleEl.value);
  refreshBibleReaderBooks(state.bookIndex, state.chapter, { open:true }).catch(showError);
});
bibleReaderBookEl.addEventListener('change', () => {
  fillBibleReaderChapters(undefined);
  saveBibleReaderState();
});
bibleReaderChapterEl.addEventListener('change', () => {
  updateBibleReaderNavButtons();
  saveBibleReaderState();
  if (Number(bibleReaderChapterEl.value) > 0) openBibleReaderChapter().catch(showError);
});
bibleReaderPrevButton.addEventListener('click', () => stepBibleReaderChapter(-1).catch(showError));
bibleReaderNextButton.addEventListener('click', () => stepBibleReaderChapter(1).catch(showError));
bibleReaderReferenceInput.addEventListener('input', () => {
  bibleReaderReferenceInput.removeAttribute('aria-invalid');
  if (bibleReaderStatusEl.dataset.referenceError === 'true') {
    bibleReaderStatusEl.textContent = '';
    delete bibleReaderStatusEl.dataset.referenceError;
  }
});
bibleReaderReferenceForm.addEventListener('submit', async event => {
  event.preventDefault();
  const rawRef = bibleReaderReferenceInput.value.trim();
  if (!rawRef || bibleReaderLoading || bibleReaderReferenceSubmitButton.disabled) return;
  bibleReaderReferenceInput.removeAttribute('aria-invalid');
  delete bibleReaderStatusEl.dataset.referenceError;
  bibleReaderReferenceSubmitButton.disabled = true;
  bibleReaderStatusEl.textContent = 'Распознавание отрывка...';
  try {
    const params = new URLSearchParams({
      ref:rawRef,
      module:bibleReaderModuleEl.value || currentBibleModule()
    });
    const result = await api('/api/bible/parse-link?' + params.toString());
    const ref = result.reference;
    if (!ref || !Number.isInteger(Number(ref.bookIndex)) || !Number.isInteger(Number(ref.chapter))) {
      throw new Error('Не удалось распознать библейский отрывок.');
    }
    await openBibleReaderLocation({
      ...ref,
      module:ref.module || bibleReaderModuleEl.value || currentBibleModule(),
      bookIndex:Number(ref.bookIndex),
      chapter:Number(ref.chapter),
      verse:ref.verse == null ? undefined : Number(ref.verse),
      topChapter:ref.topChapter == null ? undefined : Number(ref.topChapter),
      topVerse:ref.topVerse == null ? undefined : Number(ref.topVerse)
    });
    bibleReaderStatusEl.textContent = '';
  } catch (error) {
    bibleReaderReferenceInput.setAttribute('aria-invalid', 'true');
    bibleReaderStatusEl.dataset.referenceError = 'true';
    bibleReaderStatusEl.textContent = error?.message || String(error);
  } finally {
    bibleReaderReferenceSubmitButton.disabled = false;
  }
});
