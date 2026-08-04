import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const webDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('settings and first-run wizard expose generic data source names', () => {
  const html = fs.readFileSync(path.join(webDirectory, 'ui/index.html'), 'utf8');
  const settings = fs.readFileSync(path.join(webDirectory, 'ui/settings.js'), 'utf8');
  const treePages = fs.readFileSync(path.join(webDirectory, 'ui/tree-pages.js'), 'utf8');
  const sync = fs.readFileSync(path.join(webDirectory, 'src/sync.ts'), 'utf8');
  const styles = fs.readFileSync(path.join(webDirectory, 'ui/styles.css'), 'utf8');
  const genericUi = [html, settings, treePages, fs.readFileSync(path.join(webDirectory, 'ui/sync.js'), 'utf8'), fs.readFileSync(path.join(webDirectory, 'ui/notebooks-log.js'), 'utf8')].join('\n');

  assert.equal(html.includes('id="oneNoteDataSource"'), true);
  assert.equal(html.includes('id="dataSourceList"'), true);
  assert.equal(html.includes('id="dataSourceOverview"'), true);
  assert.equal(html.indexOf('id="dataSourceOverview"') < html.indexOf('id="oneNoteAccessStatus"'), true);
  assert.equal(html.includes('id="folderSourceStatus"'), true);
  assert.equal(html.includes('id="addDataSource"'), true);
  assert.equal(html.includes('id="setupOneNoteDataSource"'), true);
  assert.equal(html.includes('id="oneNoteClientId"'), false);
  assert.equal(html.includes('id="setupOneNoteClientId"'), false);
  assert.equal(html.includes('Azure Client ID'), false);
  assert.equal(html.includes('<summary>Источники данных</summary>'), true);
  assert.equal(html.includes('<option value="graph">OneNote Cloud</option>'), true);
  assert.equal(html.includes('<option value="com">OneNote Local</option>'), true);
  assert.equal(html.includes('<option value="folder">Папка</option>'), true);
  assert.equal(html.includes('<summary>Доступ к OneNote</summary>'), false);
  assert.equal(html.includes('id="folderSourcePaths"'), true);
  assert.equal(html.includes('id="folderSourceName"'), true);
  assert.equal(html.includes('id="folderSourceDeduplicateFiles"'), true);
  assert.equal(html.includes('DOCX → DOC → HTML → TXT → PDF'), true);
  assert.equal(html.includes('id="cancelFolderSourceEdit"'), true);
  assert.equal(html.includes('все они будут синхронизироваться и отображаться как один источник данных'), true);
  assert.equal(html.includes('PDF обрабатывается экспериментально без OCR'), true);
  assert.equal(html.includes('Файлы .doc читаются через установленный Microsoft Word COM'), true);
  assert.equal(settings.includes("body:JSON.stringify({ sources })"), true);
  assert.equal(settings.includes('configuredDataSourcesValue.filter(source => source.id !== sourceId)'), true);
  assert.equal(settings.includes('dataSourceOverviewEl.hidden = true'), true);
  assert.equal(settings.includes('function closeDataSourceEditors()'), true);
  assert.equal(settings.includes("folderSourceStatusEl.textContent = 'Не удалось сохранить папки: ' + error.message"), true);
  assert.equal(settings.includes("edit.textContent = 'Изменить'"), true);
  assert.equal(settings.includes("list.className = 'data-source-folder-list'"), true);
  assert.equal(settings.includes('folderSourceDeduplicateFilesInput.checked'), true);
  assert.equal(settings.includes("setupUsesLocalOneNote()"), true);
  assert.equal(settings.includes("setupUsesFolder()"), true);
  assert.equal(sync.includes("source.type === 'com'"), true);
  assert.equal(sync.includes('syncOneNoteComCache(sourceOptions)'), true);
  assert.equal(sync.includes('syncFolderCache(sourceOptions)'), true);
  assert.equal(treePages.includes("const sourceGroups = new Map()"), true);
  assert.equal(treePages.includes("source.type === 'folder' && (source.notebooks.length === 1 || matchingFolderRoot)"), true);
  assert.equal(treePages.includes('structureLabelsMatch(source.displayName, notebook.displayName)'), true);
  assert.equal(treePages.includes('flattenRootSectionLabel:notebook.displayName'), true);
  assert.equal(treePages.includes('flattenFileSections:true'), true);
  assert.equal(treePages.includes("? 'chevron placeholder'"), true);
  assert.equal(treePages.includes("options.status || options.page"), true);
  assert.equal(treePages.includes("case '.pdf': return { key:'pdf'"), true);
  assert.equal(treePages.includes("case '.docx': return { key:'word'"), true);
  assert.equal(treePages.includes("startsWith('~$')"), true);
  assert.equal(treePages.includes("expanded.add('src:' + sourceId)"), true);
  assert.equal(treePages.includes("requires_ocr:'PDF · требуется OCR'"), true);
  assert.equal(styles.includes('[hidden] { display:none !important; }'), true);
  assert.equal(/блокнот/iu.test(genericUi), false);
});

test('Microsoft Graph uses the built-in BibleNote application and shared-notebook scope', () => {
  const auth = fs.readFileSync(path.join(webDirectory, 'src/auth.ts'), 'utf8');

  assert.equal(auth.includes("bibleNoteMicrosoftClientId = 'ba50c2dc-5307-432b-b092-c6a5298f685f'"), true);
  assert.equal(auth.includes("bibleNoteMicrosoftScopes = ['Notes.Read.All', 'User.Read', 'offline_access']"), true);
  assert.equal(auth.includes('process.env.ONENOTE_CLIENT_ID'), false);
  assert.equal(auth.includes('process.env.ONENOTE_TENANT_ID'), false);
  assert.equal(auth.includes('process.env.ONENOTE_SCOPES'), false);
});
