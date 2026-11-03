import { randomBytes, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import http, { type IncomingMessage, type ServerResponse } from 'node:http';
import path from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import {
  canConfirmAutomatically,
  readVerseMapDocument,
  readVerseMapReviewLocationIndex,
  readVerseMapReviewTextIndex,
  validateVerseMapDocument,
  type VerseMapDocument,
  type VerseMapLocation,
  type VerseMapReviewStatus
} from './mybible-verse-map.js';
import { compileConfirmedVerseMap } from './mybible-verse-map-compiler.js';
import { convertMyBibleModule } from './mybible-converter.js';

const MAX_BODY_BYTES = 16 * 1024;
const allowedStatuses = new Set<VerseMapReviewStatus>(['candidate', 'confirmed', 'rejected']);
const coordinatePattern = /^(\d+)\s+(\d+):(\d+)(?:\s*[-–—]\s*(\d+))?$/;
const MAX_RANGE_VERSES = 200;

export type VerseMapReviewServerOptions = {
  mapPath: string;
  port?: number;
  host?: string;
  referencePath?: string;
  modulePath?: string;
  footnotesPath?: string;
};

export type VerseMapReviewServer = {
  url: string;
  origin: string;
  token: string;
  mapPath: string;
  footnotesPath?: string;
  close(): Promise<void>;
};

function locationKey(location: Pick<VerseMapLocation, 'bookIndex' | 'chapter' | 'verse'>): string {
  return `${location.bookIndex}:${location.chapter}:${location.verse}`;
}

function parseCoordinates(value: unknown, index: Map<string, VerseMapLocation>, side: string): VerseMapLocation[] {
  if (typeof value !== 'string') throw new Error(`${side} coordinates must be text.`);
  const tokens = value.split(/[,;\n]+/).map(token => token.trim()).filter(Boolean);
  if (tokens.length > 100) throw new Error(`${side} contains too many coordinates.`);
  const result: VerseMapLocation[] = [];
  for (const token of tokens) {
    const match = coordinatePattern.exec(token);
    if (!match) throw new Error(`${side}: '${token}' must use the format “book chapter:verse” or “book chapter:verse-verse”.`);
    const bookIndex = Number(match[1]);
    const chapter = Number(match[2]);
    const firstVerse = Number(match[3]);
    const lastVerse = match[4] == null ? firstVerse : Number(match[4]);
    if (lastVerse < firstVerse) throw new Error(`${side}: range '${token}' must go from a lower verse to a higher one.`);
    if (lastVerse - firstVerse + 1 > MAX_RANGE_VERSES) throw new Error(`${side}: range '${token}' is too long.`);
    for (let verse = firstVerse; verse <= lastVerse; verse++) {
      const location = index.get(`${bookIndex}:${chapter}:${verse}`);
      if (!location) {
        const label = match[4] == null ? token : `${bookIndex} ${chapter}:${verse}`;
        throw new Error(`${side}: verse '${label}' does not exist in the source module.`);
      }
      result.push({ ...location });
    }
    if (result.length > MAX_RANGE_VERSES) throw new Error(`${side} contains too many verses.`);
  }
  return result;
}

function entryKind(reference: VerseMapLocation[], module: VerseMapLocation[]): VerseMapDocument['entries'][number]['kind'] {
  if (reference.length > 0 && module.length === 0) return 'unmatched-reference';
  if (module.length > 0 && reference.length === 0) return 'unmatched-module';
  if ([...reference, ...module].some(location => location.empty)) return 'empty-placeholder-group';
  if (reference.length > 1 && module.length === 1) return 'merged-in-module';
  if (reference.length === 1 && module.length > 1) return 'split-in-module';
  if (reference.length > 1 || module.length > 1) return 'many-to-many';
  return locationKey(reference[0]) === locationKey(module[0]) ? 'identity' : 'renumbered';
}

function formatLocation(location: VerseMapLocation): string {
  return `${location.bookIndex} ${location.chapter}:${location.verse}`;
}

function reviewContext(
  locationIndex: Map<string, VerseMapLocation>,
  textIndex: Map<string, string>,
  affected: VerseMapLocation[],
  anchors: VerseMapLocation[],
  radius = 3
): Array<VerseMapLocation & { text: string; affected: boolean }> {
  const affectedKeys = new Set(affected.map(locationKey));
  const anchorRanges = new Map<string, { bookIndex: number; chapter: number; firstVerse: number; lastVerse: number }>();
  for (const anchor of anchors) {
    const key = `${anchor.bookIndex}:${anchor.chapter}`;
    const range = anchorRanges.get(key);
    if (range) {
      range.firstVerse = Math.min(range.firstVerse, anchor.verse);
      range.lastVerse = Math.max(range.lastVerse, anchor.verse);
    } else {
      anchorRanges.set(key, {
        bookIndex: anchor.bookIndex,
        chapter: anchor.chapter,
        firstVerse: anchor.verse,
        lastVerse: anchor.verse
      });
    }
  }

  const locations = [...locationIndex.values()];
  const result = new Map<string, VerseMapLocation & { text: string; affected: boolean }>();
  for (const range of anchorRanges.values()) {
    const chapter = locations
      .filter(location => location.bookIndex === range.bookIndex && location.chapter === range.chapter)
      .sort((left, right) => left.verse - right.verse);
    if (chapter.length === 0) continue;
    let firstIndex = chapter.findIndex(location => location.verse >= range.firstVerse);
    if (firstIndex < 0) firstIndex = chapter.length - 1;
    let lastIndex = -1;
    for (let index = 0; index < chapter.length && chapter[index].verse <= range.lastVerse; index++) lastIndex = index;
    if (lastIndex < 0) lastIndex = 0;
    const start = Math.max(0, Math.min(firstIndex, lastIndex) - radius);
    const end = Math.min(chapter.length - 1, Math.max(firstIndex, lastIndex) + radius);
    for (const location of chapter.slice(start, end + 1)) {
      const key = locationKey(location);
      result.set(key, {
        ...location,
        text: textIndex.get(key) ?? '',
        affected: affectedKeys.has(key)
      });
    }
  }
  return [...result.values()].sort((left, right) =>
    left.bookIndex - right.bookIndex || left.chapter - right.chapter || left.verse - right.verse
  );
}

export type ManualMappingAdjustments = {
  trimmedEntries: number;
  removedEntries: number;
  removedGroups: number;
  affectedGroupIds: string[];
};

/**
 * A manual correspondence owns the verses it lists. Any other entry that still claims one of those
 * verses is trimmed (or removed when nothing remains) so the map does not keep duplicate
 * assignments; the affected groups are refreshed and returned to review.
 */
function reassignClaimedLocations(document: VerseMapDocument, entryId: string, reference: VerseMapLocation[], module: VerseMapLocation[]): ManualMappingAdjustments {
  const claimedReference = new Set(reference.map(locationKey));
  const claimedModule = new Set(module.map(locationKey));
  const affectedGroupIds = new Set<string>();
  const adjustments: ManualMappingAdjustments = { trimmedEntries: 0, removedEntries: 0, removedGroups: 0, affectedGroupIds: [] };
  document.entries = document.entries.filter(other => {
    if (other.id === entryId) return true;
    const keptReference = other.reference.filter(location => !claimedReference.has(locationKey(location)));
    const keptModule = other.module.filter(location => !claimedModule.has(locationKey(location)));
    if (keptReference.length === other.reference.length && keptModule.length === other.module.length) return true;
    affectedGroupIds.add(other.reviewGroupId);
    if (keptReference.length === 0 && keptModule.length === 0) {
      adjustments.removedEntries++;
      return false;
    }
    other.reference = keptReference;
    other.module = keptModule;
    other.kind = entryKind(keptReference, keptModule);
    other.confidence = 'low';
    other.evidence = [...new Set([...other.evidence, 'manual-review-adjusted'])].sort();
    adjustments.trimmedEntries++;
    return true;
  });
  for (const groupId of affectedGroupIds) {
    if (document.entries.some(entry => entry.reviewGroupId === groupId)) {
      refreshGroup(document, groupId);
    } else {
      document.reviewGroups = document.reviewGroups.filter(group => group.id !== groupId);
      adjustments.removedGroups++;
    }
  }
  adjustments.affectedGroupIds = [...affectedGroupIds].sort();
  return adjustments;
}

function refreshGroup(document: VerseMapDocument, groupId: string): void {
  const group = document.reviewGroups.find(candidate => candidate.id === groupId);
  if (!group) throw new Error('Review group was not found.');
  const entries = document.entries.filter(entry => entry.reviewGroupId === groupId);
  if (entries.length === 0) throw new Error('Review group has no entries.');
  const reference = entries.flatMap(entry => entry.reference);
  const module = entries.flatMap(entry => entry.module);
  const remainsAutomaticallyConfirmed = group.autoConfirmed === true
    && entries.every(entry => canConfirmAutomatically(entry));
  group.status = remainsAutomaticallyConfirmed ? 'confirmed' : 'candidate';
  group.autoConfirmed = remainsAutomaticallyConfirmed;
  group.kind = entries[0].kind;
  group.confidence = entries.some(entry => entry.confidence === 'low') ? 'low'
    : entries.some(entry => entry.confidence === 'medium') ? 'medium' : 'high';
  group.evidence = [...new Set(entries.flatMap(entry => entry.evidence))].sort();
  group.entryCount = entries.length;
  group.bookIndex = reference[0]?.bookIndex ?? module[0]?.bookIndex ?? group.bookIndex;
  group.firstEntryId = entries[0].id;
  group.lastEntryId = entries.at(-1)!.id;
  group.referenceStart = reference[0] ? formatLocation(reference[0]) : undefined;
  group.referenceEnd = reference.at(-1) ? formatLocation(reference.at(-1)!) : undefined;
  group.moduleStart = module[0] ? formatLocation(module[0]) : undefined;
  group.moduleEnd = module.at(-1) ? formatLocation(module.at(-1)!) : undefined;
}

function json(response: ServerResponse, status: number, value: unknown): void {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  });
  response.end(`${JSON.stringify(value)}\n`);
}

function text(response: ServerResponse, status: number, value: string, contentType = 'text/plain; charset=utf-8'): void {
  response.writeHead(status, {
    'Content-Type': contentType,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  });
  response.end(value);
}

async function requestBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytes += buffer.length;
    if (bytes > MAX_BODY_BYTES) throw new Error('Request body is too large.');
    chunks.push(buffer);
  }
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
}

function reviewAssetPath(fileName: string): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'ui', fileName);
}

function timestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function moduleShortName(moduleId: string): string {
  const normalized = moduleId.trim().toLowerCase().replaceAll('+', 'plus').replace(/\s+/g, '-');
  const safe = normalized.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  return safe || 'mybible-module';
}

function buildPaths(mapPath: string, referencePath: string, moduleId: string): {
  referenceManifestPath: string;
  compiledPath: string;
  directMappingsPath: string;
  moduleOutputPath: string;
} {
  const folder = path.dirname(mapPath);
  const mapStem = path.basename(mapPath, path.extname(mapPath)).replace(/-map$/i, '');
  const referenceManifestPath = path.join(path.dirname(referencePath), 'manifest.xml');
  if (!fs.existsSync(referenceManifestPath)) {
    throw new Error(`Reference manifest was not found next to the comparison module: ${referenceManifestPath}`);
  }
  return {
    referenceManifestPath,
    compiledPath: path.join(folder, `${mapStem}-verse-map.sqlite`),
    directMappingsPath: path.join(folder, `${mapStem}-direct-mappings.xml`),
    moduleOutputPath: path.join(folder, `${moduleShortName(moduleId)}.bnm`)
  };
}

function persistDocument(
  mapPath: string,
  document: VerseMapDocument,
  session: { backupPath?: string }
): { backupPath: string; backupCreated: boolean } {
  const folder = path.dirname(mapPath);
  const temporaryPath = path.join(folder, `.${path.basename(mapPath)}.${process.pid}.${randomUUID()}.tmp`);
  const rollbackPath = path.join(folder, `.${path.basename(mapPath)}.${process.pid}.${randomUUID()}.rollback`);
  fs.writeFileSync(temporaryPath, `${JSON.stringify(document, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
  try {
    const backupCreated = !session.backupPath;
    if (backupCreated) {
      session.backupPath = `${mapPath}.backup-${timestamp()}`;
      fs.copyFileSync(mapPath, session.backupPath, fs.constants.COPYFILE_EXCL);
    }
    fs.renameSync(mapPath, rollbackPath);
    try {
      fs.renameSync(temporaryPath, mapPath);
    } catch (error) {
      fs.renameSync(rollbackPath, mapPath);
      throw error;
    }
    fs.rmSync(rollbackPath, { force: true });
    return { backupPath: session.backupPath!, backupCreated };
  } finally {
    fs.rmSync(temporaryPath, { force: true });
    if (fs.existsSync(rollbackPath) && !fs.existsSync(mapPath)) fs.renameSync(rollbackPath, mapPath);
  }
}

function state(document: VerseMapDocument, backupPath?: string): unknown {
  const statusCounts = { candidate: 0, confirmed: 0, rejected: 0 };
  let autoConfirmed = 0;
  for (const group of document.reviewGroups) {
    statusCounts[group.status]++;
    if (group.status === 'confirmed' && group.autoConfirmed) autoConfirmed++;
  }
  return {
    schemaVersion: document.schemaVersion,
    map: {
      reference: document.reference,
      module: document.module,
      generatedAt: document.generatedAt,
      backupPath
    },
    counts: {
      groups: document.reviewGroups.length,
      entries: document.entries.length,
      autoConfirmed,
      ...statusCounts
    },
    validation: document.validation,
    groups: document.reviewGroups
  };
}

/**
 * Locates a map source module. Stored paths are resolved relative to the map file; when the stored
 * location no longer exists (for example a temporary folder), a file with the same name next to the
 * map is used, otherwise a clear error names the missing module instead of an opaque SQLite failure.
 */
export function resolveVerseMapSourcePath(
  mapPath: string,
  side: 'reference' | 'module',
  source: { path?: string; fileName?: string },
  override?: string
): string {
  const mapFolder = path.dirname(mapPath);
  if (override) {
    const resolved = path.resolve(override);
    if (!fs.existsSync(resolved)) throw new Error(`The ${side} module was not found: ${resolved}`);
    return resolved;
  }
  const stored = typeof source.path === 'string' && source.path.trim() ? path.resolve(mapFolder, source.path) : '';
  if (stored && fs.existsSync(stored)) return stored;
  const fileName = source.fileName || (stored ? path.basename(stored) : '');
  const sibling = fileName ? path.join(mapFolder, fileName) : '';
  if (sibling && fs.existsSync(sibling)) return sibling;
  const label = side === 'reference' ? 'reference (comparison)' : 'MyBible';
  const details = [
    stored ? `stored path ${stored}` : 'the map does not store a path',
    sibling ? `next to the map ${sibling}` : ''
  ].filter(Boolean).join(', ');
  throw new Error(
    `The ${label} module ${fileName ? `'${fileName}' ` : ''}referenced by the map was not found (${details}). ` +
    `Copy the file next to the map or regenerate the map with the current module location.`
  );
}

export async function startVerseMapReviewServer(options: VerseMapReviewServerOptions): Promise<VerseMapReviewServer> {
  const mapPath = path.resolve(options.mapPath);
  let document = readVerseMapDocument(mapPath);
  const referencePath = resolveVerseMapSourcePath(mapPath, 'reference', document.reference, options.referencePath);
  const modulePath = resolveVerseMapSourcePath(mapPath, 'module', document.module, options.modulePath);
  const footnotesPath = options.footnotesPath ? path.resolve(options.footnotesPath) : undefined;
  if (footnotesPath && (!fs.existsSync(footnotesPath) || !fs.statSync(footnotesPath).isFile())) {
    throw new Error(`Файл сносок MyBible не найден: ${footnotesPath}`);
  }
  const [referenceTexts, moduleTexts, referenceLocations, moduleLocations] = await Promise.all([
    readVerseMapReviewTextIndex(referencePath),
    readVerseMapReviewTextIndex(modulePath),
    readVerseMapReviewLocationIndex(referencePath),
    readVerseMapReviewLocationIndex(modulePath)
  ]);
  document.validation = await validateVerseMapDocument(document, { referencePath, modulePath });

  const token = randomBytes(24).toString('base64url');
  const session: { backupPath?: string } = {};
  let origin = '';
  let mutationQueue: Promise<void> = Promise.resolve();

  const server = http.createServer(async (request, response) => {
    try {
      const requestUrl = new URL(request.url ?? '/', origin || 'http://127.0.0.1');
      const suppliedToken = request.headers['x-biblenote-review-token'] ?? requestUrl.searchParams.get('token');
      const isApi = requestUrl.pathname.startsWith('/api/');
      if (isApi && suppliedToken !== token) {
        json(response, 401, { error: 'Invalid review token.' });
        return;
      }
      if (request.method === 'POST') {
        const requestOrigin = request.headers.origin;
        if (requestOrigin && requestOrigin !== origin) {
          json(response, 403, { error: 'Foreign origin is not allowed.' });
          return;
        }
      }

      if (request.method === 'GET' && (requestUrl.pathname === '/' || requestUrl.pathname === '/index.html')) {
        text(response, 200, fs.readFileSync(reviewAssetPath('mybible-map-review.html'), 'utf8'), 'text/html; charset=utf-8');
        return;
      }
      if (request.method === 'GET' && requestUrl.pathname === '/mybible-map-review.js') {
        text(response, 200, fs.readFileSync(reviewAssetPath('mybible-map-review.js'), 'utf8'), 'text/javascript; charset=utf-8');
        return;
      }
      if (request.method === 'GET' && requestUrl.pathname === '/mybible-map-review.css') {
        text(response, 200, fs.readFileSync(reviewAssetPath('mybible-map-review.css'), 'utf8'), 'text/css; charset=utf-8');
        return;
      }
      if (request.method === 'GET' && requestUrl.pathname === '/api/state') {
        json(response, 200, state(document, session.backupPath));
        return;
      }
      const groupMatch = /^\/api\/groups\/([^/]+)$/.exec(requestUrl.pathname);
      if (request.method === 'GET' && groupMatch) {
        const groupId = decodeURIComponent(groupMatch[1]);
        const group = document.reviewGroups.find(candidate => candidate.id === groupId);
        if (!group) {
          json(response, 404, { error: 'Review group was not found.' });
          return;
        }
        const offset = Math.max(0, Number.parseInt(requestUrl.searchParams.get('offset') ?? '0', 10) || 0);
        const limit = Math.min(500, Math.max(1, Number.parseInt(requestUrl.searchParams.get('limit') ?? '100', 10) || 100));
        const groupEntries = document.entries.filter(entry => entry.reviewGroupId === groupId);
        const pageEntries = groupEntries.slice(offset, offset + limit);
        const entries = pageEntries.map(entry => ({
          ...entry,
          reference: entry.reference.map(location => ({ ...location, text: referenceTexts.get(locationKey(location)) ?? '' })),
          module: entry.module.map(location => ({ ...location, text: moduleTexts.get(locationKey(location)) ?? '' })),
          context: {
            reference: reviewContext(
              referenceLocations,
              referenceTexts,
              entry.reference,
              entry.reference.length > 0 ? entry.reference : entry.module
            ),
            module: reviewContext(
              moduleLocations,
              moduleTexts,
              entry.module,
              entry.module.length > 0 ? entry.module : entry.reference
            )
          }
        }));
        json(response, 200, {
          group,
          entries,
          offset,
          limit,
          total: groupEntries.length
        });
        return;
      }
      if (request.method === 'POST' && groupMatch) {
        const groupId = decodeURIComponent(groupMatch[1]);
        const body = await requestBody(request) as { status?: unknown; allowNonMonotonic?: unknown };
        if (body.status != null && (typeof body.status !== 'string' || !allowedStatuses.has(body.status as VerseMapReviewStatus))) {
          json(response, 400, { error: 'status must be candidate, confirmed, or rejected.' });
          return;
        }
        if (body.allowNonMonotonic != null && typeof body.allowNonMonotonic !== 'boolean') {
          json(response, 400, { error: 'allowNonMonotonic must be boolean.' });
          return;
        }
        const requestedStatus = body.status as VerseMapReviewStatus | undefined;
        const requestedNonMonotonic = body.allowNonMonotonic as boolean | undefined;
        let result: unknown;
        let mutationError: unknown;
        mutationQueue = mutationQueue.then(async () => {
          try {
            const updated = readVerseMapDocument(mapPath);
            const group = updated.reviewGroups.find(candidate => candidate.id === groupId);
            if (!group) throw new Error('Review group was not found.');
            if (requestedStatus != null) {
              group.status = requestedStatus;
              group.autoConfirmed = false;
            }
            if (requestedNonMonotonic != null) group.allowNonMonotonic = requestedNonMonotonic;
            updated.validation = await validateVerseMapDocument(updated, { referencePath, modulePath });
            const persistence = persistDocument(mapPath, updated, session);
            document = updated;
            result = { group, ...persistence, validation: updated.validation };
          } catch (error) {
            mutationError = error;
          }
        });
        await mutationQueue;
        if (mutationError) throw mutationError;
        json(response, 200, result);
        return;
      }
      const entryMatch = /^\/api\/groups\/([^/]+)\/entries\/([^/]+)$/.exec(requestUrl.pathname);
      if (request.method === 'POST' && entryMatch) {
        const groupId = decodeURIComponent(entryMatch[1]);
        const entryId = decodeURIComponent(entryMatch[2]);
        const body = await requestBody(request) as { referenceCoordinates?: unknown; moduleCoordinates?: unknown };
        const reference = parseCoordinates(body.referenceCoordinates, referenceLocations, 'Reference');
        const module = parseCoordinates(body.moduleCoordinates, moduleLocations, 'Module');
        if (reference.length === 0 && module.length === 0) {
          json(response, 400, { error: 'At least one side of a correspondence must contain a verse.' });
          return;
        }
        let result: unknown;
        let mutationError: unknown;
        mutationQueue = mutationQueue.then(async () => {
          try {
            const updated = readVerseMapDocument(mapPath);
            const entry = updated.entries.find(candidate => candidate.id === entryId && candidate.reviewGroupId === groupId);
            if (!entry) throw new Error('Review entry was not found.');
            entry.reference = reference;
            entry.module = module;
            entry.kind = entryKind(reference, module);
            entry.confidence = 'high';
            entry.evidence = ['manual-review'];
            const adjustments = reassignClaimedLocations(updated, entryId, reference, module);
            refreshGroup(updated, groupId);
            updated.validation = await validateVerseMapDocument(updated, { referencePath, modulePath });
            const persistence = persistDocument(mapPath, updated, session);
            document = updated;
            result = { entry, adjustments, ...persistence, validation: updated.validation };
          } catch (error) {
            mutationError = error;
          }
        });
        await mutationQueue;
        if (mutationError) throw mutationError;
        json(response, 200, result);
        return;
      }
      if (request.method === 'POST' && requestUrl.pathname === '/api/validate') {
        let result: unknown;
        let mutationError: unknown;
        mutationQueue = mutationQueue.then(async () => {
          try {
            const updated = readVerseMapDocument(mapPath);
            updated.validation = await validateVerseMapDocument(updated, { referencePath, modulePath });
            document = updated;
            result = { backupCreated: false, validation: updated.validation };
          } catch (error) {
            mutationError = error;
          }
        });
        await mutationQueue;
        if (mutationError) throw mutationError;
        json(response, 200, result);
        return;
      }
      if (request.method === 'POST' && requestUrl.pathname === '/api/build-module') {
        const current = readVerseMapDocument(mapPath);
        const candidates = current.reviewGroups.filter(group => group.status === 'candidate').length;
        if (candidates > 0) {
          json(response, 409, { error: `The map still has ${candidates} review group(s).` });
          return;
        }
        const outputs = buildPaths(mapPath, referencePath, current.module.moduleId);
        let result: unknown;
        let operationError: unknown;
        mutationQueue = mutationQueue.then(async () => {
          try {
            const compiled = await compileConfirmedVerseMap({
              mapPath,
              outputPath: outputs.compiledPath,
              coordinateReferenceModule: 'kjv',
              referenceDifferencesManifestPath: outputs.referenceManifestPath,
              referencePath,
              modulePath,
              directMappingsOutputPath: outputs.directMappingsPath,
              force: true
            });
            const module = await convertMyBibleModule({
              biblePath: modulePath,
              referenceManifestPath: outputs.referenceManifestPath,
              outputPath: outputs.moduleOutputPath,
              shortName: moduleShortName(current.module.moduleId),
              footnotesPath,
              requireResolvedFootnotes: true,
              directMappingsPath: outputs.directMappingsPath,
              coordinateReferenceModule: 'kjv',
              force: true
            });
            result = { compiled, module };
          } catch (error) {
            operationError = error;
          }
        });
        await mutationQueue;
        if (operationError) throw operationError;
        json(response, 200, result);
        return;
      }
      json(response, 404, { error: 'Not found.' });
    } catch (error) {
      json(response, 500, { error: error instanceof Error ? error.message : String(error) });
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(options.port ?? 4313, options.host ?? '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Review server did not bind to a TCP port.');
  origin = `http://${options.host ?? '127.0.0.1'}:${address.port}`;
  return {
    url: `${origin}/?token=${encodeURIComponent(token)}`,
    origin,
    token,
    mapPath,
    footnotesPath,
    close: () => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  };
}
