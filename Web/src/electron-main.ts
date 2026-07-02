import './env.js';
import { app, BrowserWindow, dialog } from 'electron';
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const uiPort = Number(process.env.ONENOTE_CACHE_UI_PORT ?? '4312');
const electronControlPort = Number(process.env.ONENOTE_ELECTRON_CONTROL_PORT ?? String(uiPort + 1));
const bibleNotePort = Number(process.env.BIBLENOTE_API_PORT ?? '5000');
const bibleNoteUrl = process.env.BIBLENOTE_API_URL ?? `http://127.0.0.1:${bibleNotePort}`;
const bibleProtocol = 'isbtbibleverse';

let bibleNoteProcess: ChildProcess | undefined;
let uiProcess: ChildProcess | undefined;
let controlServer: http.Server | undefined;
let mainWindow: BrowserWindow | undefined;
let uiProcessLog = '';
let uiProcessExit: { code: number | null; signal: NodeJS.Signals | null } | undefined;
let startupStartedAt = Date.now();
let startupLogPath = '';
let pendingBibleLink = findBibleProtocolArg(process.argv);

function logStartup(message: string): void {
  const line = `[electron startup +${Date.now() - startupStartedAt}ms] ${message}`;
  console.log(line);
  if (startupLogPath) {
    try {
      fs.appendFileSync(startupLogPath, `${new Date().toISOString()} ${line}\n`, 'utf8');
    } catch {
      // Startup logging must not prevent the desktop shell from opening.
    }
  }
}

function request(url: string): Promise<{ statusCode: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.get(url, response => {
      const chunks: Buffer[] = [];
      response.on('data', chunk => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
      response.on('end', () => resolve({
        statusCode: response.statusCode ?? 0,
        body: Buffer.concat(chunks).toString('utf8')
      }));
    });
    req.on('error', reject);
    req.setTimeout(1500, () => {
      req.destroy(new Error(`Timed out while requesting ${url}`));
    });
  });
}

function findBibleProtocolArg(argv: string[]): string | undefined {
  return argv.find(arg => /^isbtBibleVerse:/i.test(arg));
}

function uiUrl(pathname = '/'): string {
  return `http://127.0.0.1:${uiPort}${pathname}`;
}

function uiBibleLinkUrl(link: string): string {
  return uiUrl(`/?openBibleRef=${encodeURIComponent(link)}`);
}

function registerBibleProtocolHandler(): boolean {
  if (process.defaultApp) {
    return app.setAsDefaultProtocolClient(bibleProtocol, process.execPath, [path.resolve(process.argv[1] ?? '')]);
  }
  return app.setAsDefaultProtocolClient(bibleProtocol);
}

function bibleProtocolStatus(): { available: boolean; registered: boolean; protocol: string } {
  return {
    available:true,
    registered:app.isDefaultProtocolClient(bibleProtocol),
    protocol:'isbtBibleVerse'
  };
}

async function openBibleLink(link: string): Promise<void> {
  pendingBibleLink = link;
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.focus();
  await waitForCacheUi(45000);
  const nextLink = pendingBibleLink;
  pendingBibleLink = undefined;
  if (nextLink) await mainWindow.loadURL(uiBibleLinkUrl(nextLink));
}

function startControlServer(): void {
  if (controlServer) return;
  controlServer = http.createServer((request, response) => {
    const url = new URL(request.url ?? '/', `http://${request.headers.host ?? `127.0.0.1:${electronControlPort}`}`);
    const send = (status: number, value: unknown) => {
      response.writeHead(status, {
        'Content-Type':'application/json; charset=utf-8',
        'Cache-Control':'no-store',
        'X-Content-Type-Options':'nosniff'
      });
      response.end(JSON.stringify(value));
    };

    if (url.pathname === '/protocol/status' && request.method === 'GET') {
      send(200, bibleProtocolStatus());
      return;
    }
    if (url.pathname === '/protocol/register' && request.method === 'POST') {
      const ok = registerBibleProtocolHandler();
      send(200, { ...bibleProtocolStatus(), registered:ok && app.isDefaultProtocolClient(bibleProtocol) });
      return;
    }
    send(404, { error:'Not found.' });
  });
  controlServer.listen(electronControlPort, '127.0.0.1', () => {
    logStartup(`electron control listening port=${electronControlPort}`);
  });
}

async function waitForHttp(url: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      const result = await request(url);
      if (result.statusCode >= 200 && result.statusCode < 500) return;
      lastError = new Error(`HTTP ${result.statusCode}: ${result.body.slice(0, 300)}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

async function isBibleNoteHealthy(): Promise<boolean> {
  try {
    const result = await request(`${bibleNoteUrl}/api/VerseParsing/Health`);
    return result.statusCode === 200;
  } catch {
    return false;
  }
}

function existingPath(...parts: string[]): string | undefined {
  for (const candidate of parts) {
    if (candidate && fs.existsSync(candidate)) return candidate;
  }
  return undefined;
}

function bibleNoteExecutablePath(): string | undefined {
  const packagedPath = process.resourcesPath
    ? path.join(process.resourcesPath, 'BibleNote', 'BibleNote.Application.exe')
    : '';
  const devPath = path.resolve(__dirname, '..', '..', 'BibleNote', 'Application', 'bin', 'Debug', 'net10.0', 'BibleNote.Application.exe');
  const releasePath = path.resolve(__dirname, '..', '..', 'BibleNote', 'Application', 'bin', 'Release', 'net10.0', 'BibleNote.Application.exe');
  return existingPath(process.env.BIBLENOTE_EXE_PATH ?? '', packagedPath, releasePath, devPath);
}

function nodeExecutablePath(): string {
  const packagedPath = process.resourcesPath
    ? path.join(process.resourcesPath, 'node', 'node.exe')
    : '';
  return existingPath(process.env.NODE_EXE_PATH ?? '', packagedPath, 'node') ?? 'node';
}

function cacheUiScriptPath(): string {
  return path.join(__dirname, 'cache-ui.js');
}

function appIconPath(): string {
  return path.resolve(__dirname, '..', 'assets', 'biblenote.ico');
}

function startBibleNote(): void {
  const env = {
    ...process.env,
    ASPNETCORE_ENVIRONMENT: process.env.ASPNETCORE_ENVIRONMENT ?? 'Development',
    BIBLENOTE_API_URL: bibleNoteUrl
  };
  const exe = bibleNoteExecutablePath();
  if (exe) {
    bibleNoteProcess = spawn(exe, ['--urls', bibleNoteUrl], {
      cwd: path.dirname(exe),
      env,
      windowsHide: true,
      stdio: 'ignore'
    });
    return;
  }

  const projectDir = path.resolve(__dirname, '..', '..', 'BibleNote', 'Application');
  bibleNoteProcess = spawn('dotnet', ['run', '--no-build', '--launch-profile', 'Application', '--', '--urls', bibleNoteUrl], {
    cwd: projectDir,
    env,
    windowsHide: true,
    stdio: 'ignore'
  });
}

async function ensureBibleNote(): Promise<void> {
  if (await isBibleNoteHealthy()) return;
  startBibleNote();
  await waitForHttp(`${bibleNoteUrl}/api/VerseParsing/Health`, 30000);
}

function rememberUiLog(chunk: Buffer | string): void {
  const text = chunk.toString();
  uiProcessLog = `${uiProcessLog}${text}`.slice(-4000);
  if (startupLogPath) {
    try {
      fs.appendFileSync(startupLogPath, text, 'utf8');
    } catch {
      // Ignore logging failures.
    }
  }
}

function startBibleNoteInBackground(): void {
  ensureBibleNote().catch(error => {
    const message = error instanceof Error ? error.stack ?? error.message : String(error);
    console.warn(`BibleNote did not become ready in the background: ${message}`);
  });
}

function startCacheUiProcess(): void {
  const uiScript = cacheUiScriptPath();
  const uiArgs = [uiScript, '--port', String(uiPort)];
  if (process.env.ONENOTE_CACHE_DB) {
    uiArgs.push('--db', process.env.ONENOTE_CACHE_DB);
  }
  uiProcess = spawn(nodeExecutablePath(), uiArgs, {
    cwd: path.resolve(__dirname, '..'),
    env: {
      ...process.env,
      BIBLENOTE_API_URL: bibleNoteUrl,
      ONENOTE_ELECTRON_CONTROL_URL: `http://127.0.0.1:${electronControlPort}`,
      ONENOTE_STARTUP_TIMING: '1',
      ONENOTE_STARTUP_LOG: startupLogPath
    },
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe']
  });

  uiProcess.stdout?.on('data', rememberUiLog);
  uiProcess.stderr?.on('data', rememberUiLog);
  uiProcess.on('exit', (code, signal) => {
    uiProcessExit = { code, signal };
    logStartup(`cache ui process exited code=${code ?? 'null'} signal=${signal ?? 'null'}`);
  });
}

async function waitForCacheUi(timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;
  while (Date.now() < deadline) {
    if (uiProcessExit) {
      throw new Error(`Cache UI process exited with code ${uiProcessExit.code ?? 'null'} signal ${uiProcessExit.signal ?? 'null'}.\n${uiProcessLog}`);
    }
    try {
      const result = await request(`http://127.0.0.1:${uiPort}/`);
      if (result.statusCode >= 200 && result.statusCode < 500) return;
      lastError = new Error(`HTTP ${result.statusCode}: ${result.body.slice(0, 300)}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise(resolve => setTimeout(resolve, 300));
  }
  const suffix = uiProcessLog ? `\n\nCache UI log:\n${uiProcessLog}` : '';
  throw lastError instanceof Error ? new Error(`${lastError.message}${suffix}`) : new Error(`${String(lastError)}${suffix}`);
}

function loadingHtml(): string {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>OneNote Bible Explorer</title>
  <style>
    body { margin: 0; height: 100vh; display: grid; place-items: center; background: #151216; color: #f4edf0; font-family: "Segoe UI", sans-serif; }
    main { display: grid; gap: 10px; text-align: center; }
    .spinner { width: 34px; height: 34px; margin: 0 auto; border: 3px solid #4b3d46; border-top-color: #8b5cf6; border-radius: 50%; animation: spin 900ms linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
  </style>
</head>
<body><main><div class="spinner"></div><div>Starting OneNote Bible Explorer...</div></main></body>
</html>`;
}

async function createWindow(): Promise<void> {
  startupStartedAt = Date.now();
  startupLogPath = path.join(app.getPath('userData'), 'startup.log');
  try {
    fs.mkdirSync(path.dirname(startupLogPath), { recursive: true });
    fs.writeFileSync(startupLogPath, `${new Date().toISOString()} startup log\n`, 'utf8');
  } catch {
    startupLogPath = '';
  }
  logStartup('createWindow start');
  process.env.BIBLENOTE_API_URL = bibleNoteUrl;
  startControlServer();

  mainWindow = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 980,
    minHeight: 640,
    title: 'OneNote Bible Explorer',
    icon: appIconPath(),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  logStartup('browser window created');

  await mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(loadingHtml())}`);
  logStartup('loading page shown');

  startCacheUiProcess();
  logStartup('cache ui process spawned');
  startBibleNoteInBackground();
  logStartup('BibleNote background startup requested');
  await waitForCacheUi(45000);
  logStartup('cache ui http ready');

  const firstBibleLink = pendingBibleLink;
  pendingBibleLink = undefined;
  await mainWindow.loadURL(firstBibleLink ? uiBibleLinkUrl(firstBibleLink) : uiUrl('/'));
  logStartup('main ui loaded');
}

app.on('window-all-closed', () => {
  app.quit();
});

app.on('before-quit', () => {
  controlServer?.close();
  if (uiProcess && !uiProcess.killed) {
    uiProcess.kill();
  }
  if (bibleNoteProcess && !bibleNoteProcess.killed) {
    bibleNoteProcess.kill();
  }
});

const singleInstanceLock = app.requestSingleInstanceLock();
if (!singleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', (_event, argv) => {
    const bibleLink = findBibleProtocolArg(argv);
    if (bibleLink) {
      openBibleLink(bibleLink).catch(error => {
        const message = error instanceof Error ? error.stack ?? error.message : String(error);
        dialog.showErrorBox('OneNote Bible Explorer failed to open Bible link', message);
      });
    } else if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

app.on('open-url', (event, url) => {
  event.preventDefault();
  if (/^isbtBibleVerse:/i.test(url)) {
    openBibleLink(url).catch(error => {
      const message = error instanceof Error ? error.stack ?? error.message : String(error);
      dialog.showErrorBox('OneNote Bible Explorer failed to open Bible link', message);
    });
  }
});

if (singleInstanceLock) {
  app.whenReady()
    .then(createWindow)
    .catch(error => {
      const message = error instanceof Error ? error.stack ?? error.message : String(error);
      dialog.showErrorBox('OneNote Bible Explorer failed to start', message);
      app.quit();
    });
}
