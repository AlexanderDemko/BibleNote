import fs from 'node:fs';
import path from 'node:path';
import { defaultBibleNoteDir } from './paths.js';

export type RuntimeLoggingSettings = {
  verboseLogging: boolean;
  settingsPath: string;
  logPath: string;
};

const sensitiveKeyPattern = /token|secret|password|authorization|clientid|client_id|cache/i;
const runtimeLogMaxBytes = 10 * 1024 * 1024;
const runtimeLogBackupCount = 3;
let settingsPath = path.join(defaultBibleNoteDir, 'runtime-settings.json');
let logPath = path.join(defaultBibleNoteDir, 'extended.log');
let verboseLogging = false;

function ignoreMissingFile(error: any): void {
  if (error?.code !== 'ENOENT') throw error;
}

function trimRuntimeLogTail(targetPath: string, maxBytes: number): void {
  const stat = fs.statSync(targetPath);
  if (stat.size <= maxBytes) return;
  const bytesToRead = Math.min(stat.size, maxBytes);
  const buffer = Buffer.allocUnsafe(bytesToRead);
  const handle = fs.openSync(targetPath, 'r+');
  try {
    const bytesRead = fs.readSync(handle, buffer, 0, bytesToRead, stat.size - bytesToRead);
    const firstLineEnd = buffer.indexOf(0x0a, 0);
    const start = firstLineEnd >= 0 && firstLineEnd + 1 < bytesRead ? firstLineEnd + 1 : 0;
    const tail = buffer.subarray(start, bytesRead);
    fs.writeSync(handle, tail, 0, tail.length, 0);
    fs.ftruncateSync(handle, tail.length);
  } finally {
    fs.closeSync(handle);
  }
}

export function rotateRuntimeLogFiles(
  targetPath: string,
  maxBytes = runtimeLogMaxBytes,
  backupCount = runtimeLogBackupCount,
  pendingBytes = 0
): boolean {
  if (!Number.isFinite(maxBytes) || maxBytes <= 0 || backupCount < 1) return false;
  let currentBytes = 0;
  try {
    currentBytes = fs.statSync(targetPath).size;
  } catch (error: any) {
    ignoreMissingFile(error);
    return false;
  }
  if (currentBytes + Math.max(0, pendingBytes) <= maxBytes) return false;

  try {
    fs.unlinkSync(`${targetPath}.${backupCount}`);
  } catch (error: any) {
    ignoreMissingFile(error);
  }
  for (let index = backupCount - 1; index >= 1; index -= 1) {
    try {
      fs.renameSync(`${targetPath}.${index}`, `${targetPath}.${index + 1}`);
    } catch (error: any) {
      ignoreMissingFile(error);
    }
  }
  try {
    fs.renameSync(targetPath, `${targetPath}.1`);
  } catch (error: any) {
    ignoreMissingFile(error);
    return false;
  }
  trimRuntimeLogTail(`${targetPath}.1`, maxBytes);
  return true;
}

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
  try {
    rotateRuntimeLogFiles(logPath);
  } catch {
    // Log maintenance must never break startup.
  }
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
  writeRuntimeLog(category, message, details);
}

export function runtimeWarning(category: string, message: string, details?: unknown): void {
  writeRuntimeLog(category, message, details, 'warning');
}

function writeRuntimeLog(category: string, message: string, details?: unknown, level: 'info' | 'warning' = 'info'): void {
  const entry = {
    time: new Date().toISOString(),
    pid: process.pid,
    level,
    category,
    message,
    details: redact(details)
  };
  try {
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    const line = `${JSON.stringify(entry)}\n`;
    rotateRuntimeLogFiles(logPath, runtimeLogMaxBytes, runtimeLogBackupCount, Buffer.byteLength(line, 'utf8'));
    fs.appendFileSync(logPath, line, 'utf8');
  } catch {
    // Logging must never break the app.
  }
}
