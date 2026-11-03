import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import fs from 'node:fs/promises';
import http from 'node:http';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { downloadElectronArtifactZip } = require('app-builder-lib/out/util/electronGet.js');

test('electron-builder downloader preserves artifact bytes, checksums and cache with the security override', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'biblenote-downloader-'));
  const artifact = Buffer.from('BibleNote downloader compatibility fixture');
  const checksum = createHash('sha256').update(artifact).digest('hex');
  let requests = 0;
  const server = http.createServer((_request, response) => {
    requests++;
    response.writeHead(200, { 'Content-Length': artifact.length });
    response.end(artifact);
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const options = {
    version: '42.11.10', platformName: 'win32', arch: 'x64', artifactName: 'electron',
    cacheDir: directory,
    electronDownload: {
      checksums: { 'electron-v42.11.10-win32-x64.zip': checksum },
      mirrorOptions: { resolveAssetURL: async () => `http://127.0.0.1:${address.port}/artifact.zip` },
      downloadOptions: { quiet: true }
    }
  };
  try {
    const first = await downloadElectronArtifactZip(options);
    assert.deepEqual(await fs.readFile(first), artifact);
    const requestCount = requests;
    const cached = await downloadElectronArtifactZip(options);
    assert.deepEqual(await fs.readFile(cached), artifact);
    assert.equal(requests, requestCount, 'cached download must not hit the server again');
    await assert.rejects(downloadElectronArtifactZip({
      ...options,
      cacheDir: path.join(directory, 'invalid-checksum'),
      electronDownload: {
        ...options.electronDownload,
        checksums: { 'electron-v42.11.10-win32-x64.zip': '0'.repeat(64) }
      }
    }), /checksum/i);
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    await fs.rm(directory, { recursive: true, force: true });
  }
});
