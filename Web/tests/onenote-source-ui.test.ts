import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const webDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('settings and first-run wizard expose Graph and classic OneNote sources', () => {
  const html = fs.readFileSync(path.join(webDirectory, 'ui/index.html'), 'utf8');
  const settings = fs.readFileSync(path.join(webDirectory, 'ui/settings.js'), 'utf8');
  const sync = fs.readFileSync(path.join(webDirectory, 'src/sync.ts'), 'utf8');

  assert.equal(html.includes('id="oneNoteDataSource"'), true);
  assert.equal(html.includes('id="setupOneNoteDataSource"'), true);
  assert.equal(html.includes('id="oneNoteClientId"'), false);
  assert.equal(html.includes('id="setupOneNoteClientId"'), false);
  assert.equal(html.includes('Azure Client ID'), false);
  assert.equal(html.includes('<option value="graph">Microsoft Graph (облако)</option>'), true);
  assert.equal(html.includes('<option value="com">Классический OneNote на этом компьютере</option>'), true);
  assert.equal(settings.includes("dataSource:oneNoteDataSourceSelect.value"), true);
  assert.equal(settings.includes("setupUsesLocalOneNote()"), true);
  assert.equal(sync.includes("if (oneNoteDataSource() === 'com') return syncOneNoteComCache(options);"), true);
});

test('Microsoft Graph uses the built-in BibleNote application and shared-notebook scope', () => {
  const auth = fs.readFileSync(path.join(webDirectory, 'src/auth.ts'), 'utf8');

  assert.equal(auth.includes("bibleNoteMicrosoftClientId = 'ba50c2dc-5307-432b-b092-c6a5298f685f'"), true);
  assert.equal(auth.includes("bibleNoteMicrosoftScopes = ['Notes.Read.All', 'User.Read', 'offline_access']"), true);
  assert.equal(auth.includes('process.env.ONENOTE_CLIENT_ID'), false);
  assert.equal(auth.includes('process.env.ONENOTE_TENANT_ID'), false);
  assert.equal(auth.includes('process.env.ONENOTE_SCOPES'), false);
});
