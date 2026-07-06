import './env.js';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { oneNoteAuthConfig } from './auth.js';
import { resetGraphAccessToken } from './graph.js';

const managedKeys = [
  'ONENOTE_CLIENT_ID',
  'ONENOTE_TENANT_ID',
  'ONENOTE_SCOPES',
  'ONENOTE_TOKEN_CACHE'
] as const;

type ManagedKey = typeof managedKeys[number];

export type OneNoteAccessSettings = {
  envFilePath: string;
  clientId: string;
  tenantId: string;
  scopes: string;
  tokenCache: string;
};

export function oneNoteSettingsEnvPath(): string {
  return process.env.ONENOTE_ENV_FILE
    || path.join(os.homedir(), '.codex-onenote-mcp', '.env');
}

export function readOneNoteAccessSettings(): OneNoteAccessSettings {
  const config = oneNoteAuthConfig();
  return {
    envFilePath: oneNoteSettingsEnvPath(),
    clientId: config.clientId ?? '',
    tenantId: config.tenantId,
    scopes: config.scopes.join(' '),
    tokenCache: config.cachePath
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
  const clientId = cleanSingleLine(input.clientId);
  const tenantId = cleanSingleLine(input.tenantId, current.tenantId) || 'common';
  const scopes = cleanSingleLine(input.scopes, current.scopes) || 'Notes.Read User.Read offline_access';
  const tokenCache = cleanSingleLine(input.tokenCache, current.tokenCache) || current.tokenCache;

  if (!clientId) throw new Error('ONENOTE_CLIENT_ID is required.');

  const updates: Record<ManagedKey, string> = {
    ONENOTE_CLIENT_ID: clientId,
    ONENOTE_TENANT_ID: tenantId,
    ONENOTE_SCOPES: scopes,
    ONENOTE_TOKEN_CACHE: tokenCache
  };
  const envPath = oneNoteSettingsEnvPath();
  let lines: string[] = [];
  try {
    lines = (await fs.readFile(envPath, 'utf8')).split(/\r?\n/);
  } catch (error: any) {
    if (error?.code !== 'ENOENT') throw error;
  }

  const seen = new Set<ManagedKey>();
  lines = lines.map(line => {
    const key = envLineKey(line);
    if (!key || !managedKeys.includes(key as ManagedKey)) return line;
    seen.add(key as ManagedKey);
    return `${key}=${formatEnvValue(updates[key as ManagedKey])}`;
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
