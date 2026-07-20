import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { cacheUiPageHtml } from '../src/cache-ui-assets.js';

const uiDirectory = fileURLToPath(new URL('../ui/', import.meta.url));

test('cache UI page references only packaged UI assets', () => {
  const html = cacheUiPageHtml.toString('utf8');
  const assetPaths = [...html.matchAll(/(?:href|src)="(\/ui\/[^"]+)"/g)].map(match => match[1]);

  assert.ok(assetPaths.length > 1);
  assert.equal(html.includes('const app = document.getElementById'), false);
  for (const assetPath of assetPaths) {
    assert.equal(fs.existsSync(path.join(uiDirectory, path.basename(assetPath))), true, `${assetPath} is missing`);
  }
});

test('desktop package includes the UI directory', () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(uiDirectory, '..', 'package.json'), 'utf8'));
  assert.ok(packageJson.build.files.includes('ui/**/*'));
});

test('HTML note view uses the available content width', () => {
  const styles = fs.readFileSync(path.join(uiDirectory, 'styles.css'), 'utf8');
  const fullWidthRule = styles.match(/:root \.page\.html-view-active \{([^}]+)\}/)?.[1] ?? '';
  const frameRule = styles.match(/\.html-frame \{([^}]+)\}/)?.[1] ?? '';

  assert.equal(fullWidthRule.includes('width:100%'), true);
  assert.equal(fullWidthRule.includes('max-width:none'), true);
  assert.equal(fullWidthRule.includes('margin:0'), true);
  assert.equal(fullWidthRule.includes('padding:20px 2px 12px'), true);
  assert.equal(fullWidthRule.includes('display:flex'), true);
  assert.equal(fullWidthRule.includes('height:100%'), true);
  assert.equal(fullWidthRule.includes('flex-direction:column'), true);
  assert.equal(frameRule.includes('height:auto'), true);
  assert.equal(frameRule.includes('min-height:0'), true);
  assert.equal(frameRule.includes('flex:1 1 0'), true);
});

test('HTML target highlighting isolates a list item from its nested subitems', () => {
  const apiPageView = fs.readFileSync(path.join(uiDirectory, 'api-page-view.js'), 'utf8');

  assert.equal(apiPageView.includes("filter(child => child.matches('ol,ul'))"), true);
  assert.equal(apiPageView.includes('const targetCandidateText = element =>'), true);
  assert.equal(apiPageView.includes('const targetHighlightElement = (element, targetText, references) =>'), true);
  assert.equal(apiPageView.includes('const highlightElement = targetHighlightElement(best.element'), true);
});

test('HTML target highlighting narrows a table cell to its matching paragraph', () => {
  const apiPageView = fs.readFileSync(path.join(uiDirectory, 'api-page-view.js'), 'utf8');
  const treePages = fs.readFileSync(path.join(uiDirectory, 'tree-pages.js'), 'utf8');

  assert.equal(apiPageView.includes("const paragraphBlockSelector = 'p,li,blockquote,h1,h2,h3,h4,h5,h6'"), true);
  assert.equal(apiPageView.includes('const allNestedParagraphBlocks = element.matches(paragraphBlockSelector)'), true);
  assert.equal(apiPageView.includes('filter(block => !used.has(block))'), true);
  assert.equal(apiPageView.includes('if (matchingParagraphBlock) return matchingParagraphBlock;'), true);
  assert.equal(apiPageView.includes('if (referenceParagraphBlock) return referenceParagraphBlock;'), true);
  assert.equal(apiPageView.includes("if (element.matches('td,th') && allNestedParagraphBlocks.length > 0) return null;"), true);
  assert.equal(treePages.includes('!titleParagraphIndexes.includes(Number(paragraph?.index))'), true);
});

test('comma-delimited Bible references suppress ordinary token highlighting', () => {
  const navigationSearch = fs.readFileSync(path.join(uiDirectory, 'navigation-search.js'), 'utf8');
  const functionStart = navigationSearch.indexOf('function searchRequest');
  const functionEnd = navigationSearch.indexOf('function rerunSearch', functionStart);
  assert.ok(functionStart >= 0 && functionEnd > functionStart, 'Bible-reference search helpers are missing');

  const context = {
    searchOptions:{ regex:false, phrase:false, caseSensitive:false },
    activeSearchQuery:'Мф 5,6',
    currentTargetParagraphIndexes:[32, 63],
    result:{ looksLike:false, highlight:'missing' }
  };
  vm.runInNewContext(
    navigationSearch.slice(functionStart, functionEnd)
      + '\nresult = { looksLike:looksLikeBibleReferenceSearch(activeSearchQuery), highlight:pageHighlightQuery() };',
    context
  );

  assert.equal(context.result.looksLike, true);
  assert.equal(context.result.highlight, '');
});

test('typing in the main search updates open-page matches without reopening the page', () => {
  const navigationSearch = fs.readFileSync(path.join(uiDirectory, 'navigation-search.js'), 'utf8');
  const treePages = fs.readFileSync(path.join(uiDirectory, 'tree-pages.js'), 'utf8');
  const apiPageView = fs.readFileSync(path.join(uiDirectory, 'api-page-view.js'), 'utf8');
  const rerunStart = navigationSearch.indexOf('function rerunSearch()');
  const rerunEnd = navigationSearch.indexOf('\n}', rerunStart) + 2;
  const rerun = navigationSearch.slice(rerunStart, rerunEnd);

  assert.equal(rerun.includes('openPage('), false);
  assert.equal(treePages.includes('article.updateSearchMatches ='), true);
  assert.equal(treePages.includes("type:'onenote-set-target-paragraphs'"), true);
  assert.equal(apiPageView.includes('if(data.type==="onenote-set-target-paragraphs")'), true);
});

test('Ctrl+F opens page find from the main document and HTML frame in any keyboard layout', () => {
  const navigationSearch = fs.readFileSync(path.join(uiDirectory, 'navigation-search.js'), 'utf8');
  const apiPageView = fs.readFileSync(path.join(uiDirectory, 'api-page-view.js'), 'utf8');

  assert.equal(navigationSearch.includes("event.code === 'KeyF' || key === 'f'"), true);
  assert.equal(apiPageView.includes('event.code==="KeyF"||key==="f"'), true);
  assert.equal(apiPageView.includes('parent.postMessage({type:"onenote-page-find-open"},"*")'), true);
  assert.equal(apiPageView.includes("if (data.type === 'onenote-page-find-open')"), true);
  assert.equal(apiPageView.includes('event.source !== frame.contentWindow'), true);
  assert.equal(apiPageView.includes('openPageFind();'), true);
});

test('full page mode provides page navigation and an exit control', () => {
  const html = fs.readFileSync(path.join(uiDirectory, 'index.html'), 'utf8');
  const treePages = fs.readFileSync(path.join(uiDirectory, 'tree-pages.js'), 'utf8');
  const styles = fs.readFileSync(path.join(uiDirectory, 'styles.css'), 'utf8');

  assert.equal(html.includes('id="pageFocusToolbar"'), true);
  assert.equal(html.includes('id="pageFocusPrevious"'), true);
  assert.equal(html.includes('id="pageFocusNext"'), true);
  assert.equal(html.includes('id="pageFocusExit"'), true);
  assert.equal(html.includes('id="pageFocusTitle"'), true);
  assert.equal(html.includes('id="pageFocusPath"'), true);
  assert.equal(treePages.includes('function createPageFocusButton(page)'), true);
  assert.equal(treePages.includes('pageFocusTitle.textContent = pageTitle'), true);
  assert.equal(treePages.includes('pageFocusPath.textContent = pagePath'), true);
  assert.equal(treePages.includes("api('/api/pages?sectionId='"), true);
  assert.equal(treePages.includes("event.key === 'PageUp'"), true);
  assert.equal(treePages.includes("event.key === 'Escape'"), true);
  assert.equal(styles.includes('.page-focus-mode .sidebar'), true);
  assert.equal(styles.includes('.page-focus-menu-item.selected'), true);
});

test('full page mode preserves Bible and Ctrl+F searches', () => {
  const treePages = fs.readFileSync(path.join(uiDirectory, 'tree-pages.js'), 'utf8');
  const styles = fs.readFileSync(path.join(uiDirectory, 'styles.css'), 'utf8');
  const focusModeStart = treePages.indexOf('function setPageFocusMode(enabled, page)');
  const focusModeEnd = treePages.indexOf('async function navigatePageFocus', focusModeStart);
  const focusMode = treePages.slice(focusModeStart, focusModeEnd);

  assert.ok(focusModeStart >= 0 && focusModeEnd > focusModeStart, 'full page mode handler is missing');
  assert.equal(focusMode.includes('clearSearchMatches'), false);
  assert.equal(focusMode.includes("pageFindWidget.classList.contains('hidden')"), true);
  assert.equal(styles.includes('.page-focus-mode .page-find-widget { z-index:46; top:64px; right:16px; }'), true);
  assert.equal(styles.includes('.page-focus-mode .page.html-view-active > :not(.html-frame):not(.match-nav) { display:none; }'), true);
  assert.equal(styles.includes('.page-focus-mode .page.html-view-active > .match-nav { position:fixed; z-index:44; top:60px; left:16px; margin:0; }'), true);
  assert.equal(styles.includes('@media (min-width:960px) { .page-focus-mode .page.html-view-active > .match-nav { top:8px; } }'), true);
});

test('full page toolbar mirrors title search highlighting', () => {
  const treePages = fs.readFileSync(path.join(uiDirectory, 'tree-pages.js'), 'utf8');
  const styles = fs.readFileSync(path.join(uiDirectory, 'styles.css'), 'utf8');

  assert.equal(treePages.includes('function syncPageFocusTitleSearchState(title)'), true);
  assert.equal(treePages.includes("pageFocusTitle.classList.toggle(\n    'bible-paragraph-target'"), true);
  assert.equal(treePages.includes("pageFocusTitle.classList.toggle(\n    'current-match'"), true);
  assert.equal(treePages.includes('syncPageFocusTitleSearchState(title);'), true);
  assert.equal(styles.includes('.page-focus-title.bible-paragraph-target { display:block; padding:2px 4px; margin:-2px -4px 1px; box-shadow:inset 3px 0 0 color-mix(in srgb, var(--accent) 60%, transparent); }'), true);
  assert.equal(styles.includes('.page-focus-title.bible-paragraph-target.current-match { box-shadow:inset 4px 0 0 var(--accent); }'), true);
});

test('desktop window can be reduced for compact reading', () => {
  const electronMain = fs.readFileSync(path.join(uiDirectory, '..', 'src', 'electron-main.ts'), 'utf8');

  assert.equal(electronMain.includes('minWidth: 720'), true);
  assert.equal(electronMain.includes('minHeight: 480'), true);
});

test('full page HTML mode gives the entire viewport to the OneNote content', () => {
  const styles = fs.readFileSync(path.join(uiDirectory, 'styles.css'), 'utf8');
  const toolbarRule = styles.match(/\.page-focus-toolbar \{([^}]+)\}/)?.[1] ?? '';
  const contentRule = styles.match(/\.page-focus-mode \.content \{([^}]+)\}/)?.[1] ?? '';
  const pageRule = styles.match(/\.page-focus-mode \.page\.html-view-active \{([^}]+)\}/)?.[1] ?? '';
  const frameRule = styles.match(/\.page-focus-mode \.page\.html-view-active \.html-frame \{([^}]+)\}/)?.[1] ?? '';

  assert.equal(toolbarRule.includes('right:16px'), true);
  assert.equal(toolbarRule.includes('left:auto'), true);
  assert.equal(toolbarRule.includes('transform:none'), true);
  assert.equal(contentRule.includes('padding-top:0'), true);
  assert.equal(styles.includes('.page-focus-mode .page.html-view-active > :not(.html-frame):not(.match-nav) { display:none; }'), true);
  assert.equal(pageRule.includes('height:100vh'), true);
  assert.equal(pageRule.includes('padding:0'), true);
  assert.equal(frameRule.includes('height:100vh'), true);
  assert.equal(frameRule.includes('border:0'), true);
});

test('section rows do not reserve an empty icon gap', () => {
  const treePages = fs.readFileSync(path.join(uiDirectory, 'tree-pages.js'), 'utf8');
  const styles = fs.readFileSync(path.join(uiDirectory, 'styles.css'), 'utf8');

  assert.equal(treePages.includes('level > 0 && !options.page && options.folder'), true);
  assert.equal(treePages.includes("nodeIcon.className = 'group-icon'"), true);
  assert.equal(treePages.includes("options.section ? ' section-row'"), true);
  assert.equal(styles.includes('.tree-row.section-row'), true);
  assert.equal(styles.includes('.node-icon'), false);
});

test('page rows use OneNote order from first to last', () => {
  const treePages = fs.readFileSync(path.join(uiDirectory, 'tree-pages.js'), 'utf8');
  const comparatorStart = treePages.indexOf('function compareOneNotePageOrder');
  const comparatorEnd = treePages.indexOf('\n}', comparatorStart);
  const comparator = treePages.slice(comparatorStart, comparatorEnd);

  assert.equal(comparator.includes('return leftOrder - rightOrder'), true);
  assert.equal(comparator.includes('return rightOrder - leftOrder'), false);
});

test('page Bible references expose context, reader, and note search actions', () => {
  const bibleReferences = fs.readFileSync(path.join(uiDirectory, 'bible-references.js'), 'utf8');
  const renderStart = bibleReferences.indexOf('function renderBiblePageRefs(data)');
  const renderEnd = bibleReferences.indexOf('async function loadBiblePageRefTexts', renderStart);
  const render = bibleReferences.slice(renderStart, renderEnd);

  assert.equal(render.includes("'Показать в контексте'"), true);
  assert.equal(render.includes("'Открыть в Библии'"), true);
  assert.equal(render.includes("'Поиск заметок'"), true);
  assert.equal(render.includes('<svg viewBox="0 0 24 24"'), true);
  assert.equal(render.includes('showBibleTextContext({ ref })'), true);
  assert.equal(render.includes('openBibleTextInReader(ref)'), true);
  assert.equal(render.includes('showBibleReaderVerseNotes(ref)'), true);
});

test('showing verse notes leaves full page mode so search results are visible', () => {
  const bibleReader = fs.readFileSync(path.join(uiDirectory, 'bible-reader.js'), 'utf8');
  const handlerStart = bibleReader.indexOf('async function showBibleReaderVerseNotes(ref)');
  const handlerEnd = bibleReader.indexOf('\n}', handlerStart);
  const handler = bibleReader.slice(handlerStart, handlerEnd);

  assert.ok(handlerStart >= 0, 'showBibleReaderVerseNotes handler is missing');
  assert.equal(handler.includes('pageFocusMode) setPageFocusMode(false)'), true);
  assert.equal(handler.indexOf('setPageFocusMode(false)') < handler.indexOf('await renderSearch(query)'), true);
});

test('the main search opens recognized Bible references and replaces the separate go-to field', () => {
  const index = fs.readFileSync(path.join(uiDirectory, 'index.html'), 'utf8');
  const bootstrap = fs.readFileSync(path.join(uiDirectory, 'bootstrap.js'), 'utf8');
  const bibleReader = fs.readFileSync(path.join(uiDirectory, 'bible-reader.js'), 'utf8');
  const bibleReferences = fs.readFileSync(path.join(uiDirectory, 'bible-references.js'), 'utf8');

  assert.equal(index.includes('id="bibleReaderReference"'), false);
  assert.equal(index.includes('id="bibleReaderReferenceSubmit"'), false);
  assert.equal(bootstrap.includes('bibleReaderReferenceInput'), false);
  assert.equal(bibleReader.includes('async function tryOpenBibleReaderReference(rawRef)'), true);
  assert.equal(bibleReader.includes("api('/api/bible/parse-link?'"), true);
  assert.equal(bibleReferences.includes('tryOpenBibleReaderReference(searchInput.value).catch(showError)'), true);
});

test('parallel references use a per-verse modal action and a one-fifth drawer', () => {
  const bibleReferences = fs.readFileSync(path.join(uiDirectory, 'bible-references.js'), 'utf8');
  const bibleReader = fs.readFileSync(path.join(uiDirectory, 'bible-reader.js'), 'utf8');
  const notebooksLog = fs.readFileSync(path.join(uiDirectory, 'notebooks-log.js'), 'utf8');
  const treePages = fs.readFileSync(path.join(uiDirectory, 'tree-pages.js'), 'utf8');
  const index = fs.readFileSync(path.join(uiDirectory, 'index.html'), 'utf8');
  const styles = fs.readFileSync(path.join(uiDirectory, 'styles.css'), 'utf8');

  assert.equal(bibleReferences.includes('if (!bibleTextDialog.open) bibleTextDialog.showModal();'), true);
  assert.equal(bibleReferences.includes('function renderBibleTextVerses(result, baseRef, highlightRef = null)'), true);
  assert.equal(bibleReferences.includes("button.innerHTML = '<svg viewBox=\"0 0 24 24\""), true);
  assert.equal(bibleReferences.includes('if (bibleTextDialog.open) bibleTextDialog.close();'), true);
  assert.equal(bibleReader.includes('openBibleParallelPanel(ref).catch(showError);'), true);
  assert.equal(bibleReferences.includes('topVerse:verseNumber'), true);
  assert.equal(bibleReferences.includes(".join('; ');"), true);
  assert.equal(bibleReferences.includes('await renderSearch(query);'), true);
  assert.equal(bibleReferences.includes("meta.textContent = 'Индекс параллельности: '"), true);
  assert.equal(bibleReferences.includes("pluralRu(commonNotes, 'общая заметка', 'общие заметки', 'общих заметок')"), true);
  assert.equal(bibleReferences.includes('const query = [parallelReferenceLabel(targetRef), parallelReferenceLabel(relatedRef)]'), true);
  const showBibleText = bibleReferences.slice(
    bibleReferences.indexOf('async function showBibleText(ref, options = {})'),
    bibleReferences.indexOf('async function showBibleTextContext')
  );
  assert.equal(showBibleText.includes('closeBibleParallelDrawer();'), false);
  assert.equal(bibleReferences.includes("sourceLabel.textContent = 'Исходный стих'"), false);
  assert.equal(bibleReferences.includes('sourceRef.textContent = parallelReferenceLabel(ref)'), false);
  assert.equal(bibleReferences.includes('bibleParallelDrawerSource.append(sourceText)'), true);
  assert.equal(bibleReferences.includes('loadParallelVerseText(ref, sourceText, false)'), true);
  assert.equal(index.includes('id="bibleParallelDrawerSource"'), true);
  assert.equal(bibleReferences.includes("closeBibleParallelDrawerButton.addEventListener('click', closeBibleParallelDrawer)"), true);
  assert.equal(notebooksLog.includes("closeBibleParallelDrawerButton.addEventListener('click', closeBibleParallelDrawer)"), false);
  assert.equal(bibleReferences.includes("document.documentElement.classList.add('bible-parallel-drawer-open')"), true);
  assert.equal(bibleReferences.includes("document.documentElement.classList.remove('bible-parallel-drawer-open')"), true);
  assert.equal(treePages.includes('count:searchResultCountLabel(notebook.count)'), true);
  assert.equal(treePages.includes('? searchWeightLabel(page.bibleWeight)'), true);
  const renderSearch = treePages.slice(treePages.indexOf('async function renderSearch(query)'), treePages.indexOf('function scrollToTargetParagraph'));
  assert.equal(renderSearch.includes('onSync:'), false);
  assert.equal(renderSearch.includes('search:true'), true);
  assert.equal(treePages.includes('function makeSearchResultGroup(button)'), true);
  assert.equal(treePages.includes('children.hidden = open;'), true);
  assert.equal(treePages.includes("button.setAttribute('aria-expanded', String(!open));"), true);
  assert.equal(styles.includes('.tree-row.search-result-row .count { flex:none; color:var(--accent); white-space:nowrap; }'), true);
  assert.equal(index.includes('id="bibleParallelDrawer"'), true);
  assert.equal(index.indexOf('id="bibleParallelDrawer"') > index.indexOf('</dialog>', index.indexOf('id="bibleTextDialog"')), true);
  assert.equal(index.includes('id="showBibleTextParallel"'), false);
  assert.equal(styles.includes('width:20vw'), true);
  assert.equal(styles.includes('.bible-parallel-drawer-open .app { padding-right:20vw; }'), true);
});

test('parallel references combine only consecutive verses with identical evidence', () => {
  const bibleReferences = fs.readFileSync(path.join(uiDirectory, 'bible-references.js'), 'utf8');
  const functionStart = bibleReferences.indexOf('function parallelReferenceLabel');
  const functionEnd = bibleReferences.indexOf('function parallelRefFromRow', functionStart);
  assert.ok(functionStart >= 0 && functionEnd > functionStart, 'parallel grouping helpers are missing');

  const context = {
    rows:[
      { bookIndex:40, bookName:'От Матфея', chapter:17, verse:3, relationWeight:0.04, maxRelationWeight:0.04, relations:1, paragraphs:1, commonNotePageIds:['page-a'] },
      { bookIndex:40, bookName:'От Матфея', chapter:17, verse:4, relationWeight:0.04, maxRelationWeight:0.04, relations:1, paragraphs:1, commonNotePageIds:['page-a'] },
      { bookIndex:40, bookName:'От Матфея', chapter:17, verse:5, relationWeight:0.04, maxRelationWeight:0.04, relations:1, paragraphs:1, commonNotePageIds:['page-b'] },
      { bookIndex:40, bookName:'От Матфея', chapter:17, verse:6, relationWeight:0.02, maxRelationWeight:0.02, relations:1, paragraphs:1, commonNotePageIds:['page-c'] },
      { bookIndex:40, bookName:'От Матфея', chapter:17, verse:7, relationWeight:0.02, maxRelationWeight:0.02, relations:1, paragraphs:1, commonNotePageIds:['page-c'] },
      { bookIndex:40, bookName:'От Матфея', chapter:17, verse:9, relationWeight:0.02, maxRelationWeight:0.02, relations:1, paragraphs:1, commonNotePageIds:['page-c'] }
    ],
    result:[] as Array<{ verse:number; topVerse:number; label:string }>
  };
  vm.runInNewContext(
    bibleReferences.slice(functionStart, functionEnd)
      + '\nresult = groupConsecutiveParallelRows(rows).map(row => ({ verse:row.verse, topVerse:row.topVerse, label:parallelReferenceLabel(row) }));',
    context
  );

  assert.equal(JSON.stringify(context.result), JSON.stringify([
    { verse:3, topVerse:4, label:'От Матфея 17:3-4' },
    { verse:5, topVerse:5, label:'От Матфея 17:5' },
    { verse:6, topVerse:7, label:'От Матфея 17:6-7' },
    { verse:9, topVerse:9, label:'От Матфея 17:9' }
  ]));
});

test('common-note weights sum repeated parallel-reference evidence', () => {
  const cacheUi = fs.readFileSync(path.join(uiDirectory, '..', 'src', 'cache-ui.ts'), 'utf8');
  assert.equal(cacheUi.includes('page.bibleWeight += Number(row.relationWeight || 0);'), true);
  assert.equal(cacheUi.includes('page.bibleWeight = Math.max(page.bibleWeight, Number(row.relationWeight || 0));'), false);
});

test('parallel-reference arrows include a matching page title', () => {
  const treePages = fs.readFileSync(path.join(uiDirectory, 'tree-pages.js'), 'utf8');
  assert.equal(treePages.includes('const titleParagraphIndexes = titleBibleParagraphIndexes(bibleRefs.paragraphs, page.title);'), true);
  assert.equal(treePages.includes('canonicalPageTargetIndexes(currentTargetParagraphIndexes, titleParagraphIndexes)'), true);
  assert.equal(treePages.includes("return [canonicalTitleIndex, ...canonicalIndexes.filter(index => index !== canonicalTitleIndex)];"), true);
  assert.equal(treePages.includes("article.clearSearchMatches = () =>"), true);
  assert.equal(treePages.includes("?.clearSearchMatches?.();"), false);
  assert.equal(treePages.includes("...(title.classList.contains('bible-paragraph-target') ? [title] : [])"), true);
  assert.equal(treePages.includes("title.classList.toggle('page-title-target', titleIsTarget);"), true);
  assert.equal(treePages.includes('!titleParagraphIndexes.includes(paragraphIndex) && targetSet.has(paragraphIndex)'), true);
});

test('parallel-reference arrows retain targets whose plain-text paragraph was not mapped', () => {
  const treePages = fs.readFileSync(path.join(uiDirectory, 'tree-pages.js'), 'utf8');
  const functionStart = treePages.indexOf('function pageNavigationTargets');
  const functionEnd = treePages.indexOf('function updateOpenPageSearchMatches', functionStart);
  assert.ok(functionStart >= 0 && functionEnd > functionStart, 'pageNavigationTargets is missing');

  const context = {
    paragraphTargets:[82, 86, 106].map(paragraphIndex => ({ dataset:{ paragraphIndex:String(paragraphIndex) } })),
    paragraphIndexes:[82, 86, 106, 675],
    document:{ createElement:() => ({ className:'', dataset:{} }) },
    result:[] as number[]
  };
  vm.runInNewContext(
    treePages.slice(functionStart, functionEnd)
      + '\nresult = pageNavigationTargets(paragraphTargets, paragraphIndexes).map(target => Number(target.dataset.paragraphIndex));',
    context
  );

  assert.equal(JSON.stringify(context.result), JSON.stringify([82, 86, 106, 675]));
});

test('Bible paragraph targets decode cached HTML entities before matching page text', () => {
  const bibleReferences = fs.readFileSync(path.join(uiDirectory, 'bible-references.js'), 'utf8');
  const functionStart = bibleReferences.indexOf('function bibleParagraphRanges');
  const functionEnd = bibleReferences.indexOf('function bibleTextRanges', functionStart);
  assert.ok(functionStart >= 0 && functionEnd > functionStart, 'bibleParagraphRanges is missing');

  const context = {
    pageText:'До «Блаженны милостивые» (Матф. 5:7). После',
    bibleRefs:{ paragraphs:[{ index:675, text:'«Блаженны милостивые» (Матф. 5:7).'.replaceAll('«', '&#171;').replaceAll('»', '&#187;') }] },
    decodeHtmlText:(value:string) => value.replaceAll('&#171;', '«').replaceAll('&#187;', '»'),
    result:[] as Array<{ index:number; start:number; end:number }>
  };
  vm.runInNewContext(
    bibleReferences.slice(functionStart, functionEnd)
      + '\nresult = bibleParagraphRanges(pageText, bibleRefs);',
    context
  );

  assert.equal(context.result.length, 1);
  assert.equal(context.result[0]?.index, 675);
  assert.equal(context.pageText.slice(context.result[0]?.start, context.result[0]?.end), '«Блаженны милостивые» (Матф. 5:7).');
});

test('Bible link offsets remain correct after cached HTML entities are decoded', () => {
  const bibleReferences = fs.readFileSync(path.join(uiDirectory, 'bible-references.js'), 'utf8');
  const functionStart = bibleReferences.indexOf('function bibleTextRanges');
  const functionEnd = bibleReferences.indexOf('function parallelParams', functionStart);
  assert.ok(functionStart >= 0 && functionEnd > functionStart, 'bibleTextRanges is missing');

  const rawText = '&#171;Милость&#187; (Матф. 5:7).';
  const referenceText = 'Матф. 5:7';
  const referenceStart = rawText.indexOf(referenceText);
  const context = {
    pageText:'До «Милость» (Матф. 5:7). После',
    bibleRefs:{ paragraphs:[{
      index:675,
      text:rawText,
      references:[{ startIndex:referenceStart, endIndex:referenceStart + referenceText.length - 1 }]
    }] },
    decodeHtmlText:(value:string) => value.replaceAll('&#171;', '«').replaceAll('&#187;', '»'),
    result:[] as Array<{ start:number; end:number }>
  };
  vm.runInNewContext(
    bibleReferences.slice(functionStart, functionEnd)
      + '\nresult = bibleTextRanges(pageText, bibleRefs);',
    context
  );

  assert.equal(context.result.length, 1);
  assert.equal(context.pageText.slice(context.result[0]?.start, context.result[0]?.end), referenceText);
});

test('large OneNote HTML indexes paragraph candidates once before matching', () => {
  const apiPageView = fs.readFileSync(path.join(uiDirectory, 'api-page-view.js'), 'utf8');

  assert.equal(apiPageView.includes('const candidateRows = [...doc.body.querySelectorAll'), true);
  assert.equal(apiPageView.includes('const exactCandidatesByText = new Map()'), true);
  assert.equal(apiPageView.includes('exactCandidatesByText.get(targetText)'), true);
  assert.equal(apiPageView.includes('const bibleLinks = [...doc.body.querySelectorAll'), true);
});

test('revealing a page in the tree clears the current target without reopening the page', () => {
  const treePages = fs.readFileSync(path.join(uiDirectory, 'tree-pages.js'), 'utf8');
  const handlerStart = treePages.indexOf('async function revealPageInTree(page)');
  const handlerEnd = treePages.indexOf('async function renderSections', handlerStart);

  assert.ok(handlerStart >= 0 && handlerEnd > handlerStart, 'revealPageInTree handler is missing');
  const handler = treePages.slice(handlerStart, handlerEnd);
  assert.equal(handler.includes('openPage('), false, 'revealPageInTree must not redraw the page');
  assert.equal(handler.includes('clearPageTargetHighlight(page.id)'), true);
  assert.equal(handler.includes("onenote-clear-target-paragraphs"), true);
});

test('opening a page shows a loading state until its HTML is rendered', () => {
  const treePages = fs.readFileSync(path.join(uiDirectory, 'tree-pages.js'), 'utf8');
  const apiPageView = fs.readFileSync(path.join(uiDirectory, 'api-page-view.js'), 'utf8');
  const handlerStart = treePages.indexOf('async function openPage(id, options = {})');
  const handlerEnd = treePages.indexOf('\n}', handlerStart) + 2;

  assert.ok(handlerStart >= 0 && handlerEnd > handlerStart, 'openPage handler is missing');
  const handler = treePages.slice(handlerStart, handlerEnd);
  const loadingIndex = handler.indexOf("loadingLabel.textContent = 'Загрузка заметки…'");
  const requestIndex = handler.indexOf("await api('/api/page?id='");
  assert.ok(loadingIndex >= 0, 'page loading label is missing');
  assert.ok(requestIndex > loadingIndex, 'page loading state must render before the page request');
  assert.equal(handler.includes("content.setAttribute('aria-busy', 'true')"), true);
  assert.equal(treePages.includes('await htmlFrameReady;'), true, 'HTML rendering must finish before the loading state is removed');
  assert.equal(apiPageView.includes('type:"onenote-html-ready"'), true, 'the frame must report readiness before images finish');
  assert.equal(apiPageView.includes("image.setAttribute('loading', 'lazy')"), true, 'OneNote images must load lazily');
  assert.equal(apiPageView.includes("image.setAttribute('decoding', 'async')"), true, 'OneNote images must decode asynchronously');
  assert.equal(treePages.includes('content.replaceChildren(loading, article);'), true, 'default HTML view must remain covered by the loading state');
  assert.equal(treePages.includes('.finally(finishPageLoading);'), true, 'HTML loading must always dismiss the loading state');
});

test('opening another page cancels obsolete page requests', () => {
  const treePages = fs.readFileSync(path.join(uiDirectory, 'tree-pages.js'), 'utf8');
  const apiPageView = fs.readFileSync(path.join(uiDirectory, 'api-page-view.js'), 'utf8');
  const handlerStart = treePages.indexOf('async function openPage(id, options = {})');
  const handlerEnd = treePages.indexOf('\n}', handlerStart) + 2;
  const handler = treePages.slice(handlerStart, handlerEnd);

  assert.equal(handler.includes('activePageAbortController?.abort()'), true);
  assert.equal(handler.includes('signal:pageAbortController.signal'), true);
  assert.equal(apiPageView.includes("externalSignal?.addEventListener('abort'"), true);
  assert.equal(apiPageView.includes("externalSignal?.aborted ? 'Request cancelled'"), true);
});

test('a page fetch error is not also rendered as an empty OneNote page', () => {
  const sourceDirectory = fileURLToPath(new URL('../src/', import.meta.url));
  const cacheUi = fs.readFileSync(path.join(sourceDirectory, 'cache-ui.ts'), 'utf8');
  const treePages = fs.readFileSync(path.join(uiDirectory, 'tree-pages.js'), 'utf8');

  assert.equal(
    cacheUi.includes('const isEmpty = !cached.fetchError && !hasHtml'),
    true,
    'the API must not classify a failed content download as an empty page'
  );
  assert.equal(
    treePages.includes('if (page.isEmpty && !page.fetchError)'),
    true,
    'the UI must not show the empty-page message together with a fetch error'
  );
});

test('page Bible references are ordered by module position', () => {
  const bibleReferences = fs.readFileSync(path.join(uiDirectory, 'bible-references.js'), 'utf8');
  const renderStart = bibleReferences.indexOf('function renderBiblePageRefs(data)');
  assert.ok(renderStart > 0, 'renderBiblePageRefs is missing');

  const context = {
    input: {
      paragraphs: [
        { references: [
          { normalizedRef:'Откровение 1:1', bookIndex:66, chapter:1, verse:1 },
          { normalizedRef:'Бытие 2:3', bookIndex:1, chapter:2, verse:3 }
        ] },
        { references: [
          { normalizedRef:'Бытие 1:2', bookIndex:1, chapter:1, verse:2 },
          { normalizedRef:'Бытие 1', bookIndex:1, chapter:1 }
        ] }
      ]
    },
    result: [] as string[]
  };
  vm.runInNewContext(
    bibleReferences.slice(0, renderStart)
      + '\nresult = orderedBiblePageRefs(input).map(item => item.ref.normalizedRef);',
    context
  );

  assert.equal(
    JSON.stringify(context.result),
    JSON.stringify(['Бытие 1', 'Бытие 1:2', 'Бытие 2:3', 'Откровение 1:1'])
  );
});
