import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { bibleParseConfigFromEnv, parsePageWithBibleNote } from './bible.js';

const startupTimingStartedAt = Date.now();

function logStartupTiming(message: string): void {
  if (process.env.ONENOTE_STARTUP_TIMING !== '1') return;
  const line = `[cache-ui startup +${Date.now() - startupTimingStartedAt}ms] ${message}`;
  console.log(line);
  if (process.env.ONENOTE_STARTUP_LOG) {
    try {
      fs.appendFileSync(process.env.ONENOTE_STARTUP_LOG, `${new Date().toISOString()} ${line}\n`, 'utf8');
    } catch {
      // Startup timing must never block the app if the log path is unavailable.
    }
  }
}

async function fetchJson(url: string, init?: RequestInit): Promise<any> {
  const response = await fetch(url, init);
  const text = await response.text();
  const body = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new Error(body?.error || body?.title || text || `HTTP ${response.status}`);
  }
  return body;
}

export async function bibleNoteHealth(): Promise<Record<string, unknown>> {
  const bibleConfig = bibleParseConfigFromEnv();
  return fetchJson(`${bibleConfig.apiUrl.replace(/\/+$/, '')}/api/VerseParsing/Health`);
}

export async function bibleNoteModules(): Promise<Array<Record<string, unknown>>> {
  const bibleConfig = bibleParseConfigFromEnv();
  return fetchJson(`${bibleConfig.apiUrl.replace(/\/+$/, '')}/api/VerseParsing/Modules`) as Promise<Array<Record<string, unknown>>>;
}

export async function bibleNoteBooks(module: string): Promise<Array<Record<string, unknown>>> {
  const bibleConfig = bibleParseConfigFromEnv();
  const params = new URLSearchParams({ module });
  return fetchJson(`${bibleConfig.apiUrl.replace(/\/+$/, '')}/api/VerseParsing/Books?${params.toString()}`) as Promise<Array<Record<string, unknown>>>;
}

let localBibleNoteProcess: ChildProcess | undefined;
let localBibleNoteEnsurePromise: Promise<void> | undefined;
let bibleNoteHealthyUntil = 0;

function electronControlUrl(pathname: string): string | undefined {
  const base = process.env.ONENOTE_ELECTRON_CONTROL_URL;
  if (!base) return undefined;
  return `${base.replace(/\/+$/, '')}${pathname}`;
}

export async function electronControl(pathname: string, method = 'GET'): Promise<Record<string, unknown>> {
  const target = electronControlUrl(pathname);
  if (!target) return { available:false };
  return fetchJson(target, { method }) as Promise<Record<string, unknown>>;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function waitForBibleNoteHealth(timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      await bibleNoteHealth();
      return;
    } catch (error) {
      lastError = error;
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

function startLocalBibleNoteProcess(): void {
  const exe = process.env.BIBLENOTE_EXE_PATH;
  if (!exe) throw new Error('BIBLENOTE_EXE_PATH is not set.');
  if (!fs.existsSync(exe)) throw new Error(`BibleNote executable was not found: ${exe}`);
  if (localBibleNoteProcess && !localBibleNoteProcess.killed) return;

  const bibleConfig = bibleParseConfigFromEnv();
  logStartupTiming(`starting local BibleNote API exe=${exe}`);
  localBibleNoteProcess = spawn(exe, ['--urls', bibleConfig.apiUrl], {
    cwd:path.dirname(exe),
    env:{
      ...process.env,
      ASPNETCORE_ENVIRONMENT:process.env.ASPNETCORE_ENVIRONMENT ?? 'Development',
      BIBLENOTE_API_URL:bibleConfig.apiUrl
    },
    windowsHide:true,
    stdio:['ignore', 'pipe', 'pipe']
  });
  localBibleNoteProcess.stdout?.on('data', chunk => logStartupTiming(`[biblenote] ${chunk.toString().trimEnd()}`));
  localBibleNoteProcess.stderr?.on('data', chunk => logStartupTiming(`[biblenote] ${chunk.toString().trimEnd()}`));
  localBibleNoteProcess.on('error', error => logStartupTiming(`local BibleNote API process error: ${error.message}`));
  localBibleNoteProcess.on('exit', (code, signal) => {
    logStartupTiming(`local BibleNote API process exited code=${code ?? 'null'} signal=${signal ?? 'null'}`);
    localBibleNoteProcess = undefined;
  });
}

async function ensureLocalBibleNoteAvailable(): Promise<void> {
  if (!localBibleNoteEnsurePromise) {
    localBibleNoteEnsurePromise = (async () => {
      startLocalBibleNoteProcess();
      await waitForBibleNoteHealth(30000);
      bibleNoteHealthyUntil = Date.now() + 30000;
    })().finally(() => {
      localBibleNoteEnsurePromise = undefined;
    });
  }
  await localBibleNoteEnsurePromise;
}

export async function ensureBibleNoteAvailable(): Promise<void> {
  if (Date.now() < bibleNoteHealthyUntil) return;
  try {
    await bibleNoteHealth();
    bibleNoteHealthyUntil = Date.now() + 30000;
    return;
  } catch (firstError) {
    const result = await electronControl('/biblenote/ensure', 'POST').catch(error => ({
      available:false,
      error:messageOf(error)
    }));
    if (result.available) {
      await bibleNoteHealth();
      bibleNoteHealthyUntil = Date.now() + 30000;
      return;
    }
    try {
      await ensureLocalBibleNoteAvailable();
      return;
    } catch (localError) {
      throw new Error(`BibleNote API is unavailable: ${String(result.error || messageOf(firstError))}; local start failed: ${messageOf(localError)}`);
    }
  }
}

process.once('exit', () => {
  if (localBibleNoteProcess && !localBibleNoteProcess.killed) localBibleNoteProcess.kill();
});

function cleanModuleName(fileName: string): string {
  const parsed = path.parse(fileName);
  const base = (parsed.name || 'module').trim();
  const safe = base.replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/^_+|_+$/g, '');
  return safe || 'module';
}

export async function uploadBibleNoteModule(fileName: string, contentBase64: string): Promise<Record<string, unknown>> {
  if (!/\.(bnm|zip)$/i.test(fileName)) throw new Error('Module file must have .bnm or .zip extension.');
  if (!/^[a-zA-Z0-9+/=]+$/.test(contentBase64)) throw new Error('Invalid base64 module payload.');
  const bibleConfig = bibleParseConfigFromEnv();
  const apiUrl = bibleConfig.apiUrl.replace(/\/+$/, '');
  const moduleName = cleanModuleName(fileName);
  const uploadDir = path.join(process.env.APPDATA || process.cwd(), 'BibleNote', 'BibleNoteModules');
  fs.mkdirSync(uploadDir, { recursive:true });
  const tempFile = path.join(uploadDir, `${moduleName}${path.extname(fileName).toLowerCase()}`);
  fs.writeFileSync(tempFile, Buffer.from(contentBase64, 'base64'));

  try {
    const result = await fetchJson(`${apiUrl}/api/VerseParsing/UploadModule`, {
      method:'POST',
      headers:{ 'Content-Type':'application/json' },
      body:JSON.stringify({ filePath:tempFile, moduleName })
    });
    return {
      installed:true,
      moduleName:result.shortName || result.module || moduleName,
      message:'Модуль установлен через BibleNote API.'
    };
  } catch (error: any) {
    let modulesPackagePath: string | undefined;
    try {
      const health = await bibleNoteHealth();
      const modulesDirectory = typeof health.modulesDirectory === 'string' ? health.modulesDirectory : undefined;
      if (modulesDirectory) {
        modulesPackagePath = path.join(path.dirname(modulesDirectory), 'ModulesPackages');
        fs.mkdirSync(modulesPackagePath, { recursive:true });
        fs.copyFileSync(tempFile, path.join(modulesPackagePath, path.basename(tempFile)));
      }
    } catch {
      // The saved temporary upload is still useful for manual installation.
    }
    return {
      installed:false,
      moduleName,
      savedPath:tempFile,
      modulesPackagePath,
      message:'Файл модуля сохранен, но текущий BibleNote API не предоставляет endpoint установки модуля. Нужна доработка BibleNote: POST /api/VerseParsing/UploadModule с вызовом ModulesManager.UploadModule.'
    };
  }
}

function parseIsbtBibleVerse(rawRef: string): Record<string, unknown> | undefined {
  const normalizedRawRef = rawRef.trim().replace(/^https?:\/\/isbtBibleVerse:/i, 'isbtBibleVerse:');
  const payload = normalizedRawRef.replace(/^isbtBibleVerse:/i, '').trim();
  if (!payload) return undefined;
  const [machinePart, displayPart] = payload.split(';', 2);
  const machine = decodeURIComponent(machinePart || '').trim();
  const display = decodeURIComponent(displayPart || '').trim();
  const match = machine.match(/^([^/]+)\/(\d+)\s+(\d+)(?::(\d+))?(?:-(?:(\d+):)?(\d+))?$/);
  if (!match) return undefined;
  const [, module, bookIndex, chapter, verse, topChapter, topVerse] = match;
  return {
    module,
    originalText:display || machine,
    normalizedRef:display || machine,
    bookIndex:Number(bookIndex),
    chapter:Number(chapter),
    verse:verse ? Number(verse) : undefined,
    topChapter:topChapter ? Number(topChapter) : undefined,
    topVerse:topVerse ? Number(topVerse) : undefined
  };
}

export async function parseExternalBibleRef(rawRef: string, module?: string): Promise<Record<string, unknown>> {
  const normalizedRawRef = rawRef.trim()
    .replace(/^https?:\/\/isbtBibleVerse:/i, 'isbtBibleVerse:')
    .replace(/^https?:\/\/bnVerse:/i, 'bnVerse:');
  const isbtReference = /^isbtBibleVerse:/i.test(normalizedRawRef) ? parseIsbtBibleVerse(normalizedRawRef) : undefined;
  if (isbtReference) return isbtReference;

  const text = normalizedRawRef.replace(/^bnVerse:/i, '').trim();
  if (!text) throw new Error('Bible reference is empty.');
  await ensureBibleNoteAvailable();
  const bibleConfig = bibleParseConfigFromEnv();
  const parsed = await parsePageWithBibleNote({
    apiUrl:bibleConfig.apiUrl,
    pageId:'external-bible-ref',
    text,
    module:module || bibleConfig.module,
    useCommaDelimiter:bibleConfig.useCommaDelimiter,
    timeoutMs:bibleConfig.timeoutMs
  });
  const reference = parsed.paragraphs?.flatMap(paragraph => paragraph.references ?? [])[0];
  if (!reference) throw new Error(`BibleNote did not recognize reference: ${text}`);
  return {
    ...reference,
    normalizedRef:reference.normalized,
    originalText:reference.originalText || text
  };
}
