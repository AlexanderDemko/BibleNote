import { config } from 'dotenv';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function existingEnvPaths(): string[] {
  const paths = [
    process.env.ONENOTE_ENV_FILE,
    path.join(os.homedir(), '.codex-onenote-mcp', '.env'),
    process.env.PORTABLE_EXECUTABLE_DIR ? path.join(process.env.PORTABLE_EXECUTABLE_DIR, '.env') : undefined,
    process.execPath ? path.join(path.dirname(process.execPath), '.env') : undefined,
    path.join(process.cwd(), '.env'),
    fileURLToPath(new URL('../.env', import.meta.url))
  ];

  return [...new Set(paths.filter((candidate): candidate is string => Boolean(candidate)))]
    .filter(candidate => {
      try {
        return fs.existsSync(candidate);
      } catch {
        return false;
      }
    });
}

for (const envPath of existingEnvPaths()) {
  config({ path: envPath });
}
