import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { configuredDataSources, folderSourcePaths, readOneNoteAccessSettings, saveOneNoteAccessSettings } from '../src/onenote-settings.js';

test('folder source paths survive settings persistence without delimiter ambiguity', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'biblenote-folder-settings-'));
  const envPath = path.join(directory, '.env');
  const firstFolder = path.join(directory, 'notes; primary');
  const secondFolder = path.join(directory, 'вложенные заметки');
  const previousEnvFile = process.env.ONENOTE_ENV_FILE;
  const previousSource = process.env.ONENOTE_DATA_SOURCE;
  const previousFolders = process.env.ONENOTE_FOLDER_PATHS;
  const previousSources = process.env.BIBLENOTE_DATA_SOURCES;

  process.env.ONENOTE_ENV_FILE = envPath;
  delete process.env.ONENOTE_DATA_SOURCE;
  delete process.env.ONENOTE_FOLDER_PATHS;
  delete process.env.BIBLENOTE_DATA_SOURCES;
  try {
    const saved = await saveOneNoteAccessSettings({
      dataSource:'folder',
      folderPaths:[firstFolder, secondFolder, firstFolder]
    });

    assert.equal(saved.dataSource, 'folder');
    assert.equal(saved.sources.length, 1);
    assert.deepEqual(saved.sources[0].folderPaths, [path.resolve(firstFolder), path.resolve(secondFolder)]);
    assert.deepEqual(saved.folderPaths, [path.resolve(firstFolder), path.resolve(secondFolder)]);
    assert.deepEqual(folderSourcePaths(), saved.folderPaths);
    assert.deepEqual(readOneNoteAccessSettings().folderPaths, saved.folderPaths);

    const envText = fs.readFileSync(envPath, 'utf8');
    assert.match(envText, /^ONENOTE_DATA_SOURCE=folder$/m);
    assert.match(envText, /^ONENOTE_FOLDER_PATHS=[A-Za-z0-9_-]+$/m);
    assert.doesNotMatch(envText, /notes; primary/);
  } finally {
    if (previousEnvFile == null) delete process.env.ONENOTE_ENV_FILE;
    else process.env.ONENOTE_ENV_FILE = previousEnvFile;
    if (previousSource == null) delete process.env.ONENOTE_DATA_SOURCE;
    else process.env.ONENOTE_DATA_SOURCE = previousSource;
    if (previousFolders == null) delete process.env.ONENOTE_FOLDER_PATHS;
    else process.env.ONENOTE_FOLDER_PATHS = previousFolders;
    if (previousSources == null) delete process.env.BIBLENOTE_DATA_SOURCES;
    else process.env.BIBLENOTE_DATA_SOURCES = previousSources;
    fs.rmSync(directory, { recursive:true, force:true });
  }
});

test('persists a named multi-folder source together with OneNote sources', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'biblenote-multiple-sources-'));
  const envPath = path.join(directory, '.env');
  const firstFolder = path.join(directory, 'Notes A');
  const secondFolder = path.join(directory, 'Notes B');
  const previous = {
    envFile:process.env.ONENOTE_ENV_FILE,
    source:process.env.ONENOTE_DATA_SOURCE,
    folders:process.env.ONENOTE_FOLDER_PATHS,
    sources:process.env.BIBLENOTE_DATA_SOURCES
  };
  process.env.ONENOTE_ENV_FILE = envPath;
  delete process.env.ONENOTE_DATA_SOURCE;
  delete process.env.ONENOTE_FOLDER_PATHS;
  delete process.env.BIBLENOTE_DATA_SOURCES;
  try {
    const saved = await saveOneNoteAccessSettings({
      sources:[
        { type:'graph', notebooks:[
          { id:'graph-study', displayName:'Изучение Библии' },
          { id:'graph-study', displayName:'Дубликат' },
          { id:'graph-sermons', displayName:'Проповеди' }
        ] },
        { type:'com', notebooks:[{ id:'{local-notebook}', displayName:'Локальные заметки' }] },
        { type:'folder', displayName:'Проповеди и конспекты', folderPaths:[firstFolder, secondFolder, firstFolder], deduplicateFilesByName:true }
      ]
    });

    assert.deepEqual(saved.sources.map(source => source.type), ['graph', 'com', 'folder']);
    assert.equal(new Set(saved.sources.map(source => source.id)).size, 3);
    assert.equal(saved.sources[2].displayName, 'Проповеди и конспекты');
    assert.deepEqual(saved.sources[2].folderPaths, [path.resolve(firstFolder), path.resolve(secondFolder)]);
    assert.equal(saved.sources[2].deduplicateFilesByName, true);
    assert.deepEqual(saved.sources[0].notebooks, [
      { id:'graph-study', displayName:'Дубликат' },
      { id:'graph-sermons', displayName:'Проповеди' }
    ]);
    assert.deepEqual(saved.sources[1].notebooks, [{ id:'{local-notebook}', displayName:'Локальные заметки' }]);
    assert.deepEqual(saved.folderPaths, [path.resolve(firstFolder), path.resolve(secondFolder)]);
    assert.deepEqual(configuredDataSources(), saved.sources);

    const empty = await saveOneNoteAccessSettings({ sources:[] });
    assert.deepEqual(empty.sources, []);
    assert.deepEqual(configuredDataSources(), []);
  } finally {
    const restore = (key: string, value: string | undefined) => value == null ? delete process.env[key] : void (process.env[key] = value);
    restore('ONENOTE_ENV_FILE', previous.envFile);
    restore('ONENOTE_DATA_SOURCE', previous.source);
    restore('ONENOTE_FOLDER_PATHS', previous.folders);
    restore('BIBLENOTE_DATA_SOURCES', previous.sources);
    fs.rmSync(directory, { recursive:true, force:true });
  }
});
