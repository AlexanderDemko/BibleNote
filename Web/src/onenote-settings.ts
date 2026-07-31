import './env.js';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { resetGraphAccessToken } from './graph.js';
import { defaultBibleNoteDir } from './paths.js';

const managedKeys = [
  'ONENOTE_DATA_SOURCE'
] as const;
const obsoleteRegistrationKeys = new Set([
  'ONENOTE_CLIENT_ID',
  'ONENOTE_TENANT_ID',
  'ONENOTE_SCOPES'
]);

type ManagedKey = typeof managedKeys[number];

export type OneNoteAccessSettings = {
  envFilePath: string;
  dataSource: OneNoteDataSource;
};

export type OneNoteDataSource = 'graph' | 'com';

export function oneNoteDataSource(): OneNoteDataSource {
  return process.env.ONENOTE_DATA_SOURCE?.trim().toLowerCase() === 'com'
    ? 'com'
    : 'graph';
}

export function oneNoteSettingsEnvPath(): string {
  return process.env.ONENOTE_ENV_FILE
    || path.join(defaultBibleNoteDir, '.env');
}

export function readOneNoteAccessSettings(): OneNoteAccessSettings {
  return {
    envFilePath: oneNoteSettingsEnvPath(),
    dataSource: oneNoteDataSource()
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
  const dataSource: OneNoteDataSource = cleanSingleLine(input.dataSource, current.dataSource).toLowerCase() === 'com'
    ? 'com'
    : 'graph';

  const updates: Record<ManagedKey, string> = {
    ONENOTE_DATA_SOURCE: dataSource
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
