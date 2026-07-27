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

function bibleReaderModuleLabel(moduleName) {
  const module = bibleReaderModules.find(item => item.shortName === moduleName);
  return [module?.shortName, module?.displayName].filter(Boolean).join(' · ') || moduleName;
}

function storedBibleReaderTranslationModules(primaryModule) {
  let saved = [];
  try {
    const value = JSON.parse(localStorage.getItem('biblenote.reader.translationModules') || '[]');
    if (Array.isArray(value)) saved = value.filter(item => typeof item === 'string');
  } catch {
    // Ignore malformed state left by an older or interrupted session.
  }
  const available = new Set(bibleReaderModules.map(module => module.shortName));
  const secondaries = saved.filter(module => module !== primaryModule && available.has(module));
  return [primaryModule, ...new Set(secondaries)].filter(Boolean).slice(0, 3);
}

function setBibleReaderTranslationModules(modules) {
  const primaryModule = bibleReaderModuleEl.value || currentBibleModule();
  const available = new Set(bibleReaderModules.map(module => module.shortName));
  bibleReaderTranslationModules = [
    primaryModule,
    ...modules.filter(module => module !== primaryModule && available.has(module))
  ].filter(Boolean).slice(0, 3);
  localStorage.setItem('biblenote.reader.translationModules', JSON.stringify(bibleReaderTranslationModules));
}

function syncBibleReaderTranslationModules() {
  setBibleReaderTranslationModules(storedBibleReaderTranslationModules(
    bibleReaderModuleEl.value || currentBibleModule()
  ));
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
  bibleReaderModules = modules.filter(module => module?.shortName);
  fillBibleModuleSelect(bibleReaderModuleEl, modules, state.module);
  if (bibleReaderModuleEl.disabled) {
    bibleReaderStatusEl.textContent = result.available ? 'Загруженные модули не найдены.' : (result.error || 'BibleNote недоступен.');
    fillBibleReaderBooks([], undefined, undefined);
    return;
  }
  syncBibleReaderTranslationModules();
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

function createBibleReaderVerseActions(ref) {
  const actions = document.createElement('span');
  actions.className = 'bible-reader-verse-actions';
  const notesButton = document.createElement('button');
  notesButton.className = 'bible-reader-action';
  notesButton.type = 'button';
  notesButton.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3h9l4 4v5M14 3v5h4M8 12h4M8 16h2"/><circle cx="15.5" cy="16.5" r="3.5"/><path d="m18 19 3 3"/></svg>';
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
    openBibleParallelPanel(ref).catch(showError);
  });
  actions.append(notesButton, parallelButton);
  return actions;
}

function createBibleReaderTranslationsControl() {
  const details = document.createElement('details');
  details.className = 'bible-reader-translations';
  const summary = document.createElement('summary');
  summary.className = 'bible-reader-translations-summary';
  summary.title = 'Выбрать до трёх переводов';
  summary.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h6v14H4zM14 5h6v14h-6z"/></svg><span>Переводы</span><strong>' + bibleReaderTranslationModules.length + '</strong>';
  const menu = document.createElement('div');
  menu.className = 'bible-reader-translations-menu';
  const hint = document.createElement('div');
  hint.className = 'bible-reader-translations-hint';
  hint.textContent = 'Одновременно можно показать до трёх переводов.';
  menu.append(hint);
  const selected = new Set(bibleReaderTranslationModules);
  const pending = [...bibleReaderTranslationModules];
  const choices = [];
  const primaryModule = bibleReaderModuleEl.value || currentBibleModule();
  for (const module of bibleReaderModules) {
    const label = document.createElement('label');
    label.className = 'bible-reader-translation-option';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.value = module.shortName;
    input.checked = selected.has(module.shortName);
    input.disabled = module.shortName === primaryModule
      || (!input.checked && pending.length >= 3);
    const text = document.createElement('span');
    text.className = 'bible-reader-translation-option-text';
    const name = document.createElement('strong');
    name.textContent = bibleReaderModuleLabel(module.shortName);
    text.append(name);
    if (module.shortName === primaryModule) {
      const primary = document.createElement('small');
      primary.textContent = 'Основной перевод';
      text.append(primary);
    }
    input.addEventListener('change', () => {
      if (input.checked) {
        if (pending.length >= 3) {
          input.checked = false;
          return;
        }
        pending.push(module.shortName);
      } else {
        const index = pending.indexOf(module.shortName);
        if (index >= 0) pending.splice(index, 1);
      }
      for (const choice of choices) {
        choice.disabled = choice.value === primaryModule
          || (!choice.checked && pending.length >= 3);
      }
    });
    choices.push(input);
    label.append(input, text);
    menu.append(label);
  }
  const actions = document.createElement('div');
  actions.className = 'bible-reader-translations-actions';
  const apply = document.createElement('button');
  apply.className = 'bible-reader-translations-apply';
  apply.type = 'button';
  apply.textContent = 'Показать';
  apply.addEventListener('click', () => {
    setBibleReaderTranslationModules(pending);
    details.open = false;
    openBibleReaderChapter({ rememberHistory:false, replaceUrl:true }).catch(showError);
  });
  actions.append(apply);
  menu.append(actions);
  details.append(summary, menu);
  return details;
}

function bibleReaderParallelRows(translation) {
  return new Map((Array.isArray(translation?.rows) ? translation.rows : []).map(row => [
    Number(row.baseChapter) + ':' + Number(row.baseVerse),
    row
  ]));
}

function bibleReaderDisplayText(value) {
  return typeof decodeHtmlText === 'function'
    ? decodeHtmlText(value)
    : String(value || '');
}

function toggleBibleReaderVerseSelection(versesEl, row, selectedSelector, verseNumber) {
  const shouldClear = row.classList.contains('selected');
  versesEl.querySelectorAll(selectedSelector).forEach(item => item.classList.remove('selected'));
  if (!shouldClear) row.classList.add('selected');
  saveBibleReaderState({ verse:shouldClear ? undefined : Number(verseNumber) });
}

function renderBibleReaderParallelChapter(versesEl, result, translations, highlightRef) {
  const columns = [
    {
      module:result.module || bibleReaderModuleEl.value,
      moduleName:result.moduleName,
      primary:true,
      result
    },
    ...translations.map(translation => ({
      ...translation,
      rowsByVerse:bibleReaderParallelRows(translation)
    }))
  ];
  versesEl.classList.add('parallel-translations');
  versesEl.style.setProperty('--translation-count', String(columns.length));

  const header = document.createElement('div');
  header.className = 'bible-reader-translation-header';
  header.setAttribute('aria-hidden', 'true');
  header.append(document.createElement('span'));
  for (const column of columns) {
    const cell = document.createElement('div');
    cell.className = 'bible-reader-translation-heading';
    const name = document.createElement('strong');
    name.textContent = bibleReaderModuleLabel(column.module);
    cell.append(name);
    if (column.primary) {
      const primary = document.createElement('span');
      primary.className = 'bible-reader-primary-badge';
      primary.textContent = 'Основной';
      cell.append(primary);
    } else if (column.error) {
      cell.classList.add('error');
      cell.title = column.error;
      const error = document.createElement('span');
      error.textContent = 'Недоступен';
      cell.append(error);
    }
    header.append(cell);
  }
  versesEl.append(header);

  let firstHighlighted = null;
  const primaryVerses = Array.isArray(result.verses) ? result.verses : [];
  for (const verse of primaryVerses) {
    const row = document.createElement('div');
    row.className = 'bible-reader-translation-row';
    row.id = 'bible-verse-' + verse.chapter + '-' + verse.verse;
    row.tabIndex = 0;
    const number = document.createElement('span');
    number.className = 'bible-reader-verse-number';
    number.textContent = verse.topVerse && Number(verse.topVerse) !== Number(verse.verse)
      ? verse.verse + '–' + verse.topVerse
      : String(verse.verse);
    row.append(number);

    const ref = bibleReaderVerseRef(result, verse);
    const primaryCell = document.createElement('div');
    primaryCell.className = 'bible-reader-translation-cell primary';
    primaryCell.dataset.moduleLabel = bibleReaderModuleLabel(columns[0].module);
    const primaryText = document.createElement('span');
    primaryText.className = 'bible-reader-translation-text';
    primaryText.textContent = bibleReaderDisplayText(verse.text);
    primaryCell.append(primaryText, createBibleReaderVerseActions(ref));
    row.append(primaryCell);

    for (const column of columns.slice(1)) {
      const cell = document.createElement('div');
      cell.className = 'bible-reader-translation-cell';
      cell.dataset.moduleLabel = bibleReaderModuleLabel(column.module);
      const mappedRow = column.rowsByVerse?.get(Number(verse.chapter) + ':' + Number(verse.verse));
      const mappedVerses = Array.isArray(mappedRow?.verses) ? mappedRow.verses : [];
      if (column.error) {
        cell.classList.add('error');
        cell.textContent = 'Не удалось загрузить перевод';
      } else if (mappedVerses.length === 0 || mappedVerses.every(item => item.isEmpty && !item.text)) {
        cell.classList.add('empty');
        cell.textContent = '—';
      } else {
        for (const mappedVerse of mappedVerses) {
          if (mappedVerse.isEmpty && !mappedVerse.text) continue;
          const fragment = document.createElement('div');
          fragment.className = 'bible-reader-translation-fragment';
          if (mappedVerses.length > 1
            || Number(mappedVerse.verse) !== Number(verse.verse)
            || Number(mappedVerse.chapter) !== Number(verse.chapter)) {
            const mappedNumber = document.createElement('span');
            mappedNumber.className = 'bible-reader-mapped-number';
            mappedNumber.textContent = mappedVerse.reference
              || (mappedVerse.chapter + ':' + mappedVerse.verse);
            fragment.append(mappedNumber);
          }
          const text = document.createElement('span');
          text.textContent = bibleReaderDisplayText(mappedVerse.text);
          fragment.append(text);
          cell.append(fragment);
        }
        if (!cell.hasChildNodes()) {
          cell.classList.add('empty');
          cell.textContent = '—';
        }
      }
      row.append(cell);
    }

    row.addEventListener('click', () => {
      toggleBibleReaderVerseSelection(
        versesEl,
        row,
        '.bible-reader-translation-row.selected',
        verse.verse
      );
    });
    if (bibleVerseIsInsideReference(verse, highlightRef)) {
      row.classList.add('selected');
      if (!firstHighlighted) firstHighlighted = row;
    }
    versesEl.append(row);
  }
  return firstHighlighted;
}

function renderBibleReaderChapter(result, highlightRef, translations = []) {
  if (typeof setPageFocusMode === 'function' && pageFocusMode) setPageFocusMode(false);
  content.replaceChildren();
  selectedPageId = null;
  currentTargetParagraphIndex = undefined;
  const article = document.createElement('article');
  article.className = 'page bible-reader-page';
  article.classList.toggle('comparison', translations.length > 0);
  const crumbs = document.createElement('div');
  crumbs.className = 'breadcrumbs';
  crumbs.textContent = translations.length > 0
    ? 'Библия / ' + (translations.length + 1) + ' перевода'
    : ['Библия', result.moduleName || result.module].filter(Boolean).join(' / ');
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
  toolbar.append(previous, next, meta, createBibleReaderTranslationsControl());
  const versesEl = document.createElement('div');
  versesEl.className = 'bible-reader-verses';
  let firstHighlighted = null;
  if (translations.length > 0) {
    firstHighlighted = renderBibleReaderParallelChapter(versesEl, result, translations, highlightRef);
  } else for (const verse of Array.isArray(result.verses) ? result.verses : []) {
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
    text.textContent = bibleReaderDisplayText(verse.text);
    const actions = createBibleReaderVerseActions(ref);
    row.append(number, text, actions);
    row.addEventListener('click', () => {
      toggleBibleReaderVerseSelection(
        versesEl,
        row,
        '.bible-reader-verse.selected',
        verse.verse
      );
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
  syncBibleReaderTranslationModules();
  bibleReaderStatusEl.textContent = bibleReaderTranslationModules.length > 1
    ? 'Загрузка переводов...'
    : 'Загрузка главы...';
  const params = new URLSearchParams({
    module:location.module,
    bookIndex:String(location.bookIndex),
    chapter:String(location.chapter)
  });
  if (location.book.name) params.set('bookName', location.book.name);
  if (location.book.shortName) params.set('bookShortName', location.book.shortName);
  const secondaryModules = bibleReaderTranslationModules.filter(module => module !== location.module).slice(0, 2);
  const [result, translations] = await Promise.all([
    api('/api/bible/text?' + params.toString(), { timeoutMs:60000 }),
    Promise.all(secondaryModules.map(async module => {
      const parallelParams = new URLSearchParams({
        baseModule:location.module,
        module,
        bookIndex:String(location.bookIndex),
        chapter:String(location.chapter)
      });
      try {
        return await api('/api/bible/parallel-text?' + parallelParams.toString(), { timeoutMs:60000 });
      } catch (error) {
        return {
          baseModule:location.module,
          module,
          moduleName:bibleReaderModuleLabel(module),
          rows:[],
          error:error?.message || String(error)
        };
      }
    }))
  ]);
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
  renderBibleReaderChapter(result, highlightRef, translations);
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

async function openBibleFromRibbon() {
  await bibleNoteInitialization;
  const panel = bibleReaderSummaryEl.closest('details');
  if (panel) panel.open = true;

  await refreshBibleReaderModules();
  if (bibleReaderModuleEl.disabled || bibleReaderBookEl.disabled) {
    throw new Error(bibleReaderStatusEl.textContent || 'Не удалось открыть Библию.');
  }

  const state = bibleReaderSavedState();
  const book = selectedBibleReaderBook();
  const chapters = Array.isArray(book?.chapters) && book.chapters.length > 0
    ? book.chapters.map(Number)
    : Array.from({ length:Number(book?.chapterCount || 0) }, (_, index) => index + 1);
  const chapter = Number(bibleReaderChapterEl.value)
    || Number(state.chapter)
    || Number(chapters[0]);
  if (!book || !Number.isInteger(chapter) || chapter <= 0) {
    throw new Error('В выбранной книге не найдены главы.');
  }

  await openBibleReaderLocation({
    module:bibleReaderModuleEl.value || state.module,
    bookIndex:Number(book.index),
    chapter
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
  syncBibleReaderTranslationModules();
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

async function tryOpenBibleReaderReference(rawRef) {
  const value = String(rawRef || '').trim();
  if (!value || bibleReaderLoading) return false;
  try {
    const params = new URLSearchParams({
      ref:value,
      module:bibleReaderModuleEl.value || currentBibleModule()
    });
    const result = await api('/api/bible/parse-link?' + params.toString());
    const ref = result.reference;
    if (!ref || !Number.isInteger(Number(ref.bookIndex)) || !Number.isInteger(Number(ref.chapter))) {
      return false;
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
    return true;
  } catch {
    return false;
  }
}
