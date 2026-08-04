import './env.js';
import { promises as fs } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { resetGraphAccessToken } from './graph.js';
import { defaultBibleNoteDir } from './paths.js';

const managedKeys = [
  'ONENOTE_DATA_SOURCE',
  'ONENOTE_FOLDER_PATHS',
  'BIBLENOTE_DATA_SOURCES'
] as const;
const obsoleteRegistrationKeys = new Set([
  'ONENOTE_CLIENT_ID',
  'ONENOTE_TENANT_ID',
  'ONENOTE_SCOPES'
]);

type ManagedKey = typeof managedKeys[number];

export type OneNoteAccessSettings = {
  envFilePath: string;
  sources: ConfiguredDataSource[];
  dataSource: OneNoteDataSource;
  folderPaths: string[];
};

export type OneNoteDataSource = 'graph' | 'com' | 'folder';

export type ConfiguredNotebook = {
  id: string;
  displayName: string;
};

export type ConfiguredDataSource = {
  id: string;
  type: OneNoteDataSource;
  displayName: string;
  /** Undefined keeps the legacy behaviour: synchronize every notebook. */
  notebooks?: ConfiguredNotebook[];
  folderPaths?: string[];
  deduplicateFilesByName?: boolean;
  /** Legacy single-folder representation accepted while migrating saved settings. */
  folderPath?: string;
};

function canonicalFolderPath(folderPath: string): string {
  const resolved = path.resolve(folderPath);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

function folderSourceId(folderPaths: readonly string[]): string {
  const canonical = folderPaths.map(canonicalFolderPath).sort().join('\n');
  return `source:folder:${createHash('sha256').update(canonical).digest('hex').slice(0, 24)}`;
}

export function folderPathsForSource(source: Pick<ConfiguredDataSource, 'type' | 'folderPaths' | 'folderPath'>): string[] {
  if (source.type !== 'folder') return [];
  const values = Array.isArray(source.folderPaths)
    ? source.folderPaths
    : source.folderPath
      ? [source.folderPath]
      : [];
  const seen = new Set<string>();
  return values.flatMap(value => {
    if (typeof value !== 'string' || !value.trim()) return [];
    const resolved = path.resolve(value.trim());
    const canonical = canonicalFolderPath(resolved);
    if (seen.has(canonical)) return [];
    seen.add(canonical);
    return [resolved];
  });
}

function normalizeSources(values: unknown[]): ConfiguredDataSource[] {
  const result: ConfiguredDataSource[] = [];
  const seen = new Set<string>();
  const seenFolderPaths = new Set<string>();
  for (const value of values) {
    if (!value || typeof value !== 'object') continue;
    const raw = value as Record<string, unknown>;
    const type = raw.type === 'com' || raw.type === 'folder' ? raw.type : raw.type === 'graph' ? 'graph' : undefined;
    if (!type) continue;
    const folderPaths = type === 'folder'
      ? folderPathsForSource({
          type,
          folderPaths:Array.isArray(raw.folderPaths) ? raw.folderPaths.filter((item): item is string => typeof item === 'string') : undefined,
          folderPath:typeof raw.folderPath === 'string' ? raw.folderPath : undefined
        }).filter(folderPath => {
          const canonical = canonicalFolderPath(folderPath);
          if (seenFolderPaths.has(canonical)) return false;
          seenFolderPaths.add(canonical);
          return true;
        })
      : [];
    if (type === 'folder' && folderPaths.length === 0) continue;
    const notebooks = type !== 'folder' && Array.isArray(raw.notebooks)
      ? [...new Map(raw.notebooks.flatMap(item => {
          if (!item || typeof item !== 'object') return [];
          const notebook = item as Record<string, unknown>;
          const id = cleanSingleLine(notebook.id);
          if (!id) return [];
          return [[id, { id, displayName:cleanSingleLine(notebook.displayName) || 'Без названия' }] as const];
        })).values()]
      : undefined;
    const requestedId = cleanSingleLine(raw.id);
    const id = type === 'folder'
      ? requestedId.startsWith('source:folder:') ? requestedId : folderSourceId(folderPaths)
      : `source:${type}`;
    if (seen.has(id)) continue;
    seen.add(id);
    result.push({
      id,
      type,
      displayName:type === 'graph'
        ? 'OneNote Cloud'
        : type === 'com'
          ? 'OneNote Local'
          : cleanSingleLine(raw.displayName)
            || (folderPaths.length === 1 ? path.basename(folderPaths[0]) || folderPaths[0] : `Папки (${folderPaths.length})`),
      ...(folderPaths.length ? { folderPaths } : {}),
      ...(notebooks ? { notebooks } : {}),
      ...(type === 'folder' ? { deduplicateFilesByName:raw.deduplicateFilesByName === true } : {})
    });
  }
  return result;
}

function decodeSourceList(): ConfiguredDataSource[] | undefined {
  const encoded = process.env.BIBLENOTE_DATA_SOURCES?.trim();
  if (!encoded) return undefined;
  try {
    const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    return Array.isArray(parsed) ? normalizeSources(parsed) : undefined;
  } catch {
    return undefined;
  }
}

export function configuredDataSources(): ConfiguredDataSource[] {
  const configured = decodeSourceList();
  if (configured) return configured;
  const legacyType = oneNoteDataSourceLegacy();
  if (legacyType === 'folder') {
    return normalizeSources(folderSourcePathsLegacy().map(folderPath => ({ type:'folder', folderPaths:[folderPath] })));
  }
  return normalizeSources([{ type:legacyType }]);
}

function oneNoteDataSourceLegacy(): OneNoteDataSource {
  const value = process.env.ONENOTE_DATA_SOURCE?.trim().toLowerCase();
  return value === 'com' || value === 'folder' ? value : 'graph';
}

export function oneNoteDataSource(): OneNoteDataSource {
  return configuredDataSources()[0]?.type ?? 'graph';
}

function folderSourcePathsLegacy(): string[] {
  const encoded = process.env.ONENOTE_FOLDER_PATHS?.trim();
  if (!encoded) return [];
  try {
    const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    return Array.isArray(parsed)
      ? parsed.filter((value): value is string => typeof value === 'string' && Boolean(value.trim()))
      : [];
  } catch {
    return [];
  }
}

export function folderSourcePaths(): string[] {
  const configured = decodeSourceList();
  return configured
    ? configured.flatMap(folderPathsForSource)
    : folderSourcePathsLegacy();
}

export function oneNoteSettingsEnvPath(): string {
  return process.env.ONENOTE_ENV_FILE
    || path.join(defaultBibleNoteDir, '.env');
}

export function readOneNoteAccessSettings(): OneNoteAccessSettings {
  const sources = configuredDataSources();
  return {
    envFilePath: oneNoteSettingsEnvPath(),
    sources,
    dataSource:sources[0]?.type ?? 'graph',
    folderPaths:sources.flatMap(folderPathsForSource)
  };
}

function cleanSingleLine(value: unknown, fallback = ''): string {
  return typeof value === 'string'
    ? value.replace(/[\r\n]+/g, ' ').trim()
    : fallback;
}

function formatEnvValue(value: string): string {
  if (/^[A-Za-z0-9_./:\\-]+$/.test(value)) return value;
  return `"${value.replace(/"/g, '\\"')}"`;
}

function envLineKey(line: string): string | undefined {
  const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/);
  return match?.[1];
}

export async function saveOneNoteAccessSettings(input: Record<string, unknown>): Promise<OneNoteAccessSettings> {
  const current = readOneNoteAccessSettings();
  let sources: ConfiguredDataSource[];
  if (Array.isArray(input.sources)) {
    sources = normalizeSources(input.sources);
  } else {
    const requestedSource = cleanSingleLine(input.dataSource, current.dataSource).toLowerCase();
    const dataSource: OneNoteDataSource = requestedSource === 'com' || requestedSource === 'folder' ? requestedSource : 'graph';
    const requestedFolderPaths = Array.isArray(input.folderPaths)
      ? input.folderPaths.map(value => cleanSingleLine(value)).filter(Boolean)
      : current.folderPaths;
    sources = dataSource === 'folder'
      ? normalizeSources([{ type:'folder', folderPaths:requestedFolderPaths }])
      : normalizeSources([{ type:dataSource }]);
  }
  const dataSource = sources[0]?.type ?? 'graph';
  const folderPaths = sources.flatMap(folderPathsForSource);

  const updates: Record<ManagedKey, string> = {
    ONENOTE_DATA_SOURCE: dataSource,
    ONENOTE_FOLDER_PATHS: Buffer.from(JSON.stringify(folderPaths), 'utf8').toString('base64url'),
    BIBLENOTE_DATA_SOURCES: Buffer.from(JSON.stringify(sources), 'utf8').toString('base64url')
  };
  const envPath = oneNoteSettingsEnvPath();
  let lines: string[] = [];
  try {
    lines = (await fs.readFile(envPath, 'utf8')).split(/\r?\n/);
  } catch (error: any) {
    if (error?.code !== 'ENOENT') throw error;
  }

  const seen = new Set<ManagedKey>();
  lines = lines.flatMap(line => {
    const key = envLineKey(line);
    if (key && obsoleteRegistrationKeys.has(key)) return [];
    if (!key || !managedKeys.includes(key as ManagedKey)) return [line];
    seen.add(key as ManagedKey);
    return [`${key}=${formatEnvValue(updates[key as ManagedKey])}`];
  });

  for (const key of managedKeys) {
    if (!seen.has(key)) lines.push(`${key}=${formatEnvValue(updates[key])}`);
  }

  while (lines.length > 0 && lines[0] === '') lines.shift();
  while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();

  await fs.mkdir(path.dirname(envPath), { recursive:true });
  await fs.writeFile(envPath, `${lines.join('\n')}\n`, 'utf8');

  for (const key of managedKeys) process.env[key] = updates[key];
  resetGraphAccessToken();
  return readOneNoteAccessSettings();
}
