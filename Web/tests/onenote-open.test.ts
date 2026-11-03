import assert from 'node:assert/strict';
import { once } from 'node:events';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { startCacheUi } from '../src/cache-ui.js';

function serverUrl(server: http.Server): string {
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  return `http://127.0.0.1:${address.port}`;
}

async function closeServer(server: http.Server): Promise<void> {
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}

test('opening OneNote originals uses local object IDs before hyperlinks', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'biblenote-onenote-open-'));
  const previousApiUrl = process.env.BIBLENOTE_API_URL;
  const previousControlUrl = process.env.ONENOTE_ELECTRON_CONTROL_URL;
  const requests: Array<{ method: string; pathname: string; pageId: string | null; url: string | null }> = [];
  let navigationError = false;
  let activationError = false;
  let activationSucceeded = true;
  const upstream = http.createServer((request, response) => {
    const url = new URL(request.url || '/', 'http://127.0.0.1');
    response.setHeader('Content-Type', 'application/json');
    if (url.pathname === '/api/VerseParsing/Health') {
      response.end('{}');
      return;
    }
    requests.push({ method:request.method || '', pathname:url.pathname,
      pageId:url.searchParams.get('pageId'), url:url.searchParams.get('url') });
    if (url.pathname === '/onenote/activate') {
      response.statusCode = activationError ? 500 : 200;
      response.end(JSON.stringify(activationError ? { error:'Window activation unavailable.' } : { activated:activationSucceeded }));
      return;
    }
    if (url.pathname === '/api/OneNoteIntegration/OpenPage' || url.pathname === '/onenote/open-page') {
      response.statusCode = navigationError ? 500 : 200;
      response.end(JSON.stringify(navigationError ? { error:'OneNote object does not exist.' } : { opened:true }));
      return;
    }
    response.statusCode = 404;
    response.end(JSON.stringify({ error:'Unexpected hyperlink lookup.' }));
  });
  let ui: http.Server | undefined;
  try {
    upstream.listen(0, '127.0.0.1');
    await once(upstream, 'listening');
    process.env.BIBLENOTE_API_URL = serverUrl(upstream);
    process.env.ONENOTE_ELECTRON_CONTROL_URL = serverUrl(upstream);
    ui = startCacheUi({ dbPath:path.join(directory, 'cache.sqlite'), port:0 });
    await once(ui, 'listening');
    const endpoint = `${serverUrl(ui)}/api/system/open-onenote-page`;
    const pageId = '{AABBCCDD-1122-3344-5566-77889900AABB}{1}{B0}';
    const cloudUrl = 'onenote:https://d.docs.live.net/old-location/Раздел.one#Заметка';
    const open = (body: Record<string, unknown>) => fetch(endpoint, {
      method:'POST', headers:{ 'Content-Type':'application/json' }, body:JSON.stringify(body)
    });

    for (const url of [undefined, cloudUrl]) {
      await t.test(`local page opens through COM ${url ? 'despite a cached cloud URL' : 'without a URL'}`, async () => {
        requests.length = 0;
        const response = await open({ pageId, url });
        assert.equal(response.status, 200);
        assert.deepEqual(await response.json(), { opened:true });
        assert.deepEqual(requests, [
          { method:'POST', pathname:'/api/OneNoteIntegration/OpenPage', pageId, url:null },
          { method:'POST', pathname:'/onenote/activate', pageId:null, url:null }
        ]);
      });
    }

    await t.test('cloud pages keep opening their client URL', async () => {
      requests.length = 0;
      const response = await open({ pageId:'', url:cloudUrl });
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { opened:true });
      assert.deepEqual(requests, [
        { method:'POST', pathname:'/onenote/open-page', pageId:null, url:cloudUrl },
        { method:'POST', pathname:'/onenote/activate', pageId:null, url:null }
      ]);
    });

    for (const failsWithError of [false, true]) {
      await t.test(`successful navigation is preserved when activation ${failsWithError ? 'throws' : 'returns false'}`, async () => {
        requests.length = 0;
        activationError = failsWithError;
        activationSucceeded = false;
        try {
          const response = await open({ pageId });
          assert.equal(response.status, 200);
          assert.deepEqual(await response.json(), { opened:true });
          assert.deepEqual(requests, [
            { method:'POST', pathname:'/api/OneNoteIntegration/OpenPage', pageId, url:null },
            { method:'POST', pathname:'/onenote/activate', pageId:null, url:null }
          ]);
        } finally {
          activationError = false;
          activationSucceeded = true;
        }
      });
    }

    await t.test('COM failure is reported without opening the broken cloud link', async () => {
      requests.length = 0;
      navigationError = true;
      const response = await open({ pageId, url:cloudUrl });
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { error:'OneNote object does not exist.' });
      assert.deepEqual(requests, [{ method:'POST', pathname:'/api/OneNoteIntegration/OpenPage', pageId, url:null }]);
      navigationError = false;
    });

    await t.test('invalid targets never reach OneNote', async () => {
      requests.length = 0;
      for (const body of [{}, { url:'https://example.com' }, { pageId:pageId + 'x'.repeat(512), url:cloudUrl }]) {
        const response = await open(body);
        assert.equal(response.status, 400);
        await response.json();
      }
      assert.deepEqual(requests, []);
    });
  } finally {
    if (ui) await closeServer(ui);
    await closeServer(upstream);
    if (previousApiUrl === undefined) delete process.env.BIBLENOTE_API_URL;
    else process.env.BIBLENOTE_API_URL = previousApiUrl;
    if (previousControlUrl === undefined) delete process.env.ONENOTE_ELECTRON_CONTROL_URL;
    else process.env.ONENOTE_ELECTRON_CONTROL_URL = previousControlUrl;
    fs.rmSync(directory, { recursive:true, force:true });
  }
});
