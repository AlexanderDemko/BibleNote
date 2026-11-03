import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  readVerseMapDocument,
  validateVerseMapDocument,
  type VerseMapDocument,
  type VerseMapLocation
} from './mybible-verse-map.js';
import {
  projectVerseMapToRegistryCoordinates,
  type RegistryCoordinateProjection
} from './legacy-verse-mapping.js';
import { DEFAULT_VERSE_ID_REGISTRY, formatVerseId, verseIdRegistryPattern } from './verse-id.js';

const COMPILED_SCHEMA_VERSION = 2;
export { DEFAULT_VERSE_ID_REGISTRY } from './verse-id.js';

export type CompileVerseMapOptions = {
  mapPath: string;
  outputPath: string;
  verseIdRegistry?: string;
  coordinateReferenceModule?: string;
  referenceDifferencesManifestPath?: string;
  referencePath?: string;
  modulePath?: string;
  directMappingsOutputPath?: string;
  force?: boolean;
};

export type CompiledVerseMapSummary = {
  outputPath: string;
  backupPath?: string;
  verseIdRegistry: string;
  coordinateReferenceModule: string;
  bridgeModule: string;
  legacyRelationsComposed: number;
  verseIds: number;
  moduleVerses: number;
  relations: number;
  confirmedGroups: number;
  confirmedEntries: number;
  manyToManyEntries: number;
  directMappingsOutputPath?: string;
  directMappingsBackupPath?: string;
  directMappingRelations?: number;
  quickCheck: string;
};

export type CompiledModuleLocation = {
  bookIndex: number;
  chapter: number;
  verse: number;
};

function numericCoordinateId(location: Pick<VerseMapLocation, 'bookIndex' | 'chapter' | 'verse'>): number {
  return location.bookIndex * 1_000_000 + location.chapter * 1_000 + location.verse;
}

function backupName(outputPath: string): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `${outputPath}.backup-${timestamp}`;
}

function xmlAttribute(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function locationKey(location: Pick<VerseMapLocation, 'bookIndex' | 'chapter' | 'verse'>): string {
  return `${location.bookIndex}:${location.chapter}:${location.verse}`;
}

export function createDirectVerseMappingsXml(
  document: VerseMapDocument,
  verseIdRegistry: string,
  projection: RegistryCoordinateProjection
): { xml: string; relations: number } {
  if (!verseIdRegistryPattern.test(verseIdRegistry)) throw new Error('VerseId registry identifier is invalid.');
  const confirmedGroups = new Set(
    document.reviewGroups.filter(group => group.status === 'confirmed').map(group => group.id)
  );
  const byBook = new Map<number, string[]>();
  const relationKeys = new Set<string>();
  const relations: Array<{ reference: VerseMapLocation; module: VerseMapLocation; key: string }> = [];
  const modulesByReference = new Map<string, Set<string>>();
  const referencesByModule = new Map<string, Set<string>>();
  for (const entry of projection.entries) {
    if (!confirmedGroups.has(entry.reviewGroupId)) continue;
    for (const reference of entry.reference) {
      for (const module of entry.module) {
        if (reference.bookIndex !== module.bookIndex) throw new Error(`Cross-book direct relation in entry ${entry.id}.`);
        const referenceKey = locationKey(reference);
        const moduleKey = locationKey(module);
        const relationKey = [
          reference.bookIndex,
          reference.chapter,
          reference.verse,
          module.chapter,
          module.verse,
          reference.empty ? 1 : 0,
          module.empty ? 1 : 0
        ].join(':');
        if (relationKeys.has(relationKey)) continue;
        relationKeys.add(relationKey);
        modulesByReference.set(referenceKey, new Set([...(modulesByReference.get(referenceKey) ?? []), moduleKey]));
        referencesByModule.set(moduleKey, new Set([...(referencesByModule.get(moduleKey) ?? []), referenceKey]));
        relations.push({ reference, module, key:relationKey });
      }
    }
  }
  relationKeys.clear();
  for (const { reference, module, key } of relations) {
    const referenceKey = locationKey(reference);
    const moduleKey = locationKey(module);
    const identity = referenceKey === moduleKey && !reference.empty && !module.empty;
    if (identity
        && modulesByReference.get(referenceKey)?.size === 1
        && referencesByModule.get(moduleKey)?.size === 1) continue;
    relationKeys.add(key);
    const attributes = [
      `ReferenceChapter="${reference.chapter}"`,
      `ReferenceVerse="${reference.verse}"`,
      `ModuleChapter="${module.chapter}"`,
      `ModuleVerse="${module.verse}"`,
      reference.empty ? 'ReferenceIsEmpty="true"' : '',
      module.empty ? 'ModuleIsEmpty="true"' : ''
    ].filter(Boolean).join(' ');
    byBook.set(reference.bookIndex, [...(byBook.get(reference.bookIndex) ?? []), `    <Mapping ${attributes} />`]);
  }
  const body = [...byBook.entries()]
    .sort(([left], [right]) => left - right)
    .map(([bookIndex, mappings]) => [
      `  <BookMappings BookIndex="${bookIndex}">`,
      ...mappings,
      '  </BookMappings>'
    ].join('\n'))
    .join('\n');
  const rootStart = `<BibleDirectVerseMappings ReferenceModule="${xmlAttribute(projection.coordinateReferenceModule)}" SchemaVersion="1" VerseIdRegistry="${xmlAttribute(verseIdRegistry)}">`;
  return {
    xml: `${rootStart}\n${body}${body ? '\n' : ''}</BibleDirectVerseMappings>\n`,
    relations: relationKeys.size
  };
}

function replaceTextFile(outputPath: string, contents: string, force: boolean): string | undefined {
  const resolved = path.resolve(outputPath);
  if (fs.existsSync(resolved) && !force) {
    throw new Error(`Direct-mappings output already exists: ${resolved}. Use --force to preserve and replace it.`);
  }
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  const temporaryPath = path.join(path.dirname(resolved), `.${path.basename(resolved)}.${process.pid}.${randomUUID()}.tmp`);
  fs.writeFileSync(temporaryPath, contents, { encoding: 'utf8', flag: 'wx' });
  let backupPath: string | undefined;
  try {
    if (fs.existsSync(resolved)) {
      backupPath = backupName(resolved);
      fs.renameSync(resolved, backupPath);
    }
    try {
      fs.renameSync(temporaryPath, resolved);
    } catch (error) {
      if (backupPath && !fs.existsSync(resolved) && fs.existsSync(backupPath)) fs.renameSync(backupPath, resolved);
      throw error;
    }
    return backupPath;
  } finally {
    fs.rmSync(temporaryPath, { force: true });
  }
}

function validationFailure(document: VerseMapDocument, validation: Awaited<ReturnType<typeof validateVerseMapDocument>>): string {
  const confirmed = validation.confirmedOnly;
  const reasons = [
    !validation.sourceChecks.referenceFingerprintMatches ? 'reference fingerprint changed' : '',
    !validation.sourceChecks.moduleFingerprintMatches ? 'module fingerprint changed' : '',
    confirmed.referenceCoverage.missingRows > 0 ? `${confirmed.referenceCoverage.missingRows} reference row(s) are unconfirmed` : '',
    confirmed.moduleCoverage.missingRows > 0 ? `${confirmed.moduleCoverage.missingRows} module row(s) are unconfirmed` : '',
    confirmed.duplicateReferenceAssignments > 0 ? `${confirmed.duplicateReferenceAssignments} duplicate reference assignment(s)` : '',
    confirmed.duplicateModuleAssignments > 0 ? `${confirmed.duplicateModuleAssignments} duplicate module assignment(s)` : '',
    confirmed.reverseOrderTransitions > 0 ? `${confirmed.reverseOrderTransitions} unapproved non-monotonic transition(s)` : '',
    confirmed.unmatchedReferenceRows > 0 ? `${confirmed.unmatchedReferenceRows} unmatched reference row(s)` : '',
    confirmed.unmatchedModuleRows > 0 ? `${confirmed.unmatchedModuleRows} unmatched module row(s)` : ''
  ].filter(Boolean);
  const candidateGroups = document.reviewGroups.filter(group => group.status === 'candidate').length;
  if (candidateGroups > 0) reasons.push(`${candidateGroups} review group(s) are still candidate`);
  return `Verse map cannot be compiled: ${reasons.join('; ') || 'confirmed mapping is incomplete or inconsistent'}.`;
}

export async function compileConfirmedVerseMap(options: CompileVerseMapOptions): Promise<CompiledVerseMapSummary> {
  const registry = options.verseIdRegistry ?? DEFAULT_VERSE_ID_REGISTRY;
  if (!verseIdRegistryPattern.test(registry)) {
    throw new Error('VerseId registry must match /^[a-z0-9][a-z0-9._:-]{2,63}$/ (for example bnverse:v1).');
  }
  const mapPath = path.resolve(options.mapPath);
  const outputPath = path.resolve(options.outputPath);
  const directMappingsOutputPath = options.directMappingsOutputPath
    ? path.resolve(options.directMappingsOutputPath)
    : undefined;
  if (mapPath === outputPath) throw new Error('Compiled SQLite output must not overwrite the JSON verse map.');
  if (directMappingsOutputPath && (directMappingsOutputPath === mapPath || directMappingsOutputPath === outputPath)) {
    throw new Error('Direct-mappings XML output must use a separate path.');
  }
  const document = readVerseMapDocument(mapPath);
  const validation = await validateVerseMapDocument(document, {
    referencePath: options.referencePath,
    modulePath: options.modulePath
  });
  if (!validation.sourceChecks.referenceFingerprintMatches
      || !validation.sourceChecks.moduleFingerprintMatches
      || !validation.confirmedOnly.isCompleteAndConsistent) {
    throw new Error(validationFailure(document, validation));
  }
  const projection = projectVerseMapToRegistryCoordinates(
    document,
    options.coordinateReferenceModule ?? 'kjv',
    options.referenceDifferencesManifestPath
  );
  if (fs.existsSync(outputPath) && !options.force) {
    throw new Error(`Compiled output already exists: ${outputPath}. Use --force to preserve it as a backup and replace it.`);
  }
  if (directMappingsOutputPath && fs.existsSync(directMappingsOutputPath) && !options.force) {
    throw new Error(`Direct-mappings output already exists: ${directMappingsOutputPath}. Use --force to preserve and replace it.`);
  }
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  const temporaryPath = path.join(path.dirname(outputPath), `.${path.basename(outputPath)}.${process.pid}.${randomUUID()}.tmp`);
  const confirmedGroups = new Map(
    document.reviewGroups.filter(group => group.status === 'confirmed').map(group => [group.id, group])
  );
  const entries = projection.entries.filter(entry => confirmedGroups.has(entry.reviewGroupId));
  let db: Database.Database | undefined;
  try {
    db = new Database(temporaryPath);
    db.pragma('journal_mode = DELETE');
    db.pragma('synchronous = FULL');
    db.exec(`
      CREATE TABLE mapping_meta(
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
      CREATE TABLE verse_ids(
        verse_id TEXT PRIMARY KEY,
        registry TEXT NOT NULL,
        book_index INTEGER NOT NULL,
        chapter INTEGER NOT NULL,
        verse INTEGER NOT NULL,
        numeric_coordinate_id INTEGER NOT NULL,
        UNIQUE(book_index, chapter, verse)
      );
      CREATE TABLE module_verses(
        module_verse_id INTEGER PRIMARY KEY,
        book_index INTEGER NOT NULL,
        chapter INTEGER NOT NULL,
        verse INTEGER NOT NULL,
        source_book_number INTEGER NOT NULL,
        is_empty INTEGER NOT NULL,
        UNIQUE(book_index, chapter, verse)
      );
      CREATE TABLE verse_mapping(
        verse_id TEXT NOT NULL REFERENCES verse_ids(verse_id),
        module_verse_id INTEGER NOT NULL REFERENCES module_verses(module_verse_id),
        entry_id TEXT NOT NULL,
        review_group_id TEXT NOT NULL,
        mapping_kind TEXT NOT NULL,
        PRIMARY KEY(verse_id, module_verse_id)
      );
      CREATE INDEX verse_mapping_module_idx ON verse_mapping(module_verse_id, verse_id);
      CREATE INDEX verse_mapping_entry_idx ON verse_mapping(entry_id);
    `);
    const insertMeta = db.prepare('INSERT INTO mapping_meta(key, value) VALUES (?, ?)');
    const metadata: Record<string, unknown> = {
      schema_version: COMPILED_SCHEMA_VERSION,
      compiled_at: new Date().toISOString(),
      verse_id_registry: registry,
      coordinate_reference_module: projection.coordinateReferenceModule,
      bridge_module: projection.bridgeModule,
      legacy_relations_composed: projection.legacyRelations,
      map_file: path.basename(mapPath),
      map_schema_version: document.schemaVersion,
      reference_module_id: document.reference.moduleId,
      reference_file: document.reference.fileName,
      reference_sha256: document.reference.sha256,
      module_id: document.module.moduleId,
      module_file: document.module.fileName,
      module_sha256: document.module.sha256
    };
    for (const [key, value] of Object.entries(metadata)) insertMeta.run(key, String(value));

    const insertVerseId = db.prepare(`
      INSERT OR IGNORE INTO verse_ids(
        verse_id, registry, book_index, chapter, verse, numeric_coordinate_id
      ) VALUES (?, ?, ?, ?, ?, ?)
    `);
    const insertModule = db.prepare(`
      INSERT OR IGNORE INTO module_verses(
        module_verse_id, book_index, chapter, verse, source_book_number, is_empty
      ) VALUES (?, ?, ?, ?, ?, ?)
    `);
    const insertMapping = db.prepare(`
      INSERT INTO verse_mapping(
        verse_id, module_verse_id, entry_id, review_group_id, mapping_kind
      ) VALUES (?, ?, ?, ?, ?)
    `);
    const writeEntries = db.transaction(() => {
      for (const entry of entries) {
        for (const reference of entry.reference) {
          const registryVerseId = formatVerseId(reference, registry);
          insertVerseId.run(
            registryVerseId,
            registry,
            reference.bookIndex,
            reference.chapter,
            reference.verse,
            numericCoordinateId(reference)
          );
          for (const module of entry.module) {
            const moduleId = numericCoordinateId(module);
            insertModule.run(
              moduleId,
              module.bookIndex,
              module.chapter,
              module.verse,
              module.sourceBookNumber,
              module.empty ? 1 : 0
            );
            insertMapping.run(registryVerseId, moduleId, entry.id, entry.reviewGroupId, entry.kind);
          }
        }
      }
    });
    writeEntries();
    db.pragma(`user_version = ${COMPILED_SCHEMA_VERSION}`);
    const quickCheck = String((db.pragma('quick_check', { simple: true }) as string | undefined) ?? 'unknown');
    const verseIds = (db.prepare('SELECT COUNT(*) count FROM verse_ids').get() as { count: number }).count;
    const moduleVerses = (db.prepare('SELECT COUNT(*) count FROM module_verses').get() as { count: number }).count;
    const relations = (db.prepare('SELECT COUNT(*) count FROM verse_mapping').get() as { count: number }).count;
    db.close();
    db = undefined;

    let backupPath: string | undefined;
    if (fs.existsSync(outputPath)) {
      backupPath = backupName(outputPath);
      fs.renameSync(outputPath, backupPath);
    }
    try {
      fs.renameSync(temporaryPath, outputPath);
    } catch (error) {
      if (backupPath && !fs.existsSync(outputPath) && fs.existsSync(backupPath)) fs.renameSync(backupPath, outputPath);
      throw error;
    }
    let directMappingsBackupPath: string | undefined;
    let directMappingRelations: number | undefined;
    if (directMappingsOutputPath) {
      const directMappings = createDirectVerseMappingsXml(document, registry, projection);
      directMappingsBackupPath = replaceTextFile(directMappingsOutputPath, directMappings.xml, options.force === true);
      directMappingRelations = directMappings.relations;
    }
    return {
      outputPath,
      backupPath,
      verseIdRegistry: registry,
      coordinateReferenceModule: projection.coordinateReferenceModule,
      bridgeModule: projection.bridgeModule,
      legacyRelationsComposed: projection.legacyRelations,
      verseIds,
      moduleVerses,
      relations,
      confirmedGroups: confirmedGroups.size,
      confirmedEntries: entries.length,
      manyToManyEntries: entries.filter(entry => entry.reference.length !== 1 || entry.module.length !== 1).length,
      directMappingsOutputPath,
      directMappingsBackupPath,
      directMappingRelations,
      quickCheck
    };
  } finally {
    if (db) db.close();
    if (fs.existsSync(temporaryPath)) fs.rmSync(temporaryPath, { force: true });
  }
}

export function lookupVerseIds(
  compiledPath: string,
  moduleLocation: CompiledModuleLocation
): string[] {
  const db = new Database(path.resolve(compiledPath), { readonly: true, fileMustExist: true });
  try {
    const moduleId = numericCoordinateId(moduleLocation);
    return (db.prepare(`
      SELECT verse_id
      FROM verse_mapping
      WHERE module_verse_id = ?
      ORDER BY verse_id
    `).all(moduleId) as Array<{ verse_id: string }>).map(row => row.verse_id);
  } finally {
    db.close();
  }
}

export function lookupModuleLocations(compiledPath: string, registryVerseId: string): CompiledModuleLocation[] {
  const db = new Database(path.resolve(compiledPath), { readonly: true, fileMustExist: true });
  try {
    return db.prepare(`
      SELECT module_verses.book_index bookIndex,
             module_verses.chapter chapter,
             module_verses.verse verse
      FROM verse_mapping
      JOIN module_verses USING(module_verse_id)
      WHERE verse_id = ?
      ORDER BY module_verse_id
    `).all(registryVerseId) as CompiledModuleLocation[];
  } finally {
    db.close();
  }
}
