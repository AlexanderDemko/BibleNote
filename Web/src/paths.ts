import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const defaultBibleNoteDir = path.join(os.homedir(), 'BibleNote');
export const legacyCodexOneNoteDir = path.join(os.homedir(), '.codex-onenote-mcp');

// WAL and SHM files are tied to an exact database state. Copying a stale pair
// after the destination database has been checkpointed can make a healthy cache
// appear corrupt, so only migrate the durable database file itself.
const legacyFiles = [
  '.env',
  'msal-cache.json',
  'runtime-settings.json',
  'extended.log',
  'onenote-cache.sqlite'
];

function copyIfMissing(source: string, target: string): void {
  if (!fs.existsSync(source) || fs.existsSync(target)) return;
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
}

export function migrateLegacyBibleNoteDirSync(): void {
  if (!fs.existsSync(legacyCodexOneNoteDir) || legacyCodexOneNoteDir === defaultBibleNoteDir) return;

  try {
    for (const fileName of legacyFiles) {
      copyIfMissing(
        path.join(legacyCodexOneNoteDir, fileName),
        path.join(defaultBibleNoteDir, fileName)
      );
    }
  } catch {
    // Legacy migration should not block startup; the new directory remains authoritative.
  }
}
