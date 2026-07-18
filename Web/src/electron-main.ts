import './env.js';
import { app, BrowserWindow, dialog, Menu, MenuItem } from 'electron';
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { listenOnLoopbackWithFallback } from './loopback-server.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const uiPort = Number(process.env.ONENOTE_CACHE_UI_PORT ?? '4312');
let electronControlPort = Number(process.env.ONENOTE_ELECTRON_CONTROL_PORT ?? String(uiPort + 1));
const bibleNotePort = Number(process.env.BIBLENOTE_API_PORT ?? '5000');
const bibleNoteUrl = process.env.BIBLENOTE_API_URL ?? `http://127.0.0.1:${bibleNotePort}`;
const bibleProtocol = 'isbtbibleverse';

let bibleNoteProcess: ChildProcess | undefined;
let uiProcess: ChildProcess | undefined;
let controlServer: http.Server | undefined;
let mainWindow: BrowserWindow | undefined;
let biblePopupWindow: BrowserWindow | undefined;
let bibleNoteEnsurePromise: Promise<void> | undefined;
let uiProcessLog = '';
let uiProcessExit: { code: number | null; signal: NodeJS.Signals | null } | undefined;
let startupStartedAt = Date.now();
let startupLogPath = '';
let pendingBibleLink = findBibleProtocolArg(process.argv);
let rendererRecoveryPromise: Promise<void> | undefined;
let rendererUnresponsiveTimer: NodeJS.Timeout | undefined;
let rendererHealthTimer: NodeJS.Timeout | undefined;
let rendererHealthFailures = 0;
let rendererRecoveryAttempts: number[] = [];
let isQuitting = false;

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

function uiBiblePopupUrl(link: string): string {
  return uiUrl(`/?bibleVersePopup=1&openBibleRef=${encodeURIComponent(link)}`);
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
  logStartup('bible link received');
  pendingBibleLink = link;
  await waitForCacheUi(45000);
  const nextLink = pendingBibleLink;
  pendingBibleLink = undefined;
  if (!nextLink) return;
  let popup = biblePopupWindow;
  if (!popup || popup.isDestroyed()) {
    popup = createBiblePopupWindow();
    biblePopupWindow = popup;
  } else if (popup.webContents.getURL().startsWith(uiUrl('/'))) {
    const script = `typeof window.bibleNoteOpenBibleRef === 'function' ? Promise.resolve(window.bibleNoteOpenBibleRef(${JSON.stringify(nextLink)})).then(() => true) : false`;
    const handled = await popup.webContents.executeJavaScript(script, true);
    if (handled) {
      if (popup.isMinimized()) popup.restore();
      popup.show();
      popup.focus();
      logStartup('bible link opened in existing popup');
      return;
    }
  }
  logStartup('bible link requires popup navigation');
  await popup.loadURL(uiBiblePopupUrl(nextLink));
  if (popup.isDestroyed()) return;
  popup.show();
  popup.focus();
}

async function startControlServer(): Promise<void> {
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
    if (url.pathname === '/biblenote/ensure' && request.method === 'POST') {
      ensureBibleNote().then(() => {
        send(200, { available:true, url:bibleNoteUrl });
      }).catch(error => {
        send(500, { available:false, error:error instanceof Error ? error.message : String(error) });
      });
      return;
    }
    if (url.pathname === '/main/bible-action' && request.method === 'POST') {
      const action = url.searchParams.get('action');
      const rawRef = url.searchParams.get('ref');
      let ref: unknown;
      try {
        ref = rawRef ? JSON.parse(rawRef) : undefined;
      } catch {
        send(400, { error:'Invalid Bible reference.' });
        return;
      }
      if ((action !== 'reader' && action !== 'notes') || !ref || typeof ref !== 'object' || Array.isArray(ref)) {
        send(400, { error:'A valid Bible action and reference are required.' });
        return;
      }
      const target = mainWindow;
      if (!target || target.isDestroyed()) {
        send(503, { error:'The main BibleNote window is not available.' });
        return;
      }
      const serializedRef = JSON.stringify(ref);
      const script = action === 'reader'
        ? `Promise.resolve(openBibleTextInReader(${serializedRef})).then(() => true)`
        : `Promise.resolve((bibleTextDialog.open && bibleTextDialog.close(), showBibleReaderVerseNotes(${serializedRef}))).then(() => true)`;
      if (target.isMinimized()) target.restore();
      target.show();
      target.focus();
      target.webContents.executeJavaScript(script, true).then(() => {
        send(200, { opened:true, action });
      }).catch(error => {
        send(500, { error:error instanceof Error ? error.message : String(error) });
      });
      return;
    }
    send(404, { error:'Not found.' });
  });
  const preferredPort = electronControlPort;
  try {
    const result = await listenOnLoopbackWithFallback(controlServer, preferredPort);
    electronControlPort = result.port;
    if (result.usedFallback) {
      logStartup(`electron control port ${preferredPort} already in use; using port=${electronControlPort}`);
    } else {
      logStartup(`electron control listening port=${electronControlPort}`);
    }
    controlServer.on('error', error => {
      logStartup(`electron control server error: ${error.message}`);
    });
  } catch (error) {
    controlServer = undefined;
    throw error;
  }
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
    logStartup(`starting BibleNote API exe=${exe}`);
    bibleNoteProcess = spawn(exe, ['--urls', bibleNoteUrl], {
      cwd: path.dirname(exe),
      env,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    bibleNoteProcess.stdout?.on('data', chunk => rememberUiLog(`[biblenote] ${chunk}`));
    bibleNoteProcess.stderr?.on('data', chunk => rememberUiLog(`[biblenote] ${chunk}`));
    bibleNoteProcess.on('error', error => logStartup(`BibleNote API process error: ${error.message}`));
    bibleNoteProcess.on('exit', (code, signal) => logStartup(`BibleNote API process exited code=${code ?? 'null'} signal=${signal ?? 'null'}`));
    return;
  }

  const projectDir = path.resolve(__dirname, '..', '..', 'BibleNote', 'Application');
  logStartup(`starting BibleNote API via dotnet cwd=${projectDir}`);
  bibleNoteProcess = spawn('dotnet', ['run', '--no-build', '--launch-profile', 'Application', '--', '--urls', bibleNoteUrl], {
    cwd: projectDir,
    env,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe']
  });
  bibleNoteProcess.stdout?.on('data', chunk => rememberUiLog(`[biblenote] ${chunk}`));
  bibleNoteProcess.stderr?.on('data', chunk => rememberUiLog(`[biblenote] ${chunk}`));
  bibleNoteProcess.on('error', error => logStartup(`BibleNote API process error: ${error.message}`));
  bibleNoteProcess.on('exit', (code, signal) => logStartup(`BibleNote API process exited code=${code ?? 'null'} signal=${signal ?? 'null'}`));
}

async function ensureBibleNote(): Promise<void> {
  if (await isBibleNoteHealthy()) return;
  if (!bibleNoteEnsurePromise) {
    bibleNoteEnsurePromise = (async () => {
      startBibleNote();
      await waitForHttp(`${bibleNoteUrl}/api/VerseParsing/Health`, 30000);
    })().finally(() => {
      bibleNoteEnsurePromise = undefined;
    });
  }
  await bibleNoteEnsurePromise;
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
      BIBLENOTE_EXE_PATH: bibleNoteExecutablePath() ?? '',
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
  <title>BibleNote</title>
  <style>
    body { margin: 0; height: 100vh; display: grid; place-items: center; background: #151216; color: #f4edf0; font-family: "Segoe UI", sans-serif; }
    main { display: grid; gap: 10px; text-align: center; }
    .spinner { width: 34px; height: 34px; margin: 0 auto; border: 3px solid #4b3d46; border-top-color: #8b5cf6; border-radius: 50%; animation: spin 900ms linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
  </style>
</head>
<body><main><div class="spinner"></div><div>Starting BibleNote...</div></main></body>
</html>`;
}

function installApplicationMenu(): void {
  const menu = Menu.getApplicationMenu();
  if (!menu || menu.items.some(item => item.id === 'biblenote-help')) return;

  menu.append(new MenuItem({
    id: 'biblenote-help',
    label: 'Help',
    submenu: [
      {
        id: 'biblenote-about',
        label: 'About BibleNote',
        click: () => {
          void dialog.showMessageBox({
            type: 'info',
            title: 'About BibleNote',
            message: `BibleNote ${app.getVersion()}`,
            detail: 'Desktop and OneNote cache application.',
            buttons: ['OK']
          });
        }
      }
    ]
  }));
  Menu.setApplicationMenu(menu);
}

function createBrowserWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 720,
    minHeight: 480,
    title: 'BibleNote',
    icon: appIconPath(),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  window.webContents.on('render-process-gone', (_event, details) => {
    logStartup(`renderer process gone reason=${details.reason} exitCode=${details.exitCode}`);
    if (mainWindow === window) void recoverRenderer(`renderer-${details.reason}`);
  });
  window.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedUrl, isMainFrame) => {
    if (!isMainFrame || errorCode === -3) return;
    logStartup(`main ui load failed code=${errorCode} description=${errorDescription} url=${validatedUrl}`);
    if (mainWindow === window) void recoverRenderer(`load-failed-${errorCode}`);
  });
  window.on('unresponsive', () => {
    logStartup('renderer became unresponsive');
    if (mainWindow !== window) return;
    if (rendererUnresponsiveTimer) clearTimeout(rendererUnresponsiveTimer);
    rendererUnresponsiveTimer = setTimeout(() => {
      rendererUnresponsiveTimer = undefined;
      if (mainWindow === window) void recoverRenderer('unresponsive-timeout');
    }, 10_000);
  });
  window.on('responsive', () => {
    logStartup('renderer became responsive');
    if (rendererUnresponsiveTimer) {
      clearTimeout(rendererUnresponsiveTimer);
      rendererUnresponsiveTimer = undefined;
    }
  });
  window.on('closed', () => {
    if (mainWindow === window) mainWindow = undefined;
  });

  return window;
}

function createBiblePopupWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width:720,
    height:520,
    minWidth:440,
    minHeight:300,
    show:false,
    autoHideMenuBar:true,
    title:'Библейский текст',
    icon:appIconPath(),
    backgroundColor:'#18171c',
    webPreferences: {
      contextIsolation:true,
      nodeIntegration:false,
      sandbox:true
    }
  });

  window.webContents.setWindowOpenHandler(() => ({ action:'deny' }));
  window.on('closed', () => {
    if (biblePopupWindow === window) biblePopupWindow = undefined;
  });
  return window;
}

async function showLoadingPage(window: BrowserWindow): Promise<void> {
  await window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(loadingHtml())}`);
}

function startRendererHealthMonitor(): void {
  if (rendererHealthTimer) return;
  rendererHealthTimer = setInterval(() => {
    void (async () => {
      const window = mainWindow;
      if (isQuitting || rendererRecoveryPromise || !window || window.isDestroyed()) return;
      if (!window.webContents.getURL().startsWith(uiUrl('/'))) return;

      try {
        const healthy = await Promise.race([
          window.webContents.executeJavaScript(
            `document.readyState === 'complete' && Boolean(document.getElementById('syncState'))`,
            true
          ),
          new Promise<boolean>((_resolve, reject) => {
            setTimeout(() => reject(new Error('renderer health check timed out')), 5_000);
          })
        ]);
        if (!healthy) throw new Error('renderer UI marker is missing');
        rendererHealthFailures = 0;
      } catch (error) {
        if (window !== mainWindow || isQuitting) return;
        rendererHealthFailures++;
        const message = error instanceof Error ? error.message : String(error);
        logStartup(`renderer health check failed count=${rendererHealthFailures}: ${message}`);
        if (rendererHealthFailures >= 2) void recoverRenderer('health-check');
      }
    })();
  }, 15_000);
}

async function recoverRenderer(reason: string): Promise<void> {
  if (isQuitting) return;
  if (rendererRecoveryPromise) return rendererRecoveryPromise;

  const now = Date.now();
  rendererRecoveryAttempts = rendererRecoveryAttempts.filter(attempt => now - attempt < 60_000);
  if (rendererRecoveryAttempts.length >= 3) {
    logStartup(`renderer recovery suppressed after ${rendererRecoveryAttempts.length} attempts in 60s reason=${reason}`);
    dialog.showErrorBox(
      'BibleNote could not restore its window',
      'The interface failed repeatedly. The background cache process is still running; open http://127.0.0.1:4312/ in a browser.'
    );
    return;
  }
  rendererRecoveryAttempts.push(now);

  rendererRecoveryPromise = (async () => {
    const oldWindow = mainWindow;
    const previousUrl = oldWindow && !oldWindow.isDestroyed()
      ? oldWindow.webContents.getURL()
      : '';
    const targetUrl = previousUrl.startsWith(uiUrl('/')) ? previousUrl : uiUrl('/');
    logStartup(`renderer recovery start reason=${reason} target=${targetUrl}`);

    const replacement = createBrowserWindow();
    mainWindow = replacement;
    await showLoadingPage(replacement);
    await waitForCacheUi(15_000);
    await replacement.loadURL(targetUrl);
    rendererHealthFailures = 0;
    logStartup('renderer recovery complete');

    if (oldWindow && oldWindow !== replacement && !oldWindow.isDestroyed()) {
      oldWindow.destroy();
    }
  })().catch(error => {
    const message = error instanceof Error ? error.stack ?? error.message : String(error);
    logStartup(`renderer recovery failed: ${message}`);
    dialog.showErrorBox('BibleNote failed to restore its window', message);
  }).finally(() => {
    rendererRecoveryPromise = undefined;
  });

  return rendererRecoveryPromise;
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
  const protocolRegistered = registerBibleProtocolHandler();
  logStartup(`bible protocol registration requested result=${protocolRegistered} registered=${app.isDefaultProtocolClient(bibleProtocol)}`);
  installApplicationMenu();
  await startControlServer();

  mainWindow = createBrowserWindow();
  startRendererHealthMonitor();
  logStartup('browser window created');

  await showLoadingPage(mainWindow);
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
  isQuitting = true;
  if (rendererUnresponsiveTimer) {
    clearTimeout(rendererUnresponsiveTimer);
    rendererUnresponsiveTimer = undefined;
  }
  if (rendererHealthTimer) {
    clearInterval(rendererHealthTimer);
    rendererHealthTimer = undefined;
  }
  controlServer?.close();
  if (uiProcess && !uiProcess.killed) {
    uiProcess.kill();
  }
  if (bibleNoteProcess && !bibleNoteProcess.killed) {
    bibleNoteProcess.kill();
  }
});

app.on('child-process-gone', (_event, details) => {
  logStartup(`electron child process gone type=${details.type} reason=${details.reason} exitCode=${details.exitCode}`);
  if (!isQuitting && mainWindow && details.type === 'GPU' && details.reason !== 'clean-exit') {
    void recoverRenderer(`gpu-${details.reason}`);
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
        dialog.showErrorBox('BibleNote failed to open Bible link', message);
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
      dialog.showErrorBox('BibleNote failed to open Bible link', message);
    });
  }
});

if (singleInstanceLock) {
  app.whenReady()
    .then(createWindow)
    .catch(error => {
      const message = error instanceof Error ? error.stack ?? error.message : String(error);
      dialog.showErrorBox('BibleNote failed to start', message);
      app.quit();
    });
}
