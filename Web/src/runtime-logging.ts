import fs from 'node:fs';
import path from 'node:path';
import { defaultBibleNoteDir } from './paths.js';

export type RuntimeLoggingSettings = {
  verboseLogging: boolean;
  settingsPath: string;
  logPath: string;
};

const sensitiveKeyPattern = /token|secret|password|authorization|clientid|client_id|cache/i;
let settingsPath = path.join(defaultBibleNoteDir, 'runtime-settings.json');
let logPath = path.join(defaultBibleNoteDir, 'extended.log');
let verboseLogging = false;

function readSettingsFile(): void {
  try {
    const raw = fs.readFileSync(settingsPath, 'utf8');
    const parsed = JSON.parse(raw) as { verboseLogging?: unknown };
    verboseLogging = parsed.verboseLogging === true;
  } catch (error: any) {
    if (error?.code !== 'ENOENT') {
      verboseLogging = false;
    }
  }
}

export function configureRuntimeLogging(baseDir: string): RuntimeLoggingSettings {
  settingsPath = path.join(baseDir, 'runtime-settings.json');
  logPath = path.join(baseDir, 'extended.log');
  readSettingsFile();
  return readRuntimeLoggingSettings();
}

export function readRuntimeLoggingSettings(): RuntimeLoggingSettings {
  return {
    verboseLogging,
    settingsPath,
    logPath
  };
}

export async function saveRuntimeLoggingSettings(input: Record<string, unknown>): Promise<RuntimeLoggingSettings> {
  verboseLogging = input.verboseLogging === true;
  await fs.promises.mkdir(path.dirname(settingsPath), { recursive: true });
  await fs.promises.writeFile(settingsPath, `${JSON.stringify({ verboseLogging }, null, 2)}\n`, 'utf8');
  runtimeLog('settings', `Extended logging ${verboseLogging ? 'enabled' : 'disabled'}`);
  return readRuntimeLoggingSettings();
}

function redact(value: unknown, depth = 0): unknown {
  if (value == null || depth > 5) return value;
  if (Array.isArray(value)) return value.slice(0, 50).map(item => redact(item, depth + 1));
  if (typeof value !== 'object') {
    if (typeof value === 'string' && value.length > 1000) return `${value.slice(0, 1000)}...`;
    return value;
  }
  const output: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    output[key] = sensitiveKeyPattern.test(key) ? '[redacted]' : redact(nested, depth + 1);
  }
  return output;
}

export function runtimeLog(category: string, message: string, details?: unknown): void {
  if (!verboseLogging) return;
  const entry = {
    time: new Date().toISOString(),
    pid: process.pid,
    category,
    message,
    details: redact(details)
  };
  try {
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    fs.appendFileSync(logPath, `${JSON.stringify(entry)}\n`, 'utf8');
  } catch {
    // Logging must never break the app.
  }
}
