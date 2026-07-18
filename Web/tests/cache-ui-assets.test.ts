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
  assert.equal(styles.includes('.page-focus-mode .page.html-view-active > :not(.html-frame) { display:none; }'), true);
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
