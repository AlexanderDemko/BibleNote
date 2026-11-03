import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { seedCache } from '../e2e/fixtures/seed-cache.ts';
import { startFakeBibleNoteApi } from '../e2e/fixtures/fake-services.ts';

const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const root = path.join(webDir, '.tmp', 'app-startup');
fs.mkdirSync(root, { recursive:true });
const runner = path.join(root, 'runner.cjs');
fs.writeFileSync(runner, `
const {app, BrowserWindow} = require('electron');
app.setPath('userData', process.env.BIBLENOTE_BENCH_USER_DATA);
const cp = require('node:child_process');
const originalExecFile = cp.execFile;
cp.execFile = function(file, ...args) {
  if (file.includes('OneNoteRibbon.Registrar')) {
    setImmediate(() => args.at(-1)(null, '{"available":false}', ''));
    return {};
  }
  return originalExecFile.call(this, file, ...args);
};
require('node:module').syncBuiltinESMExports();
const stamp = name => console.log('APP_METRIC=' + JSON.stringify({name,ms:Date.now()-Number(process.env.BIBLENOTE_STARTUP_LAUNCHED_AT)}));
stamp('first-main-code');
app.whenReady().then(() => stamp('electron-ready'));
const originalLog = console.log;
console.log = function(...args) {
  originalLog(...args);
  if (String(args[0]).includes('main ui cache ready')) {
    stamp('cache-ready');
    const timer = setInterval(async () => {
      const window = BrowserWindow.getAllWindows()[0];
      const ready = await window.webContents.executeJavaScript("document.getElementById('status')?.textContent && !document.getElementById('status').textContent.includes('Загрузка') && document.getElementById('tree').children.length > 0").catch(() => false);
      if (ready) { clearInterval(timer); stamp('notes-ready'); app.quit(); }
    }, 20);
  }
};
import(process.env.BIBLENOTE_BENCH_ENTRY).catch(error => { console.error(error); app.exit(1); });
`);
const api = await startFakeBibleNoteApi();
try {
  for (let index = 0; index < Number(process.argv[2] || 3); index++) {
    const directory = fs.mkdtempSync(path.join(root, 'run-'));
    const dbPath = path.join(directory, 'cache.sqlite');
    seedCache(dbPath);
    const env = {...process.env,
      BIBLENOTE_TEST_ISOLATED:'1', BIBLENOTE_E2E:'1', BIBLENOTE_API_URL:api.baseUrl,
      BIBLENOTE_E2E_GRAPH_ACCESS_TOKEN:'benchmark-token',
      BIBLENOTE_BENCH_USER_DATA:path.join(directory, 'profile'),
      BIBLENOTE_BENCH_ENTRY:pathToFileURL(path.join(webDir, 'dist', 'electron-main.js')).href,
      ONENOTE_CACHE_DB:dbPath, ONENOTE_CACHE_UI_PORT:String(24312 + index * 2),
      ONENOTE_TOKEN_CACHE:path.join(directory, 'msal-cache.json'),
      ONENOTE_DATA_SOURCE:'graph', ONENOTE_BIBLE_PARSE_ENABLED:'false',
      BIBLENOTE_DATA_SOURCES:Buffer.from(JSON.stringify([{type:'graph', id:'source:graph', displayName:'OneNote Cloud'}])).toString('base64url'),
      BIBLENOTE_STARTUP_LAUNCHED_AT:String(Date.now())
    };
    delete env.ELECTRON_RUN_AS_NODE;
    const child = spawn(require('electron'), [runner], {cwd:webDir, env, windowsHide:true, stdio:['ignore','pipe','pipe']});
    let output = '';
    child.stdout.on('data', chunk => { output += chunk; });
    child.stderr.on('data', chunk => { output += chunk; });
    const timer = setTimeout(() => child.kill(), 30000);
    const code = await new Promise((resolve,reject) => { child.once('exit',resolve); child.once('error',reject); }).finally(() => clearTimeout(timer));
    const metrics = output.split(/\r?\n/).filter(line => line.startsWith('APP_METRIC=')).map(line => JSON.parse(line.slice(11)));
    fs.writeFileSync(path.join(directory, 'output.log'), output);
    if (code !== 0 || metrics.length !== 4) throw new Error(`App benchmark failed (${code}): ${output}`);
    console.log(JSON.stringify({run:index+1,metrics,log:path.join(directory,'output.log')}));
  }
} finally { await api.close(); }
