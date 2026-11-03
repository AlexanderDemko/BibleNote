import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const electron = require('electron');
const root = path.join(webDir, '.tmp', 'electron-startup');
fs.mkdirSync(root, { recursive:true });
const probe = path.join(root, 'probe.cjs');
fs.writeFileSync(probe, `
const launchedAt = Number(process.env.BIBLENOTE_STARTUP_LAUNCHED_AT);
const stamp = name => console.log('STARTUP_METRIC=' + JSON.stringify({name, ms:Date.now() - launchedAt}));
stamp('first-main-code');
const { app, BrowserWindow, Menu } = require('electron');
app.setPath('userData', process.env.BIBLENOTE_BENCH_USER_DATA);
if (process.env.BIBLENOTE_BENCH_NO_GPU === '1') app.disableHardwareAcceleration();
if (process.env.BIBLENOTE_BENCH_NO_MENU === '1') Menu.setApplicationMenu(null);
app.whenReady().then(async () => {
  stamp('electron-ready');
  const window = new BrowserWindow({show:false, webPreferences:{sandbox:true, contextIsolation:true, nodeIntegration:false}});
  stamp('window-created');
  await window.loadURL('data:text/html,<title>Startup probe</title><p>Ready</p>');
  stamp('renderer-loaded');
  app.quit();
});
`);

const runs = Math.max(1, Number(process.argv[2] || 3));
for (let index = 0; index < runs; index++) {
  const variants = ['default', 'no-menu', 'no-gpu'];
  // Rotate order so disk caches and first-launch cost do not favour one option.
  for (const variant of [...variants.slice(index % 3), ...variants.slice(0, index % 3)]) {
    const metrics = [];
    const launchedAt = Date.now();
    const env = { ...process.env,
      BIBLENOTE_STARTUP_LAUNCHED_AT:String(launchedAt),
      BIBLENOTE_BENCH_USER_DATA:path.join(root, `${variant}-${index}`),
      BIBLENOTE_BENCH_NO_MENU:variant === 'no-menu' ? '1' : '0',
      BIBLENOTE_BENCH_NO_GPU:variant === 'no-gpu' ? '1' : '0'
    };
    delete env.ELECTRON_RUN_AS_NODE;
    const child = spawn(electron, [probe], {cwd:webDir, env, windowsHide:true, stdio:['ignore', 'pipe', 'pipe']});
    let output = '';
    child.stdout.on('data', chunk => { output += chunk; });
    let stderr = '';
    child.stderr.on('data', chunk => { stderr += chunk; });
    const timeout = setTimeout(() => child.kill(), 20_000);
    const code = await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('exit', resolve);
    }).finally(() => clearTimeout(timeout));
    for (const line of output.split(/\r?\n/)) {
      if (line.startsWith('STARTUP_METRIC=')) metrics.push(JSON.parse(line.slice('STARTUP_METRIC='.length)));
    }
    if (code !== 0 || metrics.length !== 4) throw new Error(`Electron probe failed (${code}): ${stderr}\n${output}`);
    console.log(JSON.stringify({variant, run:index + 1, metrics}));
  }
}
