import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const webDirectory = fileURLToPath(new URL('../', import.meta.url));

test('external Bible links can open in the main Bible reader or the dedicated popup', () => {
  const electronMain = fs.readFileSync(path.join(webDirectory, 'src', 'electron-main.ts'), 'utf8');
  const handlerStart = electronMain.indexOf('async function openBibleLink(link: string)');
  const handlerEnd = electronMain.indexOf('async function startControlServer', handlerStart);
  const handler = electronMain.slice(handlerStart, handlerEnd);

  assert.equal(handler.includes('createBiblePopupWindow()'), true);
  assert.equal(handler.includes('uiBiblePopupUrl(nextLink)'), true);
  assert.equal(handler.includes("localStorage.getItem('biblenote.onenoteLinksOpenInBible') === 'true'"), true);
  assert.equal(handler.includes('window.bibleNoteOpenBibleRefInReader'), true);
  assert.equal(handler.includes("logStartup('bible link opened in main Bible reader')"), true);
  assert.equal(electronMain.includes('bibleVersePopup=1'), true);
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
