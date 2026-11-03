import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as nodeModule from 'node:module';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { startCacheUi } from '../src/cache-ui.js';

test('loading the cache server does not activate document parsers or Microsoft authorization', {
  skip:typeof (nodeModule as any).registerHooks !== 'function'
}, () => {
  const script = `
    import { registerHooks } from 'node:module';
    import assert from 'node:assert/strict';
    registerHooks({resolve(specifier, context, next) {
      if (/^(?:@azure\\/msal-node|pdfjs-dist|mammoth|jszip)(?:\\/|$)/.test(specifier))
        throw new Error('DEFERRED_PARSER:' + specifier);
      return next(specifier, context);
    }});
    await import('./src/cache-ui.ts');
    // Confirm that the guard actually detects all four parser families.
    for (const specifier of ['@azure/msal-node', 'pdfjs-dist/legacy/build/pdf.mjs', 'mammoth', 'jszip'])
      await assert.rejects(import(specifier), /DEFERRED_PARSER:/);
  `;
  const result = spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', script], {
    cwd:fileURLToPath(new URL('../', import.meta.url)),
    env:{...process.env, BIBLENOTE_TEST_ISOLATED:'1'}, encoding:'utf8', timeout:20000
  });
  assert.equal(result.status, 0, result.stderr || result.error?.message);
});

test('deferred startup serves the shell and assets before opening the notes cache', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'biblenote-startup-'));
  const server = startCacheUi({ dbPath:path.join(directory, 'cache.sqlite'), port:0, deferDbInit:true });
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const baseUrl = `http://127.0.0.1:${address.port}`;
  try {
    assert.match(await fetch(baseUrl).then(response => response.text()), /id="app"/);
    const script = await fetch(`${baseUrl}/ui/bootstrap.js`);
    assert.equal(script.status, 200);
    assert.match(await script.text(), /document.getElementById/);
    assert.equal((await fetch(`${baseUrl}/api/startup`).then(response => response.json())).ready, false);
    assert.equal((await fetch(`${baseUrl}/api/notebooks`)).status, 503);
    // A foreign page cannot trigger initialization through the new POST route.
    assert.equal((await fetch(`${baseUrl}/api/startup`, {method:'POST', headers:{Origin:'https://foreign.example'}})).status, 403);
    const scheduled = await fetch(`${baseUrl}/api/startup`, {method:'POST'}).then(response => response.json());
    assert.equal(scheduled.starting, true);
    await fetch(`${baseUrl}/api/startup`, {method:'POST'});
    assert.equal((await fetch(`${baseUrl}/api/startup`).then(response => response.json())).ready, true);
    assert.deepEqual(await fetch(`${baseUrl}/api/notebooks`).then(response => response.json()), []);
  } finally {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
    fs.rmSync(directory, {recursive:true, force:true});
  }
});

test('PDF assets load on demand and cannot escape their image directory', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'biblenote-startup-assets-'));
  const server = startCacheUi({dbPath:path.join(directory, 'cache.sqlite'), port:0, deferDbInit:true});
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const baseUrl = `http://127.0.0.1:${address.port}`;
  try {
    for (const asset of ['/vendor/pdfjs/pdf.min.mjs', '/vendor/pdfjs/pdf.worker.min.mjs', '/vendor/pdfjs/images/loading-icon.gif']) {
      const response = await fetch(baseUrl + asset);
      assert.equal(response.status, 200);
    }
    const imageDir = path.resolve('node_modules/pdfjs-dist/web/images');
    const image = fs.readdirSync(imageDir).find(name => name.endsWith('.svg'))!;
    const first = await fetch(`${baseUrl}/vendor/pdfjs/images/${image}`).then(response => response.text());
    assert.equal(first, fs.readFileSync(path.join(imageDir, image), 'utf8'));
    assert.equal(await fetch(`${baseUrl}/vendor/pdfjs/images/${image}`).then(response => response.text()), first);
    assert.equal((await fetch(`${baseUrl}/vendor/pdfjs/images/%2e%2e%2fpackage.json`)).status, 404);
    assert.equal((await fetch(`${baseUrl}/api/startup`).then(response => response.json())).ready, false);
  } finally {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
    fs.rmSync(directory, {recursive:true, force:true});
  }
});
