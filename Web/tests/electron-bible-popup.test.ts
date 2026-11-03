import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import ts from 'typescript';

const webDirectory = fileURLToPath(new URL('../', import.meta.url));
const electronMain = fs.readFileSync(path.join(webDirectory, 'src', 'electron-main.ts'), 'utf8');

function electronFunction(name: string, context: Record<string, unknown>): (...args: any[]) => Promise<void> {
  const source = ts.createSourceFile('electron-main.ts', electronMain, ts.ScriptTarget.ES2022, true);
  const declaration = source.statements.find(statement =>
    ts.isFunctionDeclaration(statement) && statement.name?.text === name
  );
  assert.ok(declaration, `${name} must exist`);
  const javascript = ts.transpileModule(declaration.getText(source), {
    compilerOptions:{ target:ts.ScriptTarget.ES2022 }
  }).outputText;
  return vm.runInNewContext(`${javascript}\n${name}`, { usesLegacyBibleProtocolHandler:() => false, ...context });
}

test('opening an existing note from OneNote only switches tabs while a new note can refresh', async () => {
  for (const reused of [true, false]) {
    const opened: Array<{ id:string; options:Record<string, unknown> }> = [];
    let refreshes = 0;
    const target = {
      isDestroyed:() => false,
      webContents:{ executeJavaScript:async (script:string) => vm.runInNewContext(script, {
        selectedPageId:'page-1',
        openPage:async (id:string, options:Record<string, unknown>) => {
          opened.push({ id, options });
          return reused ? { reused:true } : undefined;
        }
      }) }
    };
    await electronFunction('performOneNoteRibbonAction', {
      mainWindow:target,
      ensureFullUi:async () => {},
      focusMainWindow:() => {},
      waitForCacheUi:async () => {},
      showOneNotePageLoading:async () => {},
      fetchOneNoteRibbonRoute:async () => new Response(JSON.stringify({
        currentPage:{ id:'page-1', title:'Note' }, needsBackgroundSync:true
      })),
      showRibbonActivity:async () => {},
      refreshCurrentOneNotePageInBackground:async () => { refreshes++; },
      logStartup:() => {}
    })('open');
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(refreshes, reused ? 0 : 1);
    assert.equal(opened.length, reused ? 1 : 2);
    assert.equal(opened[0].id, 'page-1');
    assert.equal(opened[0].options.clearTarget, true);
    assert.equal(opened[0].options.highlightQuery, '');
    if (!reused) assert.equal(opened[1].options.updateUrl, false);
  }
});

test('a stale v4 protocol invocation forwards to v3 when v4 handling is disabled', async () => {
  const events: string[] = [];
  await electronFunction('openBibleLink', {
    usesLegacyBibleProtocolHandler:() => true,
    forwardBibleLinkToLegacy:async (link: string) => { events.push(`legacy:${link}`); },
    ensureFullUi:async () => { events.push('main.ensure'); },
    logStartup:() => {}
  })('bnVerse:Филиппийцам%204:4');
  assert.deepEqual(events, ['legacy:bnVerse:Филиппийцам%204:4']);
});

test('cold startup honors disabled v4 handling even without the forwarding flag', async () => {
  const events: string[] = [];
  await electronFunction('startApplication', {
    process:{ argv:['BibleNote.exe', 'bnVerse:Филиппийцам%204:4'] },
    pendingBibleLink:'bnVerse:Филиппийцам%204:4',
    usesLegacyBibleProtocolHandler:() => true,
    forwardBibleLinkToLegacy:async () => { events.push('legacy.open'); },
    initializeApplication:async () => { events.push('main.initialize'); },
    app:{ quit:() => { events.push('quit'); } }
  })();
  assert.deepEqual(events, ['legacy.open', 'quit']);
});

test('legacy protocol routing is enabled only on Windows when v4 is not the handler', () => {
  for (const [platform, registered, expected] of [['win32', false, true], ['win32', true, false], ['darwin', false, false]]) {
    const actual = electronFunction('usesLegacyBibleProtocolHandler', {
      process:{ platform }, bibleProtocols:['bnverse', 'isbtbibleverse'],
      app:{ isDefaultProtocolClient:() => registered }
    })();
    assert.equal(actual, expected);
  }
});

test('external Bible link opens the popup without raising the main window afterward', async () => {
  const events: string[] = [];
  const popup = {
    isDestroyed:() => false,
    loadURL:async () => { events.push('popup.load'); },
    show:() => { events.push('popup.show'); },
    focus:() => { events.push('popup.focus'); }
  };
  const context = {
    pendingBibleLink:undefined,
    biblePopupWindow:undefined,
    mainWindow:{
      isDestroyed:() => false,
      webContents:{
        getURL:() => 'http://127.0.0.1:4312/',
        executeJavaScript:async () => false
      }
    },
    ensureFullUi:async (show: boolean) => { events.push(`main.ensure:${show}`); },
    waitForCacheUi:async () => {},
    uiUrl:() => 'http://127.0.0.1:4312/',
    uiBiblePopupUrl:() => 'http://127.0.0.1:4312/?bibleVersePopup=1',
    createBiblePopupWindow:() => popup,
    focusMainWindow:() => { events.push('main.focus'); },
    logStartup:() => {}
  };

  await electronFunction('openBibleLink', context)('bnverse:rst/19%20135');
  assert.deepEqual(events, ['main.ensure:false', 'popup.load', 'popup.show', 'popup.focus']);
});

test('external Bible link focuses the main window when the reader is selected', async () => {
  const events: string[] = [];
  let executed = 0;
  const context = {
    pendingBibleLink:undefined,
    biblePopupWindow:undefined,
    mainWindow:{
      isDestroyed:() => false,
      webContents:{
        getURL:() => 'http://127.0.0.1:4312/',
        executeJavaScript:async () => { executed += 1; return true; }
      }
    },
    ensureFullUi:async (show: boolean) => { events.push(`main.ensure:${show}`); },
    waitForCacheUi:async () => {},
    uiUrl:() => 'http://127.0.0.1:4312/',
    focusMainWindow:() => { events.push('main.focus'); },
    logStartup:() => {}
  };

  await electronFunction('openBibleLink', context)('bnverse:rst/19%20135');
  assert.equal(executed, 2);
  assert.deepEqual(events, ['main.ensure:false', 'main.focus']);
});

test('cold start routes an external Bible link through the same popup handling', async () => {
  const events: string[] = [];
  const context = {
    process:{ argv:[] },
    pendingBibleLink:'bnverse:rst/19%20135',
    pendingOneNoteRibbonAction:undefined,
    initializeApplication:async () => {},
    openBibleLink:async (link: string) => { events.push(`link:${link}`); },
    ensureFullUi:async () => { events.push('main.ensure'); }
  };

  await electronFunction('startApplication', context)();
  assert.deepEqual(events, ['link:bnverse:rst/19%20135']);
});

test('cold startup forwards bnVerse to v3 without creating BibleNote 4 windows', async () => {
  const events: string[] = [];
  const context = {
    process:{ argv:['BibleNote.exe', '--open-legacy-bible-link'] },
    usesLegacyBibleProtocolHandler:() => true,
    pendingBibleLink:'bnVerse:Иоанна%203:16',
    forwardBibleLinkToLegacy:async (link: string) => { events.push(`legacy:${link}`); },
    initializeApplication:async () => { events.push('main.initialize'); },
    app:{ quit:() => { events.push('quit'); } }
  };
  await electronFunction('startApplication', context)();
  assert.deepEqual(events, ['legacy:bnVerse:Иоанна%203:16', 'quit']);
});

test('cold startup ignores a cached legacy flag when v4 handling is enabled', async () => {
  const link = 'bnVerse:rst/50%204:5;К%20Филиппийцам%204:5';
  const events: string[] = [];
  await electronFunction('startApplication', {
    process:{ argv:['BibleNote.exe', '--open-legacy-bible-link', link] },
    pendingBibleLink:link,
    pendingOneNoteRibbonAction:undefined,
    usesLegacyBibleProtocolHandler:() => false,
    forwardBibleLinkToLegacy:async () => { events.push('legacy.open'); },
    initializeApplication:async () => { events.push('main.initialize'); },
    openBibleLink:async (value: string) => { events.push(`v4:${value}`); }
  })();
  assert.deepEqual(events, ['main.initialize', `v4:${link}`]);
});

test('a running instance routes cached legacy commands through the current preference', async () => {
  const source = ts.createSourceFile('electron-main.ts', electronMain, ts.ScriptTarget.ES2022, true);
  let listener: ts.Expression | undefined;
  function visit(node: ts.Node): void {
    if (ts.isCallExpression(node) && node.expression.getText(source) === 'app.on'
      && ts.isStringLiteral(node.arguments[0]) && node.arguments[0].text === 'second-instance') {
      listener = node.arguments[1];
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  assert.ok(listener);
  const javascript = ts.transpileModule(`const callback = ${listener.getText(source)}`, {
    compilerOptions:{ target:ts.ScriptTarget.ES2022 }
  }).outputText;
  const link = 'bnVerse:rst/50%204:5;К%20Филиппийцам%204:5';
  const events: string[] = [];
  const callback = vm.runInNewContext(`${javascript}\ncallback`, {
    findBibleProtocolArg:() => link,
    findOneNoteRibbonAction:() => undefined,
    openBibleLink:async (value: string) => { events.push(`current:${value}`); },
    forwardBibleLinkToLegacy:async () => { events.push('legacy.open'); }
  });
  callback({}, ['BibleNote.exe', '--open-legacy-bible-link', link]);
  assert.deepEqual(events, [`current:${link}`]);
});

test('OneNote Bible-link preference is exposed in settings and used on cold startup', () => {
  const html = fs.readFileSync(path.join(webDirectory, 'ui', 'index.html'), 'utf8');
  const settings = fs.readFileSync(path.join(webDirectory, 'ui', 'settings.js'), 'utf8');
  const references = fs.readFileSync(path.join(webDirectory, 'ui', 'bible-references.js'), 'utf8');
  const pageView = fs.readFileSync(path.join(webDirectory, 'ui', 'api-page-view.js'), 'utf8');

  assert.equal(html.includes('id="openOneNoteBibleLinksInReader"'), true);
  assert.equal(html.includes('Открывать ссылки из OneNote сразу в окне «Библия»'), true);
  assert.equal(settings.includes("localStorage.setItem('biblenote.onenoteLinksOpenInBible'"), true);
  assert.equal(references.includes("localStorage.getItem('biblenote.onenoteLinksOpenInBible') === 'true'"), true);
  assert.equal(references.includes('await openBibleRefInReader(rawRef);'), true);
  assert.equal(pageView.includes('window.bibleNoteOpenBibleRefInReader = openBibleRefInReader;'), true);
});

test('Bible popup reuses the in-app verse dialog and Escape closes its window', () => {
  const bootstrap = fs.readFileSync(path.join(webDirectory, 'ui', 'bootstrap.js'), 'utf8');
  const sync = fs.readFileSync(path.join(webDirectory, 'ui', 'sync.js'), 'utf8');
  const dialogs = fs.readFileSync(path.join(webDirectory, 'ui', 'notebooks-log.js'), 'utf8');
  const styles = fs.readFileSync(path.join(webDirectory, 'ui', 'styles.css'), 'utf8');

  assert.equal(bootstrap.includes("get('bibleVersePopup') === '1'"), true);
  assert.equal(sync.includes('if (bibleVersePopupMode)'), true);
  assert.equal(sync.includes("bibleTextContent.textContent = 'Загрузка...'"), true);
  assert.equal(sync.includes('bibleTextDialog.showModal()'), true);
  assert.equal(sync.includes('await openExternalBibleRefFromUrl();'), true);
  assert.equal(dialogs.includes("bibleTextDialog.addEventListener('cancel'"), true);
  assert.equal(dialogs.includes('window.close();'), true);
  assert.equal(dialogs.includes("openBibleActionInMain('reader')"), true);
  assert.equal(dialogs.includes("openBibleActionInMain('notes')"), true);
  assert.equal(styles.includes('.bible-verse-popup-mode .app'), true);
  assert.equal(styles.includes('.bible-verse-popup-mode .bible-text-dialog'), false);
  assert.equal(styles.includes('.bible-verse-popup-mode #showBibleTextNotes'), false);
});
