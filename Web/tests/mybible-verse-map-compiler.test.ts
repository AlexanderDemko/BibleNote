import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { type TestContext } from 'node:test';
import Database from 'better-sqlite3';
import {
  compileConfirmedVerseMap,
  lookupVerseIds,
  lookupModuleLocations
} from '../src/mybible-verse-map-compiler.js';
import { parseCompileVerseMapArgs } from '../src/mybible-verse-map-compiler-cli.js';
import { createVerseMapDraft, type VerseMapDocument } from '../src/mybible-verse-map.js';

function temporaryDirectory(t: TestContext): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'biblenote-map-compiler-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}

function writeReference(filePath: string): void {
  fs.writeFileSync(filePath, `<?xml version="1.0"?>
<XMLBIBLE><INFORMATION><title>Reference fixture</title></INFORMATION><BIBLEBOOK bnumber="1"><CHAPTER cnumber="1">
<VERS vnumber="1">First sufficiently long reference text.</VERS>
<VERS vnumber="2">Second sufficiently long reference text.</VERS>
</CHAPTER></BIBLEBOOK></XMLBIBLE>`);
}

function writeMergedModule(filePath: string): void {
  const db = new Database(filePath);
  try {
    db.exec(`
      CREATE TABLE info(name TEXT, value TEXT);
      CREATE TABLE verses(book_number NUMERIC, chapter NUMERIC, verse NUMERIC, text TEXT);
      INSERT INTO info VALUES ('description', 'Merged fixture');
      INSERT INTO verses VALUES (
        10, 1, 1,
        'First sufficiently long reference text. Second sufficiently long reference text.'
      );
    `);
  } finally {
    db.close();
  }
}

function writeIdentityModule(filePath: string): void {
  const db = new Database(filePath);
  try {
    db.exec(`
      CREATE TABLE info(name TEXT, value TEXT);
      CREATE TABLE verses(book_number NUMERIC, chapter NUMERIC, verse NUMERIC, text TEXT);
      INSERT INTO info VALUES ('description', 'Identity fixture');
      INSERT INTO verses VALUES (10, 1, 1, 'First sufficiently long reference text.');
      INSERT INTO verses VALUES (10, 1, 2, 'Second sufficiently long reference text.');
    `);
  } finally {
    db.close();
  }
}

async function mapFixture(t: TestContext): Promise<{ directory: string; mapPath: string; document: VerseMapDocument }> {
  const directory = temporaryDirectory(t);
  const referencePath = path.join(directory, 'reference.xml');
  const modulePath = path.join(directory, 'module.SQLite3');
  const mapPath = path.join(directory, 'map.json');
  writeReference(referencePath);
  writeMergedModule(modulePath);
  const document = await createVerseMapDraft({ referencePath, modulePath });
  fs.writeFileSync(mapPath, `${JSON.stringify(document, null, 2)}\n`);
  return { directory, mapPath, document };
}

test('compiles confirmed many-to-one mappings and supports both lookup directions', async t => {
  const fixture = await mapFixture(t);
  for (const group of fixture.document.reviewGroups) group.status = 'confirmed';
  fs.writeFileSync(fixture.mapPath, `${JSON.stringify(fixture.document, null, 2)}\n`);
  const outputPath = path.join(fixture.directory, 'compiled.sqlite');
  const directMappingsOutputPath = path.join(fixture.directory, 'direct-mappings.xml');

  const summary = await compileConfirmedVerseMap({
    mapPath: fixture.mapPath,
    outputPath,
    coordinateReferenceModule: 'reference',
    directMappingsOutputPath
  });

  assert.equal(summary.quickCheck, 'ok');
  assert.equal(summary.verseIdRegistry, 'bnverse:v1');
  assert.equal(summary.verseIds, 2);
  assert.equal(summary.moduleVerses, 1);
  assert.equal(summary.relations, 2);
  assert.equal(summary.manyToManyEntries, 1);
  assert.equal(summary.directMappingRelations, 2);
  assert.equal(summary.directMappingsOutputPath, directMappingsOutputPath);
  const directMappings = fs.readFileSync(directMappingsOutputPath, 'utf8');
  assert.match(directMappings, /<BibleDirectVerseMappings ReferenceModule="reference"/);
  assert.match(directMappings, /VerseIdRegistry="bnverse:v1"/);
  assert.equal((directMappings.match(/<Mapping /g) ?? []).length, 2);
  assert.deepEqual(lookupVerseIds(outputPath, { bookIndex: 1, chapter: 1, verse: 1 }), [
    'bnverse:v1:1:1:1',
    'bnverse:v1:1:1:2'
  ]);
  assert.deepEqual(lookupModuleLocations(outputPath, 'bnverse:v1:1:1:2'), [
    { bookIndex: 1, chapter: 1, verse: 1 }
  ]);
  const compiled = new Database(outputPath, { readonly:true, fileMustExist:true });
  try {
    assert.equal(compiled.pragma('user_version', { simple:true }), 2);
    assert.equal((compiled.prepare(`SELECT value FROM mapping_meta WHERE key = 'verse_id_registry'`).get() as { value:string }).value, 'bnverse:v1');
    assert.equal((compiled.prepare(`SELECT value FROM mapping_meta WHERE key = 'coordinate_reference_module'`).get() as { value:string }).value, 'reference');
    assert.equal((compiled.prepare(`SELECT COUNT(*) count FROM sqlite_master WHERE type = 'table' AND name = 'verse_ids'`).get() as { count:number }).count, 1);
    assert.equal((compiled.prepare(`SELECT COUNT(*) count FROM sqlite_master WHERE type = 'table' AND name = 'canonical_verses'`).get() as { count:number }).count, 0);
  } finally {
    compiled.close();
  }
});

test('refuses candidates and preserves an existing compiled output when forced', async t => {
  const fixture = await mapFixture(t);
  const outputPath = path.join(fixture.directory, 'compiled.sqlite');
  await assert.rejects(
    compileConfirmedVerseMap({
      mapPath: fixture.mapPath,
      outputPath,
      coordinateReferenceModule: 'reference'
    }),
    /still candidate/
  );

  for (const group of fixture.document.reviewGroups) group.status = 'confirmed';
  fs.writeFileSync(fixture.mapPath, `${JSON.stringify(fixture.document, null, 2)}\n`);
  await compileConfirmedVerseMap({
    mapPath: fixture.mapPath,
    outputPath,
    coordinateReferenceModule: 'reference'
  });
  await assert.rejects(
    compileConfirmedVerseMap({
      mapPath: fixture.mapPath,
      outputPath,
      coordinateReferenceModule: 'reference'
    }),
    /already exists/
  );
  const replaced = await compileConfirmedVerseMap({
    mapPath: fixture.mapPath,
    outputPath,
    coordinateReferenceModule: 'reference',
    force: true
  });
  assert.ok(replaced.backupPath);
  assert.equal(fs.existsSync(replaced.backupPath), true);
});

test('composes a comparison bridge into KJV coordinates and keeps affected identity relations', async t => {
  const directory = temporaryDirectory(t);
  const referencePath = path.join(directory, 'reference.xml');
  const modulePath = path.join(directory, 'module.SQLite3');
  const mapPath = path.join(directory, 'map.json');
  const manifestPath = path.join(directory, 'reference-manifest.xml');
  const outputPath = path.join(directory, 'compiled.sqlite');
  const directMappingsOutputPath = path.join(directory, 'direct.xml');
  writeReference(referencePath);
  writeIdentityModule(modulePath);
  fs.writeFileSync(manifestPath, `<?xml version="1.0"?>
<BibleNoteModule ShortName="reference">
  <BibleTranslationDifferences>
    <BookDifferences BookIndex="1">
      <Difference BaseVerses="1:1" ParallelVerses="1:1-2" />
    </BookDifferences>
  </BibleTranslationDifferences>
</BibleNoteModule>`);
  const document = await createVerseMapDraft({ referencePath, modulePath });
  for (const group of document.reviewGroups) group.status = 'confirmed';
  fs.writeFileSync(mapPath, `${JSON.stringify(document, null, 2)}\n`);

  const summary = await compileConfirmedVerseMap({
    mapPath,
    outputPath,
    coordinateReferenceModule:'kjv',
    referenceDifferencesManifestPath:manifestPath,
    directMappingsOutputPath
  });

  assert.equal(summary.verseIdRegistry, 'bnverse:v1');
  assert.equal(summary.coordinateReferenceModule, 'kjv');
  assert.equal(summary.bridgeModule, 'reference');
  assert.equal(summary.legacyRelationsComposed, 2);
  assert.equal(summary.verseIds, 1);
  assert.equal(summary.moduleVerses, 2);
  assert.equal(summary.relations, 2);
  assert.equal(summary.directMappingRelations, 2);
  assert.deepEqual(lookupVerseIds(outputPath, { bookIndex:1, chapter:1, verse:1 }), [
    'bnverse:v1:1:1:1'
  ]);
  assert.deepEqual(lookupVerseIds(outputPath, { bookIndex:1, chapter:1, verse:2 }), [
    'bnverse:v1:1:1:1'
  ]);
  const directMappings = fs.readFileSync(directMappingsOutputPath, 'utf8');
  assert.match(directMappings, /ReferenceModule="kjv"/);
  assert.match(directMappings, /VerseIdRegistry="bnverse:v1"/);
  assert.equal((directMappings.match(/<Mapping /g) ?? []).length, 2);
  assert.match(directMappings, /ReferenceVerse="1" ModuleChapter="1" ModuleVerse="1"/);
  assert.match(directMappings, /ReferenceVerse="1" ModuleChapter="1" ModuleVerse="2"/);
});

test('parses compile-map arguments', () => {
  assert.deepEqual(parseCompileVerseMapArgs([
    '--map', 'map.json', '--verse-id-registry', 'bnverse:v1', '-o', 'map.sqlite',
    '--coordinate-reference-module', 'kjv', '--reference-differences-manifest', 'rst-manifest.xml',
    '--direct-mappings-output', 'direct.xml', '--force'
  ]), {
    mapPath: 'map.json',
    verseIdRegistry: 'bnverse:v1',
    coordinateReferenceModule: 'kjv',
    referenceDifferencesManifestPath: 'rst-manifest.xml',
    outputPath: 'map.sqlite',
    directMappingsOutputPath: 'direct.xml',
    force: true,
    help: false
  });
});
