import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { openCacheDb } from '../src/cache.js';
import { cachedSourceScopesRemovedBySettingsChange, removeCachedSources } from '../src/cache-ui.js';
import { folderNotebookId } from '../src/folder-source.js';

test('removing one configured source purges only its cached hierarchy', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'biblenote-source-removal-'));
  const dbPath = path.join(directory, 'cache.sqlite');
  const folderPath = path.join(directory, 'Notes');
  const secondFolderPath = path.join(directory, 'Archive');
  const folderId = folderNotebookId(folderPath);
  const secondFolderId = folderNotebookId(secondFolderPath);
  const db = openCacheDb(dbPath);
  try {
    const insertNotebook = db.prepare('INSERT INTO notebooks(id, display_name, synced_at) VALUES (?, ?, ?)');
    const insertPage = db.prepare(`
      INSERT INTO pages(id, title, parent_notebook_id, content_text, metadata_synced_at)
      VALUES (?, ?, ?, ?, ?)
    `);
    const now = new Date().toISOString();
    for (const [id, title] of [['graph-notebook', 'Cloud'], ['{COM-NOTEBOOK}', 'Local'], [folderId, 'Notes'], [secondFolderId, 'Archive']] as const) {
      insertNotebook.run(id, title, now);
      insertPage.run('page:' + id, title, id, title, now);
      db.prepare('INSERT INTO pages_fts(page_id, title, content, notebook, section) VALUES (?, ?, ?, ?, ?)')
        .run('page:' + id, title, title, title, '');
    }

    const originalFolderSource = { id:'source:folder:files', type:'folder' as const, displayName:'My files', folderPaths:[folderPath, secondFolderPath] };
    const editedFolderSource = { ...originalFolderSource, displayName:'Renamed files', folderPaths:[folderPath] };
    assert.deepEqual(cachedSourceScopesRemovedBySettingsChange([originalFolderSource], [{ ...originalFolderSource, displayName:'Renamed files' }]), []);
    const removedByEdit = cachedSourceScopesRemovedBySettingsChange([originalFolderSource], [editedFolderSource]);
    assert.deepEqual(removedByEdit[0].folderPaths, [secondFolderPath]);
    assert.equal(removeCachedSources(db, removedByEdit), 1);
    assert.deepEqual(
      (db.prepare('SELECT id FROM notebooks ORDER BY id').all() as Array<{ id: string }>).map(row => row.id),
      [folderId, 'graph-notebook', '{COM-NOTEBOOK}'].sort()
    );
    assert.equal((db.prepare('SELECT COUNT(*) value FROM pages_fts').get() as { value: number }).value, 3);

    assert.equal(removeCachedSources(db, cachedSourceScopesRemovedBySettingsChange([editedFolderSource], [])), 1);

    assert.equal(removeCachedSources(db, [{ id:'source:graph', type:'graph', displayName:'OneNote Cloud' }]), 1);
    assert.deepEqual(
      (db.prepare('SELECT id FROM notebooks').all() as Array<{ id: string }>).map(row => row.id),
      ['{COM-NOTEBOOK}']
    );
  } finally {
    db.close();
    fs.rmSync(directory, { recursive:true, force:true });
  }
});
