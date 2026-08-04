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

test('PDF viewer assets and the visual PDF route are packaged', () => {
  const viewerHtml = fs.readFileSync(path.join(uiDirectory, 'pdf-viewer.html'), 'utf8');
  const viewerScript = fs.readFileSync(path.join(uiDirectory, 'pdf-viewer.js'), 'utf8');
  const viewerStyles = fs.readFileSync(path.join(uiDirectory, 'pdf-viewer.css'), 'utf8');
  const treePages = fs.readFileSync(path.join(uiDirectory, 'tree-pages.js'), 'utf8');
  const cacheUi = fs.readFileSync(path.join(uiDirectory, '..', 'src', 'cache-ui.ts'), 'utf8');
  const assets = fs.readFileSync(path.join(uiDirectory, '..', 'src', 'cache-ui-assets.ts'), 'utf8');

  assert.match(viewerHtml, /pdf_viewer\.css/);
  assert.match(viewerScript, /new PDFViewer/);
  assert.match(viewerScript, /page-fit/);
  assert.match(viewerScript, /onenote-main-search-result/);
  assert.match(viewerScript, /onenote-pdf-context/);
  assert.match(viewerScript, /pdf-bible-link/);
  assert.equal(viewerScript.includes("if (activeFindKind === 'main' && mainSearch.key) return;"), true);
  assert.equal(viewerScript.includes('scheduleMainAlignment(countChanged ? 180 : 0);'), true);
  assert.equal(viewerStyles.includes('.textLayer .highlight { --highlight-bg-color:rgba(255,211,61,.64); --highlight-selected-bg-color:rgba(167,100,223,.78);'), true);
  assert.equal(viewerStyles.includes('.textLayer .highlight.selected { outline:2px solid #7a35b7;'), true);
  assert.match(treePages, /\/ui\/pdf-viewer\.html\?id=/);
  assert.match(treePages, /const preferHtmlView = page\.hasHtml && defaultPageViewMode\(\) === 'html';/);
  assert.match(treePages, /postPdfFrameContext\(htmlFrame, pdfContext\)/);
  assert.equal(treePages.includes('void setPageVisualView(false)'), false);
  assert.match(cacheUi, /url\.pathname === '\/api\/page-pdf'/);
  assert.match(assets, /pdf\.worker\.min\.mjs/);
});

test('PDF page context maps parsed Bible references to bnVerse links and paragraph targets', () => {
  const treePages = fs.readFileSync(path.join(uiDirectory, 'tree-pages.js'), 'utf8');
  const helperStart = treePages.indexOf('function normalizedPdfAnchor');
  const helperEnd = treePages.indexOf('\nfunction postPdfFrameContext', helperStart);
  assert.ok(helperStart >= 0 && helperEnd > helperStart, 'PDF context helpers are missing');

  const context: Record<string, any> = {
    decodeHtmlText:(value: string) => value,
    result:undefined
  };
  vm.runInNewContext(
    treePages.slice(helperStart, helperEnd)
      + `\nresult = pdfPageContext({ paragraphs:[{ index:4, text:'Перед Втор 17:19 после', references:[{ originalText:'Втор 17:19', normalizedRef:'Второзаконие 17:19', startIndex:6, endIndex:15 }] }] }, [4], [{ paragraphIndex:4, startIndex:6, endIndex:15 }]);`,
    context
  );

  assert.equal(context.result.bibleLinks[0].href, 'bnVerse:Второзаконие 17:19');
  assert.equal(context.result.bibleLinks[0].text, 'Втор 17:19');
  assert.equal(context.result.targets[0].paragraphIndex, 4);
  assert.equal(context.result.targets[0].query, 'Втор 17:19');
  assert.equal(context.result.targets[0].highlightText, 'Перед Втор 17:19 после');
});

test('PDF page context does not apply context-dependent references globally', () => {
  const treePages = fs.readFileSync(path.join(uiDirectory, 'tree-pages.js'), 'utf8');
  const helperStart = treePages.indexOf('function normalizedPdfAnchor');
  const helperEnd = treePages.indexOf('\nfunction postPdfFrameContext', helperStart);
  assert.ok(helperStart >= 0 && helperEnd > helperStart, 'PDF context helpers are missing');

  const context: Record<string, any> = {
    decodeHtmlText:(value: string) => value,
    result:undefined
  };
  vm.runInNewContext(
    treePages.slice(helperStart, helperEnd)
      + `\nresult = pdfPageContext({ paragraphs:[{ index:90, text:'Евр. 11:23, затем 1:3', references:[
        { originalText:'Евр. 11:23', normalizedRef:'Евреям 11:23', entryType:'BookChapterVerse' },
        { originalText:'1:3', normalizedRef:'Евреям 1:3', entryType:'ChapterVerse' }
      ] }] });`,
    context
  );

  assert.equal(context.result.bibleLinks.length, 1);
  assert.equal(context.result.bibleLinks[0].text, 'Евр. 11:23');
  assert.equal(context.result.bibleLinks[0].href, 'bnVerse:Евреям 11:23');
});

test('PDF page context applies a context-dependent reference when its book matches the page title', () => {
  const treePages = fs.readFileSync(path.join(uiDirectory, 'tree-pages.js'), 'utf8');
  const helperStart = treePages.indexOf('function normalizedPdfAnchor');
  const helperEnd = treePages.indexOf('\nfunction postPdfFrameContext', helperStart);
  const context: Record<string, any> = { decodeHtmlText:(value: string) => value, result:undefined };
  vm.runInNewContext(
    treePages.slice(helperStart, helperEnd)
      + `\nresult = pdfPageContext({ paragraphs:[{ index:6, references:[
        { originalText:'1:3', normalizedRef:'Ефесянам 1:3', bookName:'К Ефесянам', entryType:'ChapterVerse' }
      ] }] }, [], [], 'Перевод к Ефесянам от Тогобицкого');`,
    context
  );

  assert.equal(context.result.bibleLinks.length, 1);
  assert.equal(context.result.bibleLinks[0].text, '1:3');
  assert.equal(context.result.bibleLinks[0].href, 'bnVerse:Ефесянам 1:3');
});

test('PDF page context suppresses conflicting context-dependent mappings for the same text', () => {
  const treePages = fs.readFileSync(path.join(uiDirectory, 'tree-pages.js'), 'utf8');
  const helperStart = treePages.indexOf('function normalizedPdfAnchor');
  const helperEnd = treePages.indexOf('\nfunction postPdfFrameContext', helperStart);
  const context: Record<string, any> = { decodeHtmlText:(value: string) => value, result:undefined };
  vm.runInNewContext(
    treePages.slice(helperStart, helperEnd)
      + `\nresult = pdfPageContext({ paragraphs:[{ index:1, references:[
        { originalText:'1:3', normalizedRef:'Ефесянам 1:3', bookName:'К Ефесянам', entryType:'ChapterVerse' },
        { originalText:'1:3', normalizedRef:'Евреям 1:3', bookName:'К Евреям', entryType:'ChapterVerse' }
      ] }] }, [], [], 'Ефесянам и Евреям');`,
    context
  );

  assert.equal(context.result.bibleLinks.length, 0);
});

test('OneNote Ribbon settings and binaries are Windows-only package features', () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(uiDirectory, '..', 'package.json'), 'utf8'));
  const html = fs.readFileSync(path.join(uiDirectory, 'index.html'), 'utf8');
  const settings = fs.readFileSync(path.join(uiDirectory, 'settings.js'), 'utf8');
  const electronMain = fs.readFileSync(path.join(uiDirectory, '..', 'src', 'electron-main.ts'), 'utf8');
  const cacheUi = fs.readFileSync(path.join(uiDirectory, '..', 'src', 'cache-ui.ts'), 'utf8');
  const treePages = fs.readFileSync(path.join(uiDirectory, 'tree-pages.js'), 'utf8');
  const registrar = fs.readFileSync(path.join(uiDirectory, '..', 'windows', 'OneNoteRibbon', 'Registrar', 'Program.cs'), 'utf8');
  const ribbonAddIn = fs.readFileSync(
    path.join(uiDirectory, '..', 'windows', 'OneNoteRibbon', 'RibbonAddIn', 'RibbonAddIn.cs'),
    'utf8'
  );
  const ribbonProject = fs.readFileSync(
    path.join(uiDirectory, '..', 'windows', 'OneNoteRibbon', 'RibbonAddIn', 'RibbonAddIn.csproj'),
    'utf8'
  );
  const integrationStart = html.indexOf('id="oneNoteIntegrationSettings"');
  const integrationEnd = html.indexOf('</details>', integrationStart);
  const integrationHtml = html.slice(integrationStart, integrationEnd);

  assert.equal(html.includes('id="oneNoteIntegrationSettings"'), true);
  assert.equal(html.includes('id="enableOneNoteRibbon"'), true);
  assert.equal(html.includes('быстрого анализа через COM'), false);
  assert.equal(html.includes('быстрого анализа и открытия BibleNote'), true);
  assert.equal(html.includes('Добавить вкладку BibleNote в OneNote'), true);
  assert.equal(settings.includes('Добавить вкладку BibleNote во все найденные версии OneNote'), true);
  assert.equal(html.includes('Открытие библейских ссылок'), true);
  assert.equal(html.includes('Настроить открытие ссылок'), true);
  assert.equal(integrationHtml.includes('id="registerBibleProtocol"'), true);
  assert.equal(integrationHtml.includes('id="protocolStatus"'), true);
  assert.equal(html.includes('class="settings-module-section protocol-settings"'), false);
  assert.equal(settings.includes("'Библейские ссылки открываются в BibleNote.'"), true);
  assert.equal(settings.includes('Обработчик isbtBibleVerse'), false);
  assert.equal(settings.includes('Electron-сборке'), false);
  assert.equal(settings.includes('program.ribbonRegistered'), false);
  assert.equal(registrar.includes('GroupBy(item => new { item.View, item.MajorVersion })'), true);
  assert.equal(registrar.includes('OrderByDescending(item => item.MajorVersion).First()'), false);
  assert.equal(registrar.includes('serverKey.SetValue("CodeBase", codeBase)'), true);
  assert.equal(registrar.includes('RegistryHive.LocalMachine'), true);
  assert.equal(registrar.includes('appIdKey.SetValue("DllSurrogate", string.Empty)'), true);
  assert.equal(registrar.includes('Verb = "runas"'), true);
  assert.equal(registrar.includes('TrustBibleProtocolForOffice(targetUserSid)'), true);
  assert.equal(registrar.includes('Trusted Protocols\\All Applications'), true);
  assert.equal(registrar.includes('RegistryHive.Users'), true);
  assert.equal(registrar.includes('{ "bnVerse:", "isbtBibleVerse:" }'), true);
  assert.equal(ribbonProject.includes('Reference Include="Extensibility,'), true);
  assert.equal(ribbonProject.includes('Reference Include="office,'), true);
  assert.equal(ribbonProject.includes('<TargetFrameworkVersion>v4.0</TargetFrameworkVersion>'), true);
  assert.equal(ribbonProject.includes('Microsoft.CSharp.targets'), true);
  assert.equal(ribbonAddIn.includes('public class RibbonAddIn : IDTExtensibility2, IRibbonExtensibility'), true);
  assert.equal(ribbonAddIn.includes('public void OnRibbonAction(IRibbonControl control)'), true);
  assert.equal(ribbonAddIn.includes('<group id=\\"BibleNoteCommandsGroup\\" label=\\"BibleNote\\">'), true);
  assert.equal(ribbonAddIn.includes('BibleNoteAnalysisGroup'), false);
  assert.equal(ribbonAddIn.includes('BibleNoteApplicationGroup'), false);
  assert.equal(ribbonAddIn.includes('label=\\"Открыть Библию\\"'), true);
  assert.equal(ribbonAddIn.includes('screentip=\\"Открыть Библию в BibleNote.\\"'), true);
  assert.equal(ribbonAddIn.includes('label=\\"Синхронизировать текущую страницу\\"'), true);
  assert.equal(ribbonAddIn.includes('screentip=\\"Синхронизировать текущую страницу с BibleNote.\\"'), true);
  assert.equal(ribbonAddIn.includes('label=\\"Распознать библейские ссылки\\"'), true);
  assert.equal(ribbonAddIn.includes('screentip=\\"Распознать библейские ссылки без синхронизации с BibleNote.\\"'), true);
  assert.equal(ribbonAddIn.includes('label=\\"Открыть в BibleNote\\"'), true);
  assert.equal(ribbonAddIn.includes('screentip=\\"Открыть текущую страницу в BibleNote.\\"'), true);
  assert.ok(ribbonAddIn.indexOf('BibleNoteOpenBible') < ribbonAddIn.indexOf('BibleNoteQuickAnalyze'));
  assert.ok(ribbonAddIn.indexOf('BibleNoteQuickAnalyze') < ribbonAddIn.indexOf('BibleNoteAnalyzeCurrent'));
  assert.ok(ribbonAddIn.indexOf('BibleNoteAnalyzeCurrent') < ribbonAddIn.indexOf('BibleNoteOpen\\"'));
  assert.equal(ribbonProject.includes('Resources\\OpenBible.png'), true);
  assert.equal(ribbonAddIn.includes('ext_ConnectMode connectMode'), true);
  assert.equal(ribbonAddIn.includes('ClassInterfaceType.AutoDispatch'), true);
  assert.equal(ribbonAddIn.includes('onenote-ribbon.log'), true);
  assert.equal(settings.includes("result?.platform === 'win32'"), true);
  assert.equal(electronMain.includes("process.platform !== 'win32'"), true);
  assert.equal(electronMain.includes("const primaryBibleProtocol = 'bnverse'"), true);
  assert.equal(electronMain.includes("const legacyBibleProtocol = 'isbtbibleverse'"), true);
  assert.equal(electronMain.includes('/^(?:bnVerse|isbtBibleVerse):/i'), true);
  assert.equal(electronMain.includes("if (action === 'analyze-current') focusMainWindow();"), false);
  assert.equal(electronMain.includes("action === 'open-bible'"), true);
  assert.equal(electronMain.includes('Promise.resolve(openBibleFromRibbon())'), true);
  assert.equal(electronMain.includes('Синхронизация страницы «${currentPageTitle}»…'), true);
  assert.equal(electronMain.includes('Страница «${currentPageTitle}» синхронизирована с BibleNote.'), true);
  assert.equal(cacheUi.includes("url.pathname === '/api/ribbon/current-page'"), true);
  assert.equal(cacheUi.includes("dataSource:'com'"), true);
  assert.equal(cacheUi.includes("url.pathname === '/api/system/open-onenote-page'"), true);
  assert.equal(electronMain.includes("url.pathname === '/onenote/open-page'"), true);
  assert.equal(treePages.includes("button.title = 'Открыть в OneNote'"), true);
  assert.equal(treePages.includes("button.hidden = !oneNoteIntegrationEnabled"), true);
  assert.equal(treePages.includes("/^onenote:/i.test(target)"), true);
  assert.equal(treePages.includes("body:JSON.stringify({ url:target, pageId:localPageId })"), true);
  assert.equal(cacheUi.includes('await bibleNoteOneNotePageLink(pageId)'), true);
  assert.equal(treePages.includes('class="onenote-logo"'), true);
  assert.equal(cacheUi.includes('const exactPage = currentPage.pageId ? getCachedPage(db, currentPage.pageId) : undefined;'), true);
  assert.equal(cacheUi.includes('return json(response, 200, { currentPage:cachedPage, needsBackgroundSync:true });'), true);
  assert.equal(electronMain.includes("const response = await fetchOneNoteRibbonRoute('analyze-current');"), true);
  assert.equal(electronMain.includes('if (body?.needsBackgroundSync === true)'), true);
  assert.ok(electronMain.indexOf('Promise.resolve(openPage(') < electronMain.indexOf('if (body?.needsBackgroundSync === true)'));
  assert.equal(electronMain.includes('selectedPageId === ${JSON.stringify(pageId)}'), true);
  assert.equal(electronMain.includes('{ updateUrl:false, rememberHistory:false }'), true);
  assert.equal(electronMain.includes('Обновляем страницу «${currentPageTitle}» из OneNote…'), true);
  assert.equal(electronMain.includes('Страница «${currentPageTitle}» обновлена из OneNote.'), true);
  assert.equal(electronMain.includes('Не удалось обновить страницу из OneNote: ${message}'), true);
  assert.equal(electronMain.includes("if (action === 'open-bible' || action === 'open') focusMainWindow(true);"), true);
  assert.equal(electronMain.includes('Быстрый анализ завершён.'), false);
  assert.equal(electronMain.includes('Promise.resolve(openPage('), true);
  assert.equal(electronMain.includes('await showOneNotePageLoading();'), true);
  assert.equal(electronMain.includes('await showOneNotePageLoading(currentPageTitle);'), true);
  assert.equal(electronMain.includes('showOneNotePageLoadingError(message)'), true);
  assert.equal(treePages.includes("function showRibbonPageLoading(pageTitle = '')"), true);
  assert.equal(treePages.includes('Если страницы ещё нет в BibleNote, сначала синхронизируем её.'), true);
  assert.equal(treePages.includes('function showRibbonPageLoadingError(message)'), true);
  assert.equal(electronMain.includes('response.status !== 503'), true);
  assert.equal(electronMain.includes('focusMainWindow(true);'), true);
  assert.equal(electronMain.includes('setAlwaysOnTop(true)'), true);
  assert.equal(electronMain.includes('setAlwaysOnTop(false)'), true);
  assert.equal(cacheUi.includes('if (cachedPage && !ribbonCurrentPageOperations.has(operationKey))'), false);
  assert.equal(cacheUi.includes('if (cachedPage) {'), true);
  assert.equal(
    packageJson.build.win.extraResources.some((resource: any) => resource.to === 'OneNoteRibbon'),
    true
  );
  assert.equal(packageJson.build.extraResources.some((resource: any) => resource.to === 'OneNoteRibbon'), false);
});

test('auxiliary Bible reference setting explains brackets and affected results', () => {
  const html = fs.readFileSync(path.join(uiDirectory, 'index.html'), 'utf8');

  assert.equal(html.includes('Показывать ссылки в [] и {}'), false);
  assert.equal(html.includes('Учитывать библейские ссылки в квадратных [ ] и фигурных { } скобках'), true);
  assert.equal(html.includes('Включать такие ссылки в поиск, список ссылок страницы и параллельные места.'), true);
  assert.equal(html.includes('aria-describedby="showAuxBibleRefsHint"'), true);
});

test('module settings do not expose the internal BibleNote health status', () => {
  const settings = fs.readFileSync(path.join(uiDirectory, 'settings.js'), 'utf8');

  assert.equal(settings.includes("'Статус: ' + result.status"), false);
  assert.equal(settings.includes("'Модуль: ' + [result.module, result.moduleName]"), false);
  assert.equal(settings.includes("'Каталог модулей: ' + (result.modulesDirectory"), true);
});

test('first-run wizard connects a data source and completes an initial Bible-aware sync', () => {
  const html = fs.readFileSync(path.join(uiDirectory, 'index.html'), 'utf8');
  const settings = fs.readFileSync(path.join(uiDirectory, 'settings.js'), 'utf8');
  const styles = fs.readFileSync(path.join(uiDirectory, 'styles.css'), 'utf8');
  const cacheUi = fs.readFileSync(path.join(uiDirectory, '..', 'src', 'cache-ui.ts'), 'utf8');

  assert.equal((html.match(/data-setup-step="/g) || []).length, 5);
  assert.equal(html.includes('<h3>Источник данных</h3>'), true);
  assert.equal(html.includes('Перевод Библии'), true);
  assert.equal(html.includes('Интеграция с OneNote'), true);
  assert.equal(html.includes('Коллекции и первая загрузка'), true);
  assert.equal(html.includes('OneNote Client ID:'), false);
  assert.equal(html.includes('Модуль BibleNote:'), false);
  assert.equal(settings.includes("api('/api/onenote/login/start'"), true);
  assert.equal(settings.includes("api('/api/onenote/remote-notebooks'"), true);
  assert.equal(settings.includes("api('/api/status', { timeoutMs:120000 })"), true);
  assert.equal(settings.includes('incrementalMetadata:setupCacheHasPages'), true);
  assert.equal(settings.includes("setupCacheHasPages ? 'Обновить заметки' : 'Загрузить заметки'"), true);
  assert.equal(settings.includes('setupHasConfiguredNotebookSelection'), true);
  assert.equal(html.includes('id="notebookPanel"'), false);
  assert.equal(settings.includes("'Всего страниц в локальном кеше', cacheStatus.pages || 0"), true);
  assert.equal(settings.includes("'Всего распознанных ссылок в кеше', cacheStatus.bibleReferences || 0"), false);
  assert.equal(settings.includes("'Заново обработано страниц', result.bibleRefsPagesParsed || 0"), true);
  assert.equal(settings.includes("'Ссылок найдено на них', result.bibleRefsRecognized || 0"), true);
  assert.equal(settings.includes("'Непроверенных разделов', result.sectionScanErrors"), true);
  assert.equal(settings.includes('setupMicrosoftConnectionControlsEl.hidden = connected'), true);
  assert.equal(html.includes('id="setupChangeMicrosoftAccount"'), true);
  assert.equal(styles.includes('.setup-device-code[hidden]'), true);
  assert.equal(settings.includes('parseBibleRefs:true'), true);
  assert.equal(settings.includes('concurrency:1'), true);
  assert.equal(settings.includes("localStorage.setItem('biblenote.setupWizardDone', 'true')"), true);
  assert.equal(cacheUi.includes("url.pathname === '/api/onenote/login/start'"), true);
  assert.equal(cacheUi.includes("url.pathname === '/api/onenote/remote-notebooks'"), true);
  assert.equal(cacheUi.includes("url.pathname === '/api/statistics'"), true);
});

test('text and HTML note views use the available content width', () => {
  const styles = fs.readFileSync(path.join(uiDirectory, 'styles.css'), 'utf8');
  const textWidthRule = styles.match(/:root \.page:not\(\.bible-reader-page\) \{([^}]+)\}/)?.[1] ?? '';
  const fullWidthRule = styles.match(/:root \.page\.html-view-active \{([^}]+)\}/)?.[1] ?? '';
  const frameRule = styles.match(/\.html-frame \{([^}]+)\}/)?.[1] ?? '';

  assert.equal(textWidthRule.includes('width:100%'), true);
  assert.equal(textWidthRule.includes('max-width:none'), true);
  assert.equal(textWidthRule.includes('margin:0'), true);
  assert.equal(textWidthRule.includes('padding-top:20px'), true);
  assert.equal(textWidthRule.includes('padding-right:2px'), true);
  assert.equal(textWidthRule.includes('padding-left:clamp(12px, 1.5vw, 24px)'), true);
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

test('open-page highlighting ignores one-character words in relaxed search', () => {
  const bibleReferences = fs.readFileSync(path.join(uiDirectory, 'bible-references.js'), 'utf8');
  const helperStart = bibleReferences.indexOf('function searchHighlightTerms');
  const helperEnd = bibleReferences.indexOf('function appendHighlightedText', helperStart);
  assert.ok(helperStart >= 0 && helperEnd > helperStart, 'Search highlight helper is missing');

  const context = { result:[] };
  vm.runInNewContext(
    bibleReferences.slice(helperStart, helperEnd)
      + "\nresult = searchHighlightTerms({ query:'в тяжбе', caseSensitive:false });",
    context
  );

  assert.deepEqual([...context.result], ['тяжбе']);
});

test('main search clear button uses a pointer cursor', () => {
  const styles = fs.readFileSync(path.join(uiDirectory, 'styles.css'), 'utf8');
  assert.equal(styles.includes('.search::-webkit-search-cancel-button { cursor:pointer; }'), true);
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
  assert.equal(treePages.includes("type:'onenote-main-search'"), true);
  assert.equal(treePages.includes('scrollToFirst:Boolean(query)'), true);
  assert.equal(treePages.includes('postHtmlFrameMainSearch(htmlFrame, currentInlineSearchQuery, activeMatchIndex, true)'), true);
  assert.equal(apiPageView.includes('if(data.type==="onenote-main-search")'), true);
  assert.equal(apiPageView.includes('[data-onenote-main-search-current]'), true);
  assert.equal(apiPageView.includes('type:"onenote-main-search-result"'), true);
  assert.equal(treePages.includes("data.type !== 'onenote-main-search-result'"), true);
  assert.equal(treePages.includes('htmlSearchMatchCount'), true);
  assert.equal(treePages.includes('showingHtml && !navigationUsesParagraphTargets && htmlSearchResultsReady'), true);
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
  assert.equal(treePages.includes("if (isPdfPage) article.classList.add('pdf-page');"), true);
  assert.equal(treePages.includes("matchNav.classList.toggle('html-match-nav-overlay', shouldOverlay);"), true);
  assert.equal(treePages.includes('const top = Math.max(0, htmlFrame.offsetTop - matchNav.offsetHeight - 8);'), true);
  assert.equal(styles.includes(':root:not(.page-focus-mode) .match-nav.html-match-nav-overlay { position:absolute; top:var(--html-match-nav-top, 0); right:10px; left:auto; margin:0; transform:none; }'), true);
  assert.equal(styles.includes('.page-focus-mode:has(.page.pdf-page.html-view-active) .page-focus-toolbar { right:170px; width:min(680px, calc(100vw - 186px)); }'), true);
  assert.equal(styles.includes('.page.pdf-page.html-view-active > .folder-quality { display:none; }'), true);
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

test('notes panel can switch between the OneNote structure and recent pages', () => {
  const html = fs.readFileSync(path.join(uiDirectory, 'index.html'), 'utf8');
  const bootstrap = fs.readFileSync(path.join(uiDirectory, 'bootstrap.js'), 'utf8');
  const treePages = fs.readFileSync(path.join(uiDirectory, 'tree-pages.js'), 'utf8');
  const styles = fs.readFileSync(path.join(uiDirectory, 'styles.css'), 'utf8');
  const cacheUi = fs.readFileSync(path.join(uiDirectory, '..', 'src', 'cache-ui.ts'), 'utf8');

  assert.equal(html.includes('id="notesStructureView"'), true);
  assert.equal(html.includes('id="notesRecentView"'), true);
  assert.equal(bootstrap.includes("localStorage.getItem('onenote.notesListView')"), true);
  assert.equal(treePages.includes('async function renderRecentPages()'), true);
  assert.equal(treePages.includes("api('/api/recent-pages?'"), true);
  assert.equal(treePages.includes("notesListView === 'recent' ? renderRecentPages() : renderTree()"), true);
  assert.equal(styles.includes('.recent-page-row'), true);
  assert.equal(cacheUi.includes("url.pathname === '/api/recent-pages'"), true);
  assert.equal(cacheUi.includes('AND p.fetch_error IS NULL'), true);
  assert.equal(cacheUi.includes('LEFT JOIN page_access pa ON pa.page_id = p.id'), true);
  assert.equal(cacheUi.includes("THEN 'opened' ELSE 'modified' END AS recentReason"), true);
  assert.equal(cacheUi.includes('ORDER BY recentAt DESC'), true);
  assert.equal(treePages.includes("page.recentReason === 'opened' ? 'открыта здесь ' : 'изменена '"), true);
  assert.equal(treePages.includes('notesViewSwitch.hidden = Boolean(activeSearchQuery)'), true);
  assert.equal(styles.includes('.notes-view-switch[hidden] { display:none !important; }'), true);
  assert.equal(styles.includes('top:8px; right:2px; display:flex'), true);
  assert.equal(styles.includes('.notes-panel[open] > .tree-shell { position:absolute; left:0; right:0; top:42px;'), true);
  assert.equal(styles.includes('@container (max-width:300px)'), true);
});

test('clicking the active recent note does not reload it', () => {
  const treePages = fs.readFileSync(path.join(uiDirectory, 'tree-pages.js'), 'utf8');
  const recentStart = treePages.indexOf('async function renderRecentPages()');
  const recentEnd = treePages.indexOf('function renderNotesList()', recentStart);
  const recentPages = treePages.slice(recentStart, recentEnd);
  const clickStart = recentPages.indexOf('button.onclick = async () => {');
  const clickEnd = recentPages.indexOf('};', clickStart);
  const clickHandler = recentPages.slice(clickStart, clickEnd);

  assert.notEqual(recentStart, -1);
  assert.notEqual(recentEnd, -1);
  assert.notEqual(clickStart, -1);
  assert.equal(clickHandler.includes('if (page.id === selectedPageId) return;'), true);
  assert.ok(clickHandler.indexOf('page.id === selectedPageId') < clickHandler.indexOf('await openPage(page.id)'));
});

test('recent notes keep their visible order while the list is open', () => {
  const treePages = fs.readFileSync(path.join(uiDirectory, 'tree-pages.js'), 'utf8');
  const recentStart = treePages.indexOf('async function renderRecentPages()');
  const recentEnd = treePages.indexOf('function renderNotesList()', recentStart);
  const recentPages = treePages.slice(recentStart, recentEnd);
  const clickStart = recentPages.indexOf('button.onclick = async () => {');
  const clickEnd = recentPages.indexOf('};', clickStart);
  const clickHandler = recentPages.slice(clickStart, clickEnd);

  assert.equal(treePages.includes('let recentPagesSnapshot = null;'), true);
  assert.equal(treePages.includes("if (view === 'recent') {"), true);
  assert.equal(recentPages.includes('recentPagesSnapshotKey !== snapshotKey'), true);
  assert.equal(recentPages.includes('const pages = recentPagesSnapshot;'), true);
  assert.equal(clickHandler.includes('renderRecentPages()'), false);
});

test('page Bible references expose usage, context, reader, and note search actions', () => {
  const bibleReferences = fs.readFileSync(path.join(uiDirectory, 'bible-references.js'), 'utf8');
  const renderStart = bibleReferences.indexOf('function renderBiblePageRefs(data)');
  const renderEnd = bibleReferences.indexOf('async function loadBiblePageRefTexts', renderStart);
  const render = bibleReferences.slice(renderStart, renderEnd);

  assert.equal(render.includes("'Показать в заметке'"), true);
  assert.equal(render.includes("'Показать в контексте'"), true);
  assert.equal(render.includes("'Открыть в Библии'"), true);
  assert.equal(render.includes("'Поиск заметок'"), true);
  assert.equal(render.includes('<svg viewBox="0 0 24 24"'), true);
  assert.equal(render.includes('showBiblePageRefUsage(paragraphIndexes)'), true);
  assert.equal(render.includes('showBibleTextContext({ ref })'), true);
  assert.equal(render.includes('openBibleTextInReader(ref)'), true);
  assert.equal(render.includes('showBibleReaderVerseNotes(ref)'), true);
});

test('page Bible reference usage opens every source paragraph in the match navigator', () => {
  const bibleReferences = fs.readFileSync(path.join(uiDirectory, 'bible-references.js'), 'utf8');
  const functionStart = bibleReferences.indexOf('function showBiblePageRefUsage(paragraphIndexes)');
  const functionEnd = bibleReferences.indexOf('function createBibleRefAction', functionStart);
  const updates: any[] = [];
  const context = {
    selectedPageId:'page-1',
    content:{ querySelector:() => ({ updateSearchMatches:(value:any) => updates.push(value) }) },
    CSS:{ escape:(value:string) => value }
  };

  assert.ok(functionStart >= 0 && functionEnd > functionStart, 'showBiblePageRefUsage is missing');
  vm.runInNewContext(
    bibleReferences.slice(functionStart, functionEnd)
      + '\nshowBiblePageRefUsage([8, 8, 3]);',
    context
  );

  assert.equal(JSON.stringify(updates), JSON.stringify([{
    paragraphIndexes:[8, 3],
    bibleOccurrences:[],
    query:'',
    bibleResult:true,
    scrollToFirst:true
  }]));
});

test('page match navigator has an explicit close action', () => {
  const treePages = fs.readFileSync(path.join(uiDirectory, 'tree-pages.js'), 'utf8');
  const navigationStart = treePages.indexOf('const renderMatchNavigation =');
  const navigationEnd = treePages.indexOf('article.updateSearchMatches =', navigationStart);
  const navigation = treePages.slice(navigationStart, navigationEnd);

  assert.ok(navigationStart >= 0 && navigationEnd > navigationStart, 'match navigation is missing');
  assert.equal(navigation.includes("closeMatchNavigation.textContent = '×'"), true);
  assert.equal(navigation.includes("closeMatchNavigation.title = 'Закрыть навигацию'"), true);
  assert.equal(navigation.includes('article.clearSearchMatches?.()'), true);
  assert.equal(navigation.includes("history.replaceState({ pageId:id }, '', pageUrl(id))"), true);
});

test('HTML paragraph navigation is not overwritten by the HTML text-search counter', () => {
  const treePages = fs.readFileSync(path.join(uiDirectory, 'tree-pages.js'), 'utf8');
  const openPageStart = treePages.indexOf('async function openPage(id, options = {})');
  const openPage = treePages.slice(openPageStart);

  assert.ok(openPageStart >= 0, 'openPage is missing');
  assert.equal(openPage.includes('let navigationUsesParagraphTargets = paragraphNavigationTargets.length > 0'), true);
  assert.equal(openPage.includes('if (navigationUsesParagraphTargets) return;'), true);
  assert.equal(openPage.includes('showingHtml && !navigationUsesParagraphTargets && htmlSearchResultsReady'), true);
  assert.equal(openPage.includes('if (showingHtml && !navigationUsesParagraphTargets)'), true);
  assert.equal(openPage.includes("matchCount.textContent = initialNavigationCount > 0"), true);
  assert.equal(openPage.includes('if (!matchNav || htmlSearchMatchCount === 0)'), true);
  assert.equal(openPage.includes('if (initialNavigationCount === 0) return;'), true);
});

test('note search results show source and document type icons', () => {
  const treePages = fs.readFileSync(path.join(uiDirectory, 'tree-pages.js'), 'utf8');
  const cacheUi = fs.readFileSync(path.join(uiDirectory, '..', 'src', 'cache-ui.ts'), 'utf8');
  const searchStart = treePages.indexOf('function renderSearchResults(');
  const searchEnd = treePages.indexOf('async function renderSearch(', searchStart);
  const searchRenderer = treePages.slice(searchStart, searchEnd);

  assert.ok(searchStart >= 0 && searchEnd > searchStart, 'search result renderer is missing');
  assert.equal(searchRenderer.includes('const sourceType = sourceTypeForNotebook(notebook.id);'), true);
  assert.equal(searchRenderer.includes('source:true,'), true);
  assert.equal(searchRenderer.includes('page:true,'), true);
  assert.equal(searchRenderer.includes('fileExtension:page.fileExtension,'), true);
  assert.equal(treePages.includes("typeIcons.className = 'search-weight-type-icons';"), true);
  assert.equal(treePages.includes('typeIcons.append(sourceTypeIcon(sourceType));'), true);
  assert.equal(treePages.includes('fileTypeIcon(page.fileExtension, sourceType)'), true);
  assert.equal(treePages.includes("{ key:'onenote', label:'N', title:'OneNote' }"), true);
  assert.equal(cacheUi.includes("json_extract(links_json, '$.folder.extension') AS fileExtension"), true);
  assert.equal(cacheUi.includes('if (result) result.fileExtension = fileType.fileExtension;'), true);
});

test('closing HTML paragraph navigation cancels delayed highlights and clears every highlight layer', () => {
  const treePages = fs.readFileSync(path.join(uiDirectory, 'tree-pages.js'), 'utf8');
  const apiPageView = fs.readFileSync(path.join(uiDirectory, 'api-page-view.js'), 'utf8');

  assert.equal(treePages.includes("postHtmlFrameMainSearch(htmlFrame, '', 0, false)"), true);
  assert.equal(apiPageView.includes('function clearTargetScrollTimers()'), true);
  assert.equal(apiPageView.includes('[data-onenote-target-paragraph],[data-onenote-target-paragraph-current]'), true);
  assert.equal(apiPageView.includes('[data-onenote-target-match],[data-onenote-target-match-current]'), true);
  assert.equal(apiPageView.includes('clearTargetParagraphs(){clearTargetScrollTimers();'), true);
  assert.equal(apiPageView.includes('clearTargetScrollTimers();scrollTargetParagraph(index,paragraphIndex)'), true);
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

test('the main search includes Bible text results and opens the matching verse', () => {
  const gateway = fs.readFileSync(path.join(uiDirectory, '..', 'src', 'biblenote-gateway.ts'), 'utf8');
  const cacheUi = fs.readFileSync(path.join(uiDirectory, '..', 'src', 'cache-ui.ts'), 'utf8');
  const treePages = fs.readFileSync(path.join(uiDirectory, 'tree-pages.js'), 'utf8');

  assert.equal(gateway.includes('/api/VerseParsing/SearchText?'), true);
  assert.equal(cacheUi.includes("url.pathname === '/api/bible/text-search'"), true);
  assert.equal(treePages.includes("api('/api/bible/text-search?'"), true);
  assert.equal(treePages.includes('function renderBibleTextSearchResults(results, byWeight = false)'), true);
  assert.equal(treePages.includes('button.onclick = () => openBibleReaderLocation({'), true);
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
  assert.equal(bibleReferences.includes("weightMetric.title = 'Вес связи: ' + weight"), true);
  assert.equal(bibleReferences.includes("notesButton.title = 'Общие заметки: ' + commonNotes"), true);
  assert.equal(bibleReferences.includes("toFixed(4).replace(/\\.?0+$/, '').replace('.', ',')"), true);
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
  assert.equal(treePages.includes('count:searchResultWeightLabel(page) || undefined'), true);
  assert.equal(treePages.includes("{ value:'weight', label:'Вес' }"), true);
  assert.equal(treePages.includes('bibleResults.some(result => searchResultWeightValue(result) != null)'), true);
  const renderSearchResultsStart = treePages.indexOf('function renderSearchResults');
  const searchViewSwitch = treePages.slice(treePages.indexOf('function addSearchViewSwitch'), renderSearchResultsStart);
  assert.equal(searchViewSwitch.includes('renderSearch(query)'), false);
  assert.equal(searchViewSwitch.includes('renderSearchResults(query, results, bibleResults, hasSelectedNotebooks)'), true);
  assert.equal(treePages.includes('renderWeightedSearchResults([...results].sort(compareSearchResultsByWeight))'), true);
  const renderSearchResults = treePages.slice(renderSearchResultsStart, treePages.indexOf('async function renderSearch(query)'));
  const renderSearch = treePages.slice(treePages.indexOf('async function renderSearch(query)'), treePages.indexOf('function scrollToTargetParagraph'));
  assert.equal(renderSearch.includes('onSync:'), false);
  assert.equal(renderSearchResults.includes('search:true'), true);
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

test('verse dialog closes only for a click outside its card', () => {
  const notebooksLog = fs.readFileSync(path.join(uiDirectory, 'notebooks-log.js'), 'utf8');
  const functionStart = notebooksLog.indexOf('function bibleTextDialogClickIsOutside(event)');
  const functionEnd = notebooksLog.indexOf("bibleTextDialog.addEventListener('click'", functionStart);
  const dialog = {
    getBoundingClientRect:() => ({ left:100, right:500, top:100, bottom:400 })
  };
  const context = {
    bibleTextDialog:dialog,
    events:[
      { target:dialog, clientX:50, clientY:200 },
      { target:dialog, clientX:200, clientY:200 },
      { target:{}, clientX:50, clientY:200 }
    ],
    result:[] as boolean[]
  };

  assert.notEqual(functionStart, -1);
  assert.notEqual(functionEnd, -1);
  vm.runInNewContext(
    notebooksLog.slice(functionStart, functionEnd)
      + '\nresult = events.map(bibleTextDialogClickIsOutside);',
    context
  );

  assert.deepEqual(context.result, [true, false, false]);
  assert.equal(notebooksLog.includes('if (!bibleTextDialogClickIsOutside(event)) return;'), true);
});

test('main document scrollbar follows dynamic content height', () => {
  const styles = fs.readFileSync(path.join(uiDirectory, 'styles.css'), 'utf8');
  const layout = fs.readFileSync(path.join(uiDirectory, 'layout.js'), 'utf8');

  assert.equal(styles.includes('.tree::-webkit-scrollbar, .content::-webkit-scrollbar { display:none; width:0; height:0; }'), true);
  assert.equal(styles.includes('#contentScrollbar { display:block; z-index:20; }'), true);
  assert.equal(styles.includes('.content-shell:has(.page.html-view-active):not(:has(.page.html-view-active .bible-page-refs[open])) #contentScrollbar { display:none; }'), true);
  assert.equal(styles.includes(':root .page.html-view-active:has(.bible-page-refs[open]) { height:auto; min-height:100%; overflow:visible; }'), true);
  assert.equal(styles.includes(':root .page.html-view-active:has(.bible-page-refs[open]) .html-frame { height:calc(100vh - 32px); min-height:calc(100vh - 32px); flex:none; }'), true);
  const contentRule = styles.slice(styles.indexOf('.content {'), styles.indexOf('}', styles.indexOf('.content {')));
  assert.equal(contentRule.includes('overflow-y:scroll'), true);
  assert.equal(contentRule.includes('scrollbar-width:none'), true);
  assert.equal(layout.includes('const contentResizeObserver = new ResizeObserver(update);'), true);
  assert.equal(layout.includes('for (const child of scroller.children) contentResizeObserver.observe(child);'), true);
  assert.equal(layout.includes('new MutationObserver(observeContentSize).observe(scroller'), true);
  assert.equal(layout.includes("attributeFilter:['open', 'hidden', 'class', 'style']"), true);
});

test('note search uses the same document-and-magnifier icon everywhere', () => {
  const iconPath = 'M5 3h9l4 4v5M14 3v5h4M8 12h4M8 16h2';
  const bibleReferences = fs.readFileSync(path.join(uiDirectory, 'bible-references.js'), 'utf8');
  const bibleReader = fs.readFileSync(path.join(uiDirectory, 'bible-reader.js'), 'utf8');
  const index = fs.readFileSync(path.join(uiDirectory, 'index.html'), 'utf8');
  const styles = fs.readFileSync(path.join(uiDirectory, 'styles.css'), 'utf8');

  assert.equal(bibleReferences.includes(iconPath), true);
  assert.equal(bibleReader.includes(iconPath), true);
  assert.equal(index.includes(iconPath), true);
  assert.equal(styles.includes('.bible-reader-action svg {'), true);
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
      { bookIndex:40, bookName:'От Матфея', chapter:17, verse:9, relationWeight:0.02, maxRelationWeight:0.02, relations:1, paragraphs:1, commonNotePageIds:['page-c'] },
      { bookIndex:39, bookName:'Малахия', chapter:3, verse:0, isChapter:true, relationWeight:0.02, maxRelationWeight:0.02, relations:1, paragraphs:1, commonNotePageIds:['page-d'] }
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
    { verse:9, topVerse:9, label:'От Матфея 17:9' },
    { verse:0, topVerse:0, label:'Малахия 3' }
  ]));
});

test('common-note weights sum repeated parallel-reference evidence', () => {
  const cacheUi = fs.readFileSync(path.join(uiDirectory, '..', 'src', 'cache-ui.ts'), 'utf8');
  const treePages = fs.readFileSync(path.join(uiDirectory, 'tree-pages.js'), 'utf8');
  const bibleReferences = fs.readFileSync(path.join(uiDirectory, 'bible-references.js'), 'utf8');
  assert.equal(cacheUi.includes('page.bibleWeight += Number(row.relationWeight || 0);'), true);
  assert.equal(cacheUi.includes('page.bibleWeight = Math.max(page.bibleWeight, Number(row.relationWeight || 0));'), false);
  assert.equal(cacheUi.includes('noteRows.reduce((sum, note) => sum + Number(note.relationWeight || 0), 0)'), true);
  assert.equal(cacheUi.includes('Number(right.relationWeight || 0) - Number(left.relationWeight || 0)'), true);
  assert.equal(treePages.includes("return 'вес ' + numericWeight.toFixed(4)"), true);
  assert.equal(treePages.includes('суммарный вес'), false);
  assert.equal(bibleReferences.includes("toFixed(4).replace(/\\.?0+$/, '').replace('.', ',')"), true);
  assert.equal(bibleReferences.includes("for (const notebookId of selectedNotebookIds()) params.append('notebookId', notebookId);"), true);
  assert.equal(bibleReferences.includes("limit:'200'"), true);
});

test('parallel chapter text is limited to two verses with an ellipsis', () => {
  const bibleReferences = fs.readFileSync(path.join(uiDirectory, 'bible-references.js'), 'utf8');
  const functionStart = bibleReferences.indexOf('function bibleVersePreview');
  const functionEnd = bibleReferences.indexOf('function cloneBibleTextRef', functionStart);
  const context = {
    source:{ verses:[
      { reference:'3:1', text:'Первый' },
      { reference:'3:2', text:'Второй' },
      { reference:'3:3', text:'Третий' }
    ] },
    result:''
  };
  assert.ok(functionStart >= 0 && functionEnd > functionStart, 'Bible verse preview helpers are missing');
  vm.runInNewContext(
    bibleReferences.slice(functionStart, functionEnd)
      + '\nresult = bibleVerseText(source, 2);',
    context
  );
  assert.equal(context.result, '3:1 Первый\n3:2 Второй\n…');
  assert.equal(bibleReferences.includes('const maxVerses = Number(ref?.verse) > 0 ? undefined : 2;'), true);
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

test('verse-reference arrows retain separate occurrences inside one paragraph', () => {
  const treePages = fs.readFileSync(path.join(uiDirectory, 'tree-pages.js'), 'utf8');
  const functionStart = treePages.indexOf('function pageNavigationTargets');
  const functionEnd = treePages.indexOf('function updateOpenPageSearchMatches', functionStart);
  assert.ok(functionStart >= 0 && functionEnd > functionStart, 'pageNavigationTargets is missing');

  const occurrences = [
    { paragraphIndex:2, startIndex:0, endIndex:3 },
    { paragraphIndex:2, startIndex:18, endIndex:19 },
    { paragraphIndex:18, startIndex:0, endIndex:1 }
  ];
  const inlineTargets = new Map(occurrences.map(occurrence => {
    const key = `${occurrence.paragraphIndex}:${occurrence.startIndex}:${occurrence.endIndex}`;
    return [key, { dataset:{ bibleOccurrence:key } }];
  }));
  const context = {
    paragraphTargets:[2, 18].map(paragraphIndex => ({ dataset:{ paragraphIndex:String(paragraphIndex) } })),
    paragraphIndexes:[2, 18],
    bibleOccurrences:occurrences,
    inlineRoot:{
      querySelector:(selector:string) => inlineTargets.get(selector.match(/"([^"]+)"/)?.[1] || '')
    },
    bibleOccurrenceKey:(occurrence:any) => `${occurrence.paragraphIndex}:${occurrence.startIndex}:${occurrence.endIndex}`,
    CSS:{ escape:(value:string) => value },
    document:{ createElement:() => ({ className:'', dataset:{} }) },
    result:[] as Array<{ occurrence:string; paragraphIndex:number }>
  };
  vm.runInNewContext(
    treePages.slice(functionStart, functionEnd)
      + '\nresult = pageNavigationTargets(paragraphTargets, paragraphIndexes, bibleOccurrences, inlineRoot).map(target => ({ occurrence:target.dataset.bibleOccurrence, paragraphIndex:Number(target.dataset.paragraphIndex) }));',
    context
  );

  assert.equal(JSON.stringify(context.result), JSON.stringify([
    { occurrence:'2:0:3', paragraphIndex:2 },
    { occurrence:'2:18:19', paragraphIndex:2 },
    { occurrence:'18:0:1', paragraphIndex:18 }
  ]));
});

test('HTML verse-reference arrows prefer the occurrence paragraph over an unrelated navigation index', () => {
  const apiPageView = fs.readFileSync(path.join(uiDirectory, 'api-page-view.js'), 'utf8');
  const scrollFunction = apiPageView.match(/function scrollTargetParagraph\(index,paragraphIndex\)\{[^']+/)?.[0] || '';

  assert.ok(scrollFunction, 'scrollTargetParagraph bridge is missing');
  assert.ok(
    scrollFunction.indexOf('data-onenote-paragraph-index')
      < scrollFunction.indexOf('data-onenote-target-paragraph-index'),
    'paragraph fallback must run before the positional paragraph target'
  );
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
        { index:4, references: [
          { normalizedRef:'Откровение 1:1', bookIndex:66, chapter:1, verse:1 },
          { normalizedRef:'Бытие 2:3', bookIndex:1, chapter:2, verse:3 }
        ] },
        { index:9, references: [
          { normalizedRef:'Бытие 1:2', bookIndex:1, chapter:1, verse:2 },
          { normalizedRef:'Бытие 1', bookIndex:1, chapter:1 },
          { normalizedRef:'Бытие 2:3', bookIndex:1, chapter:2, verse:3 }
        ] }
      ]
    },
    result: [] as Array<{ ref:string; paragraphIndexes:number[] }>
  };
  vm.runInNewContext(
    bibleReferences.slice(0, renderStart)
      + '\nresult = orderedBiblePageRefs(input).map(item => ({ ref:item.ref.normalizedRef, paragraphIndexes:item.paragraphIndexes }));',
    context
  );

  assert.equal(
    JSON.stringify(context.result),
    JSON.stringify([
      { ref:'Бытие 1', paragraphIndexes:[9] },
      { ref:'Бытие 1:2', paragraphIndexes:[9] },
      { ref:'Бытие 2:3', paragraphIndexes:[4, 9] },
      { ref:'Откровение 1:1', paragraphIndexes:[4] }
    ])
  );
});
