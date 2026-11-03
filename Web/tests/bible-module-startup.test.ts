import assert from 'node:assert/strict';
import { once } from 'node:events';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { startCacheUi } from '../src/cache-ui.js';

test('the module list waits for the Bible engine during a cold startup', async () => {
  let ready = false;
  let starts = 0;
  let prematureModuleRequests = 0;
  const modules = [{ shortName:"bti'15", displayName:'Перевод Кулакова' }, { shortName:'rst', displayName:'Синодальный' }];
  const engine = http.createServer((request, response) => {
    response.setHeader('Content-Type', 'application/json');
    if (request.url === '/biblenote/ensure' && request.method === 'POST') {
      starts += 1;
      ready = true;
      response.end(JSON.stringify({ available:true }));
    } else if (request.url === '/api/VerseParsing/Health') {
      response.statusCode = ready ? 200 : 503;
      response.end(JSON.stringify(ready ? { status:'ok' } : { error:'Still starting' }));
    } else if (request.url === '/api/VerseParsing/Modules') {
      if (!ready) prematureModuleRequests += 1;
      response.statusCode = ready ? 200 : 503;
      response.end(JSON.stringify(ready ? modules : { error:'Still starting' }));
    } else {
      response.statusCode = 404;
      response.end('{}');
    }
  });
  engine.listen(0, '127.0.0.1');
  await once(engine, 'listening');
  const engineAddress = engine.address();
  assert.ok(engineAddress && typeof engineAddress !== 'string');
  const previous = {
    BIBLENOTE_API_URL:process.env.BIBLENOTE_API_URL,
    ONENOTE_ELECTRON_CONTROL_URL:process.env.ONENOTE_ELECTRON_CONTROL_URL
  };
  process.env.BIBLENOTE_API_URL = `http://127.0.0.1:${engineAddress.port}`;
  process.env.ONENOTE_ELECTRON_CONTROL_URL = process.env.BIBLENOTE_API_URL;
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'biblenote-module-startup-'));
  const server = startCacheUi({ dbPath:path.join(directory, 'cache.sqlite'), port:0 });
  if (!server.listening) await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  try {
    const result = await fetch(`http://127.0.0.1:${address.port}/api/biblenote/modules`).then(response => response.json());
    assert.equal(result.available, true, result.error);
    assert.deepEqual(result.modules, modules);
    assert.equal(starts, 1);
    assert.equal(prematureModuleRequests, 0);
  } finally {
    await Promise.all([server, engine].map(instance => new Promise<void>((resolve, reject) => {
      instance.close(error => error ? reject(error) : resolve());
      instance.closeAllConnections();
    })));
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    fs.rmSync(directory, { recursive:true, force:true });
  }
});
